// El tablero de los dueños: sus propias tareas y los microobjetivos (23/10/2026).
//
// Solo lo ven los dueños (index.js lo monta con soloDueno). Cada tarea tiene un dueño
// responsable, que la toma, cuenta cómo viene y pide el cierre. La cierra OTRO dueño: así
// cada uno rinde cuentas de lo suyo en la reunión semanal. Mismas columnas que el
// tablero del encargado.

const express = require('express');
const pool    = require('../config/db');
const T       = require('../utils/tareas');
const avisos  = require('../services/avisos');
const tareasAvisos = require('../services/tareasAvisos');
const { corto } = require('../services/alertas');

const router = express.Router();
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const escrito = (v, max = 300) => String(v || '').trim().slice(0, max);
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '');

const NEGOCIOS = { entre_dos: 'Entre Dos', kankay: 'Kankay', senzen: 'Senzen', general: 'General' };
const ESTADOS = ['nueva', 'en_curso', 'por_aprobar', 'terminada'];
const nombreCorto = n => String(n || '').replace(/\s*\(.*\)\s*$/, '');

const SELECT = `
  SELECT t.id, t.titulo, t.detalle, t.responsable_id, t.negocio, t.local_id, t.area, t.microobjetivo_id,
         t.plazo::text AS plazo, t.prioridad, t.estado, t.creada_por, t.pedido_cierre_at,
         t.terminada_por, t.terminada_at, t.created_at, t.updated_at,
         ur.nombre AS responsable_nombre, uc.nombre AS creada_por_nombre, ut.nombre AS terminada_por_nombre,
         l.nombre AS local_nombre, m.nombre AS microobjetivo_nombre
  FROM tareas_duenos t
  JOIN usuarios ur ON ur.id = t.responsable_id
  LEFT JOIN usuarios uc ON uc.id = t.creada_por
  LEFT JOIN usuarios ut ON ut.id = t.terminada_por
  LEFT JOIN locales l ON l.id = t.local_id
  LEFT JOIN microobjetivos m ON m.id = t.microobjetivo_id
`;

// Lo que hace falta para la tarjeta: nombres cortos, si venció y lo sin leer de quien mira.
async function enriquecer(tareas, usuarioId) {
  if (!tareas.length) return [];
  const ids = tareas.map(t => t.id);
  const [eventos, vistas] = await Promise.all([
    pool.query('SELECT tarea_id, usuario_id, tipo, texto, created_at FROM tarea_duenos_eventos WHERE tarea_id = ANY($1)', [ids]),
    pool.query('SELECT tarea_id, visto_at FROM tarea_duenos_vistas WHERE usuario_id = $1 AND tarea_id = ANY($2)', [usuarioId, ids]),
  ]);
  const visto = Object.fromEntries(vistas.rows.map(v => [v.tarea_id, new Date(v.visto_at)]));
  const hoy = T.hoyMendoza();
  return tareas.map(t => {
    const evs = eventos.rows.filter(e => e.tarea_id === t.id);
    const nuevos = evs.filter(e => e.usuario_id && e.usuario_id !== usuarioId && (!visto[t.id] || new Date(e.created_at) > visto[t.id]));
    return {
      ...t,
      responsable: nombreCorto(t.responsable_nombre),
      creada_por_corto: nombreCorto(t.creada_por_nombre),
      terminada_por_corto: nombreCorto(t.terminada_por_nombre),
      negocio_label: NEGOCIOS[t.negocio],
      local_corto: corto(t.local_nombre),
      area_label: T.AREAS[t.area] || t.area,
      vencida: t.estado !== 'terminada' && t.estado !== 'por_aprobar' && !!t.plazo && t.plazo < hoy,
      vence_hoy: t.estado !== 'terminada' && t.estado !== 'por_aprobar' && t.plazo === hoy,
      mensajes: evs.filter(e => e.usuario_id && (e.texto || '').trim()).length,
      sin_leer: { total: nuevos.length, comentarios: nuevos.filter(e => (e.texto || '').trim()).length },
    };
  });
}

async function tareaPorId(id) {
  return (await pool.query(`${SELECT} WHERE t.id = $1`, [id])).rows[0] || null;
}

async function evento(tareaId, usuarioId, tipo, texto, datos = {}) {
  await pool.query('INSERT INTO tarea_duenos_eventos (tarea_id, usuario_id, tipo, texto, datos) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [tareaId, usuarioId, tipo, texto || null, JSON.stringify(datos)]);
  await pool.query('UPDATE tareas_duenos SET updated_at = NOW() WHERE id = $1', [tareaId]);
}

function avisar(t, quien, tema, texto) {
  avisos.enSegundoPlano(tareasAvisos.cambioEnTareaDueno(t, quien, tema, texto), `tarea de dueño ${tema}`);
}

async function microobjetivos() {
  const { rows } = await pool.query(`
    SELECT m.id, m.nombre, m.dueno_id, u.nombre AS dueno_nombre, m.negocio, m.local_ids, m.area, m.meta,
           m.mes::text AS mes, m.semaforo, m.nota, m.nota_at,
           (SELECT COUNT(*) FROM tareas_duenos t WHERE t.microobjetivo_id = m.id)::int AS tareas,
           (SELECT COUNT(*) FROM tareas_duenos t WHERE t.microobjetivo_id = m.id AND t.estado = 'terminada')::int AS cerradas,
           (SELECT COUNT(*) FROM tareas t WHERE t.microobjetivo_id = m.id)::int AS tareas_gordo,
           (SELECT COUNT(*) FROM tareas t WHERE t.microobjetivo_id = m.id AND t.estado = 'terminada')::int AS cerradas_gordo
    FROM microobjetivos m JOIN usuarios u ON u.id = m.dueno_id
    WHERE m.activo ORDER BY m.mes DESC, m.id
  `);
  const locales = (await pool.query('SELECT id, nombre FROM locales')).rows;
  return rows.map(m => ({
    ...m,
    dueno: nombreCorto(m.dueno_nombre),
    negocio_label: NEGOCIOS[m.negocio],
    area_label: T.AREAS[m.area] || m.area,
    unidades: m.local_ids.map(id => corto(locales.find(l => l.id === id)?.nombre)).filter(Boolean),
  }));
}

// ── GET / ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const abiertas = (await pool.query(`${SELECT} WHERE t.estado <> 'terminada' ORDER BY t.created_at`)).rows;
    const duenos = (await pool.query(`SELECT id, nombre FROM usuarios WHERE rol = 'admin' AND activo ORDER BY id`)).rows
      .map(u => ({ id: u.id, nombre: nombreCorto(u.nombre) }));
    const locales = (await pool.query('SELECT id, nombre FROM locales WHERE activo ORDER BY id')).rows
      .map(l => ({ id: l.id, nombre: corto(l.nombre) }));
    const cerradas = (await pool.query(`SELECT COUNT(*)::int AS n FROM tareas_duenos WHERE estado = 'terminada'`)).rows[0].n;
    res.json({ ok: true, data: {
      tareas: await enriquecer(abiertas, req.user.id), microobjetivos: await microobjetivos(),
      duenos, locales, negocios: NEGOCIOS, areas: T.AREAS, cerradas,
    } });
  } catch (err) {
    console.error('[tareas-duenos GET]', err);
    fail(res, 500, 'No se pudo cargar el tablero');
  }
});

// ── GET /registro ────────────────────────────────────────────────────────────
router.get('/registro', async (req, res) => {
  try {
    const rows = (await pool.query(`${SELECT} WHERE t.estado = 'terminada' ORDER BY t.terminada_at DESC`)).rows;
    res.json({ ok: true, data: await enriquecer(rows, req.user.id) });
  } catch (err) {
    console.error('[tareas-duenos/registro]', err);
    fail(res, 500, 'No se pudo cargar el registro');
  }
});

// Valida y arma los campos que se pueden cargar o cambiar.
async function campos(body, parcial) {
  const c = {};
  if (!parcial || 'titulo' in body) { c.titulo = escrito(body.titulo, 200); if (c.titulo.length < 3) return { error: 'Escribí qué hay que hacer' }; }
  if (!parcial || 'detalle' in body) c.detalle = escrito(body.detalle, 2000) || null;
  if (!parcial || 'responsable_id' in body) {
    const r = (await pool.query(`SELECT id FROM usuarios WHERE id = $1 AND rol = 'admin' AND activo`, [Number(body.responsable_id) || 0])).rows[0];
    if (!r) return { error: 'Elegí qué dueño la hace' };
    c.responsable_id = r.id;
  }
  if (!parcial || 'negocio' in body) { if (!NEGOCIOS[body.negocio]) return { error: 'Elegí el negocio' }; c.negocio = body.negocio; }
  if (!parcial || 'local_id' in body) c.local_id = (c.negocio || body.negocio) === 'entre_dos' && body.local_id ? Number(body.local_id) : null;
  if (!parcial || 'area' in body) { if (!T.AREAS[body.area]) return { error: 'Elegí el área' }; c.area = body.area; }
  if (!parcial || 'microobjetivo_id' in body) c.microobjetivo_id = body.microobjetivo_id ? Number(body.microobjetivo_id) : null;
  if (!parcial || 'prioridad' in body) c.prioridad = ['alta', 'media', 'baja'].includes(body.prioridad) ? body.prioridad : null;
  return { c };
}

// ── POST / ───────────────────────────────────────────────────────────────────
// { titulo, detalle?, responsable_id, negocio, local_id?, area, microobjetivo_id?, plazo?, prioridad? }
router.post('/', async (req, res) => {
  try {
    const { c, error } = await campos(req.body, false);
    if (error) return fail(res, 400, error);
    const plazo = esFecha(req.body.plazo) ? req.body.plazo : null;
    const { rows } = await pool.query(`
      INSERT INTO tareas_duenos (titulo, detalle, responsable_id, negocio, local_id, area, microobjetivo_id, plazo, prioridad, creada_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
    `, [c.titulo, c.detalle, c.responsable_id, c.negocio, c.local_id, c.area, c.microobjetivo_id, plazo, c.prioridad, req.user.id]);
    const id = rows[0].id;
    await evento(id, req.user.id, 'creada', c.detalle);
    await pool.query('INSERT INTO tarea_duenos_vistas (usuario_id, tarea_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
    const t = await tareaPorId(id);
    if (c.responsable_id !== req.user.id) avisar(t, req.user, 'asignada', c.titulo);
    res.json({ ok: true, data: { id } });
  } catch (err) {
    console.error('[tareas-duenos POST]', err);
    fail(res, 500, 'No se pudo cargar la tarea');
  }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const t = await tareaPorId(req.params.id);
    if (!t) return fail(res, 404, 'No existe esa tarea');
    const [tarea] = await enriquecer([t], req.user.id);
    const eventos = (await pool.query(`
      SELECT e.id, e.usuario_id, e.tipo, e.texto, e.datos, e.created_at, u.nombre AS usuario
      FROM tarea_duenos_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.tarea_id = $1 ORDER BY e.created_at, e.id
    `, [t.id])).rows.map(e => ({ ...e, usuario: nombreCorto(e.usuario) }));
    const antes = (await pool.query(`
      WITH previa AS (SELECT visto_at FROM tarea_duenos_vistas WHERE usuario_id = $1 AND tarea_id = $2)
      INSERT INTO tarea_duenos_vistas (usuario_id, tarea_id, visto_at) VALUES ($1, $2, NOW())
      ON CONFLICT (usuario_id, tarea_id) DO UPDATE SET visto_at = NOW()
      RETURNING (SELECT visto_at FROM previa) AS antes
    `, [req.user.id, t.id])).rows[0]?.antes || null;
    res.json({ ok: true, data: { tarea, eventos, visto_antes: antes } });
  } catch (err) {
    console.error('[tareas-duenos GET :id]', err);
    fail(res, 500, 'No se pudo cargar la tarea');
  }
});

// ── POST /:id/accion ─────────────────────────────────────────────────────────
// { accion: comentar | tomar | pedir_cierre | cerrar | devolver | volver, texto?, plazo? }
// El responsable la toma (dice para cuándo) y pide el cierre contando qué hizo. La cierra
// o la devuelve otro dueño. Comentar, cualquiera.
router.post('/:id(\\d+)/accion', async (req, res) => {
  try {
    const t = await tareaPorId(req.params.id);
    if (!t) return fail(res, 404, 'No existe esa tarea');
    const { accion } = req.body;
    const texto = escrito(req.body.texto, 1000);
    const yo = req.user.id, esResponsable = t.responsable_id === yo;
    const hoy = T.hoyMendoza();

    if (accion === 'comentar') {
      if (!texto) return fail(res, 400, 'Escribí el comentario');
      await evento(t.id, yo, 'comentario', texto);
      avisar(t, req.user, 'comentario', texto);
    } else if (accion === 'tomar') {
      if (!esResponsable) return fail(res, 403, `La toma ${nombreCorto(t.responsable_nombre)}, que es quien la hace`);
      if (t.estado !== 'nueva') return fail(res, 409, 'Ya está en proceso');
      const plazo = esFecha(req.body.plazo) ? req.body.plazo : t.plazo;
      if (!plazo) return fail(res, 400, 'Poné para cuándo');
      if (plazo < hoy) return fail(res, 400, 'La fecha no puede ser anterior a hoy');
      await pool.query(`UPDATE tareas_duenos SET estado = 'en_curso', plazo = $2 WHERE id = $1`, [t.id, plazo]);
      await evento(t.id, yo, 'mov', texto || null, { a: 'en_curso', plazo });
    } else if (accion === 'pedir_cierre') {
      if (!esResponsable) return fail(res, 403, `El cierre lo pide ${nombreCorto(t.responsable_nombre)}, que es quien la hace`);
      if (!['nueva', 'en_curso'].includes(t.estado)) return fail(res, 409, 'Ya está esperando el cierre');
      if (texto.length < 3) return fail(res, 400, 'Contá qué hiciste, así el que la cierra sabe qué mirar');
      await pool.query(`UPDATE tareas_duenos SET estado = 'por_aprobar', pedido_cierre_at = NOW() WHERE id = $1`, [t.id]);
      await evento(t.id, yo, 'pidio_cierre', texto);
      avisar(t, req.user, 'cierre');
    } else if (accion === 'cerrar' || accion === 'devolver') {
      if (t.estado !== 'por_aprobar') return fail(res, 409, 'No está esperando el cierre');
      if (esResponsable) return fail(res, 403, 'La cierra otro dueño: así cada uno rinde cuentas de lo suyo');
      if (accion === 'devolver' && texto.length < 3) return fail(res, 400, 'Escribí qué falta');
      if (accion === 'cerrar') {
        await pool.query(`UPDATE tareas_duenos SET estado = 'terminada', terminada_por = $2, terminada_at = NOW() WHERE id = $1`, [t.id, yo]);
        await evento(t.id, yo, 'cerrada', texto || null);
      } else {
        await pool.query(`UPDATE tareas_duenos SET estado = 'en_curso' WHERE id = $1`, [t.id]);
        await evento(t.id, yo, 'devuelta', texto);
      }
      avisar(t, req.user, accion === 'cerrar' ? 'cerrada' : 'devuelta', texto);
    } else if (accion === 'volver') {
      // Devolverla a Sin empezar: por ejemplo, si se tomó por error.
      if (t.estado !== 'en_curso') return fail(res, 409, 'Solo una tarea en proceso vuelve a Sin empezar');
      await pool.query(`UPDATE tareas_duenos SET estado = 'nueva' WHERE id = $1`, [t.id]);
      await evento(t.id, yo, 'mov', texto || null, { a: 'nueva' });
    } else {
      return fail(res, 400, 'Acción inválida');
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas-duenos/accion]', err);
    fail(res, 500, 'No se pudo guardar');
  }
});

// ── POST /:id/editar ─────────────────────────────────────────────────────────
// Cualquier dueño corrige los datos. Cambiar la fecha pide el motivo. Todo queda anotado.
router.post('/:id(\\d+)/editar', async (req, res) => {
  try {
    const t = await tareaPorId(req.params.id);
    if (!t) return fail(res, 404, 'No existe esa tarea');
    if (t.estado === 'terminada') return fail(res, 409, 'La tarea ya está cerrada');
    const { c, error } = await campos(req.body, true);
    if (error) return fail(res, 400, error);
    if ('plazo' in req.body) {
      const plazo = esFecha(req.body.plazo) ? req.body.plazo : null;
      if (plazo !== t.plazo) {
        const motivo = escrito(req.body.motivo, 300);
        if (t.plazo && motivo.length < 3) return fail(res, 400, 'Contá por qué cambia la fecha');
        await pool.query('UPDATE tareas_duenos SET plazo = $2 WHERE id = $1', [t.id, plazo]);
        await evento(t.id, req.user.id, 'fecha', motivo || null, { antes: t.plazo, despues: plazo });
      }
    }
    const cambiados = Object.keys(c).filter(k => String(c[k] ?? '') !== String(t[k] ?? ''));
    if (cambiados.length) {
      await pool.query(`UPDATE tareas_duenos SET ${cambiados.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [t.id, ...cambiados.map(k => c[k])]);
      await evento(t.id, req.user.id, 'cambio', null, { campos: cambiados });
      if (cambiados.includes('responsable_id') && c.responsable_id !== req.user.id) avisar(await tareaPorId(t.id), req.user, 'asignada', t.titulo);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas-duenos/editar]', err);
    fail(res, 500, 'No se pudo guardar');
  }
});

// ── Microobjetivos ───────────────────────────────────────────────────────────
// { nombre, dueno_id, negocio, local_ids?, area, meta?, mes }
router.post('/microobjetivos', async (req, res) => {
  try {
    const nombre = escrito(req.body.nombre, 200);
    if (nombre.length < 3) return fail(res, 400, 'Escribí el microobjetivo');
    const dueno = (await pool.query(`SELECT id FROM usuarios WHERE id = $1 AND rol = 'admin' AND activo`, [Number(req.body.dueno_id) || 0])).rows[0];
    if (!dueno) return fail(res, 400, 'Elegí el dueño responsable');
    if (!NEGOCIOS[req.body.negocio]) return fail(res, 400, 'Elegí el negocio');
    if (!T.AREAS[req.body.area]) return fail(res, 400, 'Elegí el área que mueve');
    const mes = /^\d{4}-\d{2}/.test(req.body.mes || '') ? `${req.body.mes.slice(0, 7)}-01` : `${T.hoyMendoza().slice(0, 7)}-01`;
    const localIds = req.body.negocio === 'entre_dos' && Array.isArray(req.body.local_ids) ? req.body.local_ids.map(Number).filter(Boolean) : [];
    const { rows } = await pool.query(`
      INSERT INTO microobjetivos (nombre, dueno_id, negocio, local_ids, area, meta, mes, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [nombre, dueno.id, req.body.negocio, localIds, req.body.area, escrito(req.body.meta, 200) || null, mes, req.user.id]);
    res.json({ ok: true, data: { id: rows[0].id } });
  } catch (err) {
    console.error('[microobjetivos POST]', err);
    fail(res, 500, 'No se pudo guardar el microobjetivo');
  }
});

// El semáforo y la nota de la semana los actualiza el dueño responsable.  { semaforo?, nota? }
router.post('/microobjetivos/:id(\\d+)', async (req, res) => {
  try {
    const m = (await pool.query('SELECT id, dueno_id FROM microobjetivos WHERE id = $1 AND activo', [req.params.id])).rows[0];
    if (!m) return fail(res, 404, 'No existe ese microobjetivo');
    if ('semaforo' in req.body) {
      const s = ['verde', 'amarillo', 'rojo'].includes(req.body.semaforo) ? req.body.semaforo : null;
      await pool.query('UPDATE microobjetivos SET semaforo = $2, updated_at = NOW() WHERE id = $1', [m.id, s]);
    }
    if ('nota' in req.body) {
      await pool.query('UPDATE microobjetivos SET nota = $2, nota_at = NOW(), updated_at = NOW() WHERE id = $1', [m.id, escrito(req.body.nota, 600) || null]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[microobjetivos POST :id]', err);
    fail(res, 500, 'No se pudo guardar');
  }
});

module.exports = router;
