const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');

const router = express.Router();

const puedeEditar = requireRol(ROLES.ENCARGADO_GENERAL);

function finDeMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// ── GET /:localId/:mes ────────────────────────────────────────────────────────
// La grilla del mes: las posiciones del local como filas, los días como columnas,
// y lo asignado en cada celda.

router.get('/:localId/:mes', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { localId, mes } = req.params;
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ ok: false, error: 'Mes inválido (usá YYYY-MM)' });
    }
    const desde = `${mes}-01`, hasta = finDeMes(mes);

    const local = (await pool.query('SELECT id, nombre, tipo FROM locales WHERE id = $1', [localId])).rows[0];
    if (!local) return res.status(404).json({ ok: false, error: 'Local no encontrado' });

    const posiciones = (await pool.query(`
      SELECT id, nombre, turno, hora_desde, hora_hasta, orden, requiere_reporte, area
      FROM local_posiciones WHERE local_id = $1 AND activo = true ORDER BY orden
    `, [localId])).rows;

    const celdas = (await pool.query(`
      SELECT t.id, t.posicion_id, t.fecha::text, t.empleado_id, t.estado,
             t.hora_desde, t.hora_hasta, t.nota
      FROM turnos_planificados t
      JOIN local_posiciones p ON p.id = t.posicion_id
      WHERE p.local_id = $1 AND t.fecha BETWEEN $2 AND $3
    `, [localId, desde, hasta])).rows;

    // Todos los empleados activos, no solo los del local: un bachero del café
    // puede cubrir un turno en una tienda.
    const empleados = (await pool.query(`
      SELECT e.id, e.nombre, e.puesto, e.area, e.carga_reporte, e.local_id_principal,
             l.nombre AS local_nombre,
             (u.id IS NOT NULL) AS tiene_usuario
      FROM empleados e
      JOIN locales l ON l.id = e.local_id_principal
      LEFT JOIN usuarios u ON u.empleado_id = e.id AND u.activo = true
      WHERE e.activo = true
      ORDER BY (e.local_id_principal = $1) DESC, e.nombre
    `, [localId])).rows;

    res.json({ ok: true, data: { local, mes, posiciones, celdas, empleados } });
  } catch (err) {
    console.error('[calendario GET]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el calendario' });
  }
});

// ── PUT /celda ────────────────────────────────────────────────────────────────
// Asigna, libera o marca franco una celda. Devuelve el aviso cuando la persona
// asignada no puede cargar el reporte que esa posición exige.

router.put('/celda', requireAuth, puedeEditar, async (req, res) => {
  try {
    const { posicion_id, fecha, empleado_id, estado, hora_desde, hora_hasta, nota } = req.body;
    if (!posicion_id || !fecha) {
      return res.status(400).json({ ok: false, error: 'Falta la posición o la fecha' });
    }

    const posicion = (await pool.query(
      'SELECT * FROM local_posiciones WHERE id = $1', [posicion_id]
    )).rows[0];
    if (!posicion) return res.status(404).json({ ok: false, error: 'Posición no encontrada' });

    const estadoFinal = estado || (empleado_id ? 'asignado' : 'sin_cubrir');

    // Vaciar la celda es borrar la fila: así el mes sin cargar queda vacío de verdad.
    if (estadoFinal === 'sin_cubrir' && !empleado_id) {
      await pool.query('DELETE FROM turnos_planificados WHERE posicion_id = $1 AND fecha = $2',
        [posicion_id, fecha]);
      return res.json({ ok: true, data: null, avisos: [] });
    }

    const { rows } = await pool.query(`
      INSERT INTO turnos_planificados
        (posicion_id, fecha, empleado_id, estado, hora_desde, hora_hasta, nota)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (posicion_id, fecha) DO UPDATE SET
        empleado_id = EXCLUDED.empleado_id,
        estado      = EXCLUDED.estado,
        hora_desde  = EXCLUDED.hora_desde,
        hora_hasta  = EXCLUDED.hora_hasta,
        nota        = EXCLUDED.nota,
        updated_at  = NOW()
      RETURNING *
    `, [
      posicion_id, fecha,
      estadoFinal === 'asignado' ? empleado_id : null,
      estadoFinal, hora_desde || null, hora_hasta || null, nota || null,
    ]);

    const avisos = [];
    if (estadoFinal === 'asignado' && empleado_id && posicion.requiere_reporte) {
      const e = (await pool.query(`
        SELECT e.nombre, e.carga_reporte, e.area, (u.id IS NOT NULL) AS tiene_usuario
        FROM empleados e
        LEFT JOIN usuarios u ON u.empleado_id = e.id AND u.activo = true
        WHERE e.id = $1
      `, [empleado_id])).rows[0];

      if (e && !e.carga_reporte) {
        avisos.push({
          tipo: 'no_reporta',
          texto: `${e.nombre} está cargado como que no reporta, pero esta posición sí lleva reporte. ` +
                 `Marcalo como que carga reporte y creale un usuario.`,
        });
      } else if (e && !e.tiene_usuario) {
        avisos.push({
          tipo: 'sin_usuario',
          texto: `${e.nombre} no tiene usuario, así que no va a poder cargar el reporte de este turno.`,
        });
      }
    }

    res.json({ ok: true, data: rows[0], avisos });
  } catch (err) {
    console.error('[calendario PUT celda]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el turno' });
  }
});

// ── POST /copiar-semana ───────────────────────────────────────────────────────
// Armar el mes a mano celda por celda es inviable: se copia una semana sobre otra.

router.post('/copiar-semana', requireAuth, puedeEditar, async (req, res) => {
  try {
    const { local_id, desde, hasta } = req.body;   // lunes origen, lunes destino
    if (!local_id || !desde || !hasta) {
      return res.status(400).json({ ok: false, error: 'Faltan las semanas de origen y destino' });
    }

    const origen = (await pool.query(`
      SELECT t.posicion_id, t.fecha::text, t.empleado_id, t.estado, t.hora_desde, t.hora_hasta, t.nota
      FROM turnos_planificados t
      JOIN local_posiciones p ON p.id = t.posicion_id
      WHERE p.local_id = $1 AND t.fecha >= $2::date AND t.fecha < $2::date + 7
    `, [local_id, desde])).rows;

    if (!origen.length) {
      return res.status(400).json({ ok: false, error: 'La semana de origen está vacía' });
    }

    const dias = (new Date(hasta) - new Date(desde)) / 86400000;
    let copiadas = 0;
    for (const c of origen) {
      const nueva = new Date(`${c.fecha}T12:00:00`);
      nueva.setDate(nueva.getDate() + dias);
      const f = `${nueva.getFullYear()}-${String(nueva.getMonth() + 1).padStart(2, '0')}-${String(nueva.getDate()).padStart(2, '0')}`;
      await pool.query(`
        INSERT INTO turnos_planificados (posicion_id, fecha, empleado_id, estado, hora_desde, hora_hasta, nota)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (posicion_id, fecha) DO UPDATE SET
          empleado_id = EXCLUDED.empleado_id, estado = EXCLUDED.estado,
          hora_desde = EXCLUDED.hora_desde, hora_hasta = EXCLUDED.hora_hasta,
          nota = EXCLUDED.nota, updated_at = NOW()
      `, [c.posicion_id, f, c.empleado_id, c.estado, c.hora_desde, c.hora_hasta, c.nota]);
      copiadas++;
    }

    res.json({ ok: true, data: { copiadas } });
  } catch (err) {
    console.error('[calendario/copiar-semana]', err);
    res.status(500).json({ ok: false, error: 'Error al copiar la semana' });
  }
});

// ── GET /avisos/:localId/:mes ─────────────────────────────────────────────────
// Todo lo que hay que resolver del mes armado: gente sin usuario en posiciones
// que llevan reporte, y celdas sin cubrir.

router.get('/avisos/:localId/:mes', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { localId, mes } = req.params;
    const desde = `${mes}-01`, hasta = finDeMes(mes);

    const { rows } = await pool.query(`
      SELECT DISTINCT e.id, e.nombre, e.carga_reporte, p.nombre AS posicion,
             (u.id IS NOT NULL) AS tiene_usuario
      FROM turnos_planificados t
      JOIN local_posiciones p ON p.id = t.posicion_id
      JOIN empleados e ON e.id = t.empleado_id
      LEFT JOIN usuarios u ON u.empleado_id = e.id AND u.activo = true
      WHERE p.local_id = $1 AND t.fecha BETWEEN $2 AND $3
        AND t.estado = 'asignado' AND p.requiere_reporte = true
        AND (e.carga_reporte = false OR u.id IS NULL)
      ORDER BY e.nombre
    `, [localId, desde, hasta]);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[calendario/avisos]', err);
    res.status(500).json({ ok: false, error: 'Error al revisar el calendario' });
  }
});

module.exports = router;
