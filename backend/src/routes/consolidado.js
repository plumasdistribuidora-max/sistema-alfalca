const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');

const router = express.Router();

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const n = v => Number(v) || 0;

// El placeholder de los campos de texto dice "Sin novedades", y la gente lo escribe
// tal cual en vez de dejarlo vacío. Sin esto, cada turno sube una novedad que no lo es.
const NADA = [
  'sin novedades', 'sin novedad', 'ninguna', 'ninguno', 'nada', 'no', 'no hubo',
  'todo bien', 'sin nada', 'n/a', 'na', '-', '--', '.', 'ok',
];
function esNovedad(texto) {
  const t = String(texto || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!,]/g, '').trim();
  return t !== '' && !NADA.includes(t);
}

// Las horas de un reporte según el tipo de plantilla: la de café trae las de todo
// el turno, las otras solo las de quien firma.
function horasDe(reporte) {
  const r = reporte.respuestas || {};
  if (Array.isArray(r.horas_equipo)) {
    return r.horas_equipo
      .filter(f => f.empleado_id && Number(f.horas) > 0)
      .map(f => ({ empleado_id: Number(f.empleado_id), horas: Number(f.horas) }));
  }
  if (r.horas && Number(r.horas) > 0 && reporte.empleado_id) {
    return [{ empleado_id: reporte.empleado_id, horas: Number(r.horas) }];
  }
  return [];
}

// Arma el consolidado del día: lo que ya sabe el sistema más lo que cargó cada turno.
// El encargado no transcribe nada de esto — lo verifica.
async function armarDia(fecha) {
  const locales = (await pool.query(
    'SELECT id, nombre, tipo, objetivo_horas_ventas FROM locales WHERE activo = true ORDER BY id'
  )).rows;

  // Ventas y tickets del Excel de Fudo ya importado.
  const ventas = (await pool.query(`
    SELECT local_id, COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS tickets
    FROM ventas_tickets
    WHERE fecha = $1 AND estado = 'cerrada'
    GROUP BY local_id
  `, [fecha])).rows;
  const ventasPorLocal = Object.fromEntries(
    ventas.map(v => [v.local_id, { total: n(v.total), tickets: v.tickets }])
  );

  // Reportes de turno del día.
  const reportes = (await pool.query(`
    SELECT r.id, r.local_id, r.turno, r.estado, r.empleado_id, r.respuestas,
           r.plantilla_codigo, u.nombre AS usuario_nombre
    FROM reportes r
    JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.fecha = $1 AND r.estado <> 'borrador'
    ORDER BY r.local_id, r.turno
  `, [fecha])).rows;

  // Valor hora vigente a esa fecha, por local y puesto.
  const valores = (await pool.query(`
    SELECT DISTINCT ON (local_id, puesto) local_id, puesto, valor_hora
    FROM valor_hora
    WHERE vigente_desde <= $1
    ORDER BY local_id, puesto, vigente_desde DESC
  `, [fecha])).rows;
  const valorDe = Object.fromEntries(valores.map(v => [`${v.local_id}|${v.puesto}`, n(v.valor_hora)]));

  const empleados = Object.fromEntries(
    (await pool.query('SELECT id, nombre, puesto, local_id_principal FROM empleados')).rows
      .map(e => [e.id, e])
  );

  // Acumular horas, gasto y personas atendidas por local.
  const porLocal = {};
  for (const l of locales) {
    porLocal[l.id] = {
      local_id: l.id, nombre: l.nombre, tipo: l.tipo,
      ventas_sistema: ventasPorLocal[l.id]?.total ?? 0,
      tickets_sistema: ventasPorLocal[l.id]?.tickets ?? 0,
      objetivo: n(l.objetivo_horas_ventas),
      personas_reportadas: 0,
      ventas_reportadas: 0,
      horas: 0, gasto_personal: 0,
      horas_sin_valor: 0,
      reportes: [], turnos_con_reporte: [],
    };
  }

  const novedades = { vencimientos: [], mantenimiento: [], faltantes: [], ausencias: [], quejas: [] };

  for (const rep of reportes) {
    const acc = porLocal[rep.local_id];
    if (!acc) continue;

    acc.reportes.push({
      id: rep.id, turno: rep.turno, estado: rep.estado,
      usuario_nombre: rep.usuario_nombre, plantilla: rep.plantilla_codigo,
    });
    acc.turnos_con_reporte.push(rep.turno);

    const r = rep.respuestas || {};
    acc.personas_reportadas += n(r.personas);
    acc.ventas_reportadas   += n(r.ventas);

    for (const fila of horasDe(rep)) {
      const emp = empleados[fila.empleado_id];
      const valor = emp?.puesto ? valorDe[`${rep.local_id}|${emp.puesto}`] : undefined;
      acc.horas += fila.horas;
      if (valor) acc.gasto_personal += fila.horas * valor;
      else acc.horas_sin_valor += fila.horas;
    }

    // Novedades que el encargado tiene que mirar y resumir para los dueños.
    const local = porLocal[rep.local_id].nombre;
    if (r.vencimientos?.hubo) {
      for (const it of (r.vencimientos.items || [])) {
        novedades.vencimientos.push({ local, turno: rep.turno, ...it });
      }
    }
    if (esNovedad(r.mantenimiento)) {
      novedades.mantenimiento.push({ local, turno: rep.turno, texto: r.mantenimiento.trim() });
    }
    if (r.faltantes?.hubo) {
      for (const it of (r.faltantes.items || [])) {
        novedades.faltantes.push({ local, turno: rep.turno, ...it });
      }
    }
    if (r.ausencias?.hubo) {
      for (const it of (r.ausencias.items || [])) {
        novedades.ausencias.push({ local, turno: rep.turno, ...it });
      }
    }
    if (esNovedad(r.quejas)) {
      novedades.quejas.push({ local, turno: rep.turno, texto: r.quejas.trim() });
    }
  }

  const guardado = (await pool.query('SELECT * FROM consolidados WHERE fecha = $1', [fecha])).rows[0] || null;

  // Cuántos reportes de venta se esperan en cada local. Solo cuentan las plantillas
  // que piden ventas (cocina no las pide), y solo si el local tiene gente de esa área
  // cargando reportes.
  //
  // Es una aproximación: cuenta todos los turnos de la plantilla, sin saber quién
  // trabajó hoy. La cuenta exacta va a salir de la grilla de turnos.
  const plantillas = (await pool.query(
    'SELECT codigo, area, campos FROM reporte_plantillas WHERE activo = true'
  )).rows;
  const areasQueReportan = (await pool.query(`
    SELECT DISTINCT local_id_principal AS local_id, area
    FROM empleados WHERE activo = true AND carga_reporte = true
  `)).rows;

  const esperadosPorLocal = {};
  for (const { local_id, area } of areasQueReportan) {
    const p = plantillas.find(x => x.area === area);
    if (!p) continue;
    const pideVentas = p.campos.some(c => c.codigo === 'ventas');
    if (!pideVentas) continue;
    const turnos = p.campos.find(c => c.codigo === 'turno')?.opciones || [];
    esperadosPorLocal[local_id] = (esperadosPorLocal[local_id] || 0) + turnos.length;
  }

  // El control real: lo que reportó cada turno a mano contra lo que trajo el Excel
  // de Fudo. Son dos fuentes independientes; si no cierran, algo pasó. Pero solo
  // vale comparar cuando están todos los turnos: si falta uno, la diferencia es
  // el turno que falta, no un error de nadie.
  const filas = Object.values(porLocal).map(l => {
    const esperados = esperadosPorLocal[l.local_id] || 0;
    const conVentas = l.reportes.filter(r => {
      const p = plantillas.find(x => x.codigo === r.plantilla);
      return p?.campos.some(c => c.codigo === 'ventas');
    }).length;
    const completo = esperados > 0 && conVentas >= esperados;

    return {
      ...l,
      turnos_esperados: esperados,
      turnos_reportados: conVentas,
      completo,
      diferencia: completo ? l.ventas_reportadas - l.ventas_sistema : null,
      horas_sobre_ventas: (l.ventas_sistema > 0 && l.gasto_personal > 0)
        ? (l.gasto_personal / l.ventas_sistema) * 100
        : null,
      ticket_promedio: l.tickets_sistema > 0 ? l.ventas_sistema / l.tickets_sistema : null,
    };
  });

  const totales = filas.reduce((t, l) => ({
    ventas_sistema:    t.ventas_sistema + l.ventas_sistema,
    ventas_reportadas: t.ventas_reportadas + l.ventas_reportadas,
    tickets:           t.tickets + l.tickets_sistema,
    personas:          t.personas + (l.personas_reportadas || l.tickets_sistema),
    horas:             t.horas + l.horas,
    gasto_personal:    t.gasto_personal + l.gasto_personal,
    horas_sin_valor:   t.horas_sin_valor + l.horas_sin_valor,
  }), {
    ventas_sistema: 0, ventas_reportadas: 0, tickets: 0, personas: 0,
    horas: 0, gasto_personal: 0, horas_sin_valor: 0,
  });

  totales.horas_sobre_ventas = (totales.ventas_sistema > 0 && totales.gasto_personal > 0)
    ? (totales.gasto_personal / totales.ventas_sistema) * 100
    : null;
  totales.ticket_promedio = totales.tickets > 0 ? totales.ventas_sistema / totales.tickets : null;

  return { fecha, locales: filas, totales, novedades, consolidado: guardado };
}

// ── GET / ─────────────────────────────────────────────────────────────────────
// El dueño también entra: requireRol deja pasar admin siempre.

router.get('/', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    }
    res.json({ ok: true, data: await armarDia(fecha) });
  } catch (err) {
    console.error('[consolidado GET]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el consolidado' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const {
      fecha, explicaciones, vencimientos_ok,
      acciones_vencimientos, mantenimiento, control_tienda_ok,
    } = req.body;

    const f = fecha || hoyStr();

    const previo = await pool.query('SELECT estado FROM consolidados WHERE fecha = $1', [f]);
    if (previo.rowCount && previo.rows[0].estado === 'cerrado') {
      return res.status(409).json({ ok: false, error: 'El día ya fue cerrado' });
    }

    const { rows } = await pool.query(`
      INSERT INTO consolidados
        (fecha, usuario_id, explicaciones, vencimientos_ok,
         acciones_vencimientos, mantenimiento, control_tienda_ok)
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
      ON CONFLICT (fecha) DO UPDATE SET
        explicaciones         = EXCLUDED.explicaciones,
        vencimientos_ok       = EXCLUDED.vencimientos_ok,
        acciones_vencimientos = EXCLUDED.acciones_vencimientos,
        mantenimiento         = EXCLUDED.mantenimiento,
        control_tienda_ok     = EXCLUDED.control_tienda_ok,
        updated_at            = NOW()
      RETURNING *
    `, [
      f, req.user.id,
      JSON.stringify(explicaciones || {}),
      !!vencimientos_ok, acciones_vencimientos || null,
      mantenimiento || null, !!control_tienda_ok,
    ]);

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[consolidado POST]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el consolidado' });
  }
});

// ── POST /cerrar ──────────────────────────────────────────────────────────────

router.post('/cerrar', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.body.fecha || hoyStr();
    const dia = await armarDia(fecha);
    const c = dia.consolidado;

    if (!c) return res.status(400).json({ ok: false, error: 'Guardá el consolidado antes de cerrarlo' });
    if (c.estado === 'cerrado') return res.status(409).json({ ok: false, error: 'El día ya está cerrado' });

    const faltan = [];

    // Dos cosas distintas: que falte un turno por cargar, y que lo cargado no cierre.
    // El umbral de $1 evita frenar el cierre por redondeos.
    for (const l of dia.locales) {
      if (l.turnos_esperados > 0 && !l.completo) {
        faltan.push(
          `Falta${l.turnos_esperados - l.turnos_reportados === 1 ? '' : 'n'} ` +
          `${l.turnos_esperados - l.turnos_reportados} reporte(s) de turno en ${l.nombre}`
        );
        continue;
      }
      if (l.diferencia !== null && Math.abs(l.diferencia) >= 1 &&
          !c.explicaciones?.[String(l.local_id)]?.trim()) {
        faltan.push(`Explicá por qué ${l.nombre} no cierra contra lo que reportaron los turnos`);
      }
    }
    if (!c.vencimientos_ok) faltan.push('Confirmá el control de vencimientos');
    if (!c.control_tienda_ok) faltan.push('Confirmá el control de tienda');
    if (dia.novedades.vencimientos.length && !c.acciones_vencimientos?.trim()) {
      faltan.push('Escribí qué acciones tomaste sobre los vencimientos reportados');
    }

    if (faltan.length) {
      return res.status(400).json({ ok: false, error: 'Falta completar el cierre', data: { faltan } });
    }

    await pool.query(
      `UPDATE consolidados SET estado = 'cerrado', cerrado_at = NOW(), updated_at = NOW() WHERE fecha = $1`,
      [fecha]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[consolidado/cerrar]', err);
    res.status(500).json({ ok: false, error: 'Error al cerrar el día' });
  }
});

// ── POST /reabrir ─────────────────────────────────────────────────────────────
// Solo el dueño puede reabrir un día ya cerrado.

router.post('/reabrir', requireAuth, async (req, res) => {
  try {
    if (req.user.rol !== ROLES.ADMIN) {
      return res.status(403).json({ ok: false, error: 'Solo un dueño puede reabrir un día cerrado' });
    }
    const fecha = req.body.fecha || hoyStr();
    const { rowCount } = await pool.query(
      `UPDATE consolidados SET estado = 'borrador', cerrado_at = NULL, updated_at = NOW()
       WHERE fecha = $1 AND estado = 'cerrado'`, [fecha]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Ese día no está cerrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[consolidado/reabrir]', err);
    res.status(500).json({ ok: false, error: 'Error al reabrir el día' });
  }
});

// ── GET /mensual ──────────────────────────────────────────────────────────────
// El día suelto puede dar mal; lo que importa es el mes contra el objetivo.
// No se guarda nada nuevo: se calcula sobre las ventas y los reportes que ya están.

router.get('/mensual', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const mes = req.query.mes || hoyStr().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ ok: false, error: 'Mes inválido (usá YYYY-MM)' });
    }
    const [y, m] = mes.split('-').map(Number);
    const desde  = `${mes}-01`;
    const hasta  = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const locales = (await pool.query(
      'SELECT id, nombre, tipo, objetivo_horas_ventas FROM locales WHERE activo = true ORDER BY id'
    )).rows;

    const ventas = (await pool.query(`
      SELECT local_id, fecha::text, COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS tickets
      FROM ventas_tickets
      WHERE fecha BETWEEN $1 AND $2 AND estado = 'cerrada'
      GROUP BY local_id, fecha
    `, [desde, hasta])).rows;

    const reportes = (await pool.query(`
      SELECT id, local_id, fecha::text, empleado_id, respuestas
      FROM reportes
      WHERE fecha BETWEEN $1 AND $2 AND estado <> 'borrador'
    `, [desde, hasta])).rows;

    // Todas las vigencias del mes: el valor hora de un día es el último que empezó
    // a regir en o antes de ese día.
    const vigencias = (await pool.query(
      'SELECT local_id, puesto, valor_hora, vigente_desde::text FROM valor_hora ORDER BY vigente_desde'
    )).rows;
    const valorEn = (localId, puesto, fecha) => {
      let v = null;
      for (const x of vigencias) {
        if (x.local_id === localId && x.puesto === puesto && x.vigente_desde <= fecha) v = n(x.valor_hora);
      }
      return v;
    };

    const empleados = Object.fromEntries(
      (await pool.query('SELECT id, puesto FROM empleados')).rows.map(e => [e.id, e])
    );

    const acc = {};
    for (const l of locales) {
      acc[l.id] = {
        local_id: l.id, nombre: l.nombre, tipo: l.tipo,
        objetivo: n(l.objetivo_horas_ventas),
        ventas: 0, tickets: 0, horas: 0, gasto_personal: 0, horas_sin_valor: 0,
        dias_con_venta: 0, dias_con_reporte: new Set(),
      };
    }

    for (const v of ventas) {
      const a = acc[v.local_id];
      if (!a) continue;
      a.ventas  += n(v.total);
      a.tickets += v.tickets;
      a.dias_con_venta++;
    }

    for (const rep of reportes) {
      const a = acc[rep.local_id];
      if (!a) continue;
      a.dias_con_reporte.add(rep.fecha);
      for (const fila of horasDe(rep)) {
        const puesto = empleados[fila.empleado_id]?.puesto;
        const valor  = puesto ? valorEn(rep.local_id, puesto, rep.fecha) : null;
        a.horas += fila.horas;
        if (valor) a.gasto_personal += fila.horas * valor;
        else a.horas_sin_valor += fila.horas;
      }
    }

    const filas = Object.values(acc).map(a => {
      const kpi = (a.ventas > 0 && a.gasto_personal > 0)
        ? (a.gasto_personal / a.ventas) * 100 : null;
      return {
        ...a,
        dias_con_reporte: a.dias_con_reporte.size,
        horas_sobre_ventas: kpi,
        ticket_promedio: a.tickets > 0 ? a.ventas / a.tickets : null,
        // Cuánto se desvía del objetivo del local, en puntos.
        desvio: kpi != null ? kpi - a.objetivo : null,
        cumple: kpi != null ? kpi <= a.objetivo : null,
      };
    });

    const totales = filas.reduce((t, l) => ({
      ventas:          t.ventas + l.ventas,
      tickets:         t.tickets + l.tickets,
      horas:           t.horas + l.horas,
      gasto_personal:  t.gasto_personal + l.gasto_personal,
      horas_sin_valor: t.horas_sin_valor + l.horas_sin_valor,
    }), { ventas: 0, tickets: 0, horas: 0, gasto_personal: 0, horas_sin_valor: 0 });

    totales.horas_sobre_ventas = (totales.ventas > 0 && totales.gasto_personal > 0)
      ? (totales.gasto_personal / totales.ventas) * 100 : null;
    totales.ticket_promedio = totales.tickets > 0 ? totales.ventas / totales.tickets : null;

    // Evolución día por día de toda la red, para ver si el mes viene bien o mal.
    const porDia = {};
    for (const v of ventas) {
      porDia[v.fecha] = porDia[v.fecha] || { fecha: v.fecha, ventas: 0, horas: 0, gasto_personal: 0 };
      porDia[v.fecha].ventas += n(v.total);
    }
    for (const rep of reportes) {
      porDia[rep.fecha] = porDia[rep.fecha] || { fecha: rep.fecha, ventas: 0, horas: 0, gasto_personal: 0 };
      for (const fila of horasDe(rep)) {
        const puesto = empleados[fila.empleado_id]?.puesto;
        const valor  = puesto ? valorEn(rep.local_id, puesto, rep.fecha) : null;
        porDia[rep.fecha].horas += fila.horas;
        if (valor) porDia[rep.fecha].gasto_personal += fila.horas * valor;
      }
    }
    const dias = Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => ({
      ...d,
      horas_sobre_ventas: (d.ventas > 0 && d.gasto_personal > 0)
        ? (d.gasto_personal / d.ventas) * 100 : null,
    }));

    res.json({ ok: true, data: { mes, locales: filas, totales, dias } });
  } catch (err) {
    console.error('[consolidado/mensual]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el mes' });
  }
});

// ── POST /objetivo ────────────────────────────────────────────────────────────

router.post('/objetivo', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { local_id, objetivo } = req.body;
    if (!local_id || !(Number(objetivo) > 0)) {
      return res.status(400).json({ ok: false, error: 'Falta el local o el objetivo' });
    }
    await pool.query('UPDATE locales SET objetivo_horas_ventas = $1 WHERE id = $2',
      [Number(objetivo), local_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[consolidado/objetivo]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el objetivo' });
  }
});

// ── Valor hora ────────────────────────────────────────────────────────────────

router.get('/valor-hora', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (v.local_id, v.puesto)
             v.id, v.local_id, v.puesto, v.valor_hora, v.vigente_desde, l.nombre AS local_nombre
      FROM valor_hora v JOIN locales l ON l.id = v.local_id
      ORDER BY v.local_id, v.puesto, v.vigente_desde DESC
    `);

    // Puestos que existen en cada local, para saber cuáles faltan cargar.
    const puestos = (await pool.query(`
      SELECT DISTINCT e.local_id_principal AS local_id, e.puesto, l.nombre AS local_nombre
      FROM empleados e JOIN locales l ON l.id = e.local_id_principal
      WHERE e.activo = true AND e.puesto IS NOT NULL
      ORDER BY e.local_id_principal, e.puesto
    `)).rows;

    res.json({ ok: true, data: { valores: rows, puestos } });
  } catch (err) {
    console.error('[consolidado/valor-hora GET]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener los valores hora' });
  }
});

router.post('/valor-hora', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { local_id, puesto, valor_hora, vigente_desde } = req.body;
    if (!local_id || !puesto || valor_hora == null) {
      return res.status(400).json({ ok: false, error: 'Faltan local, puesto o valor' });
    }
    if (!(Number(valor_hora) > 0)) {
      return res.status(400).json({ ok: false, error: 'El valor hora tiene que ser mayor a cero' });
    }

    const desde = vigente_desde || hoyStr();
    await pool.query(`
      INSERT INTO valor_hora (local_id, puesto, valor_hora, vigente_desde)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (local_id, puesto, vigente_desde)
      DO UPDATE SET valor_hora = EXCLUDED.valor_hora
    `, [local_id, puesto, Number(valor_hora), desde]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[consolidado/valor-hora POST]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el valor hora' });
  }
});

module.exports = router;
