// Tareas: lo que reemplaza al cierre del día.
//
// El encargado toma cada alerta, dice qué va a hacer y para cuándo, anota avances y
// gastos, y pide el cierre. La tarea termina cuando un dueño la aprueba. Todo queda en
// el seguimiento, que no se edita ni se borra.

const express = require('express');
const multer  = require('multer');
const pool    = require('../config/db');
const { requireAuth, requireRol, requireAdmin, ROLES } = require('../middleware/auth');
const { uploadToR2, getFromR2 } = require('../config/r2');
const T = require('../utils/tareas');
const avisos = require('../services/avisos');
const alertas = require('../services/alertas');
const { armarDia } = require('./consolidado');

const router = express.Router();
const soloEncargado = requireRol(ROLES.ENCARGADO_GENERAL);   // el dueño pasa siempre

// Resolver la tarea es trabajo del encargado y de nadie más: los dueños aprueban,
// piden o comentan, pero no la toman ni cargan avances (Martín, 11/10/2026). Acá el
// dueño NO pasa.
function encargadoNada(req, res, next) {
  if (req.user?.rol !== ROLES.ENCARGADO_GENERAL) {
    return res.status(403).json({ ok: false, error: 'Esto lo hace el encargado. Ustedes pueden aprobar, pedir algo o comentar.' });
  }
  next();
}

// Fotos del celular (el frontend las achica) y presupuestos en PDF.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype) && file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se pueden subir fotos o PDF'));
    }
    cb(null, true);
  },
});

const n = v => Number(v) || 0;
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const $ = v => `$ ${money.format(Math.round(v))}`;
const corto = alertas.corto;
const ddmm = f => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');

function fail(res, status, error) { return res.status(status).json({ ok: false, error }); }

// Todo lo que decide el encargado lo escribe él: las listas de utils/tareas.js son
// solo ideas en la pantalla (Martín, 11/10/2026). Acá solo se pide que no venga vacío.
const escrito = (v, max = 300) => String(v || '').trim().slice(0, max);

// El turno ve, debajo de cada pendiente de mantenimiento, qué va a hacer el encargado.
// Sale de la tarea: no se escribe dos veces.
async function planParaElTurno(t, accion, plazo, usuarioId) {
  if (t.tipo !== 'mantenimiento' || !t.detalle?.item_id) return;
  await pool.query(`
    UPDATE mantenimiento_items SET plan = $2, plan_por = $3, plan_at = NOW(), updated_at = NOW() WHERE id = $1
  `, [t.detalle.item_id, `${accion}, para el ${ddmm(plazo)}`, usuarioId]);
}

// ── Lectura ──────────────────────────────────────────────────────────────────

const SELECT_TAREA = `
  SELECT t.id, t.tipo, t.local_id, t.fecha::text AS fecha, t.clave, t.titulo, t.detalle,
         t.reporte_id, t.estado, t.accion, t.plazo::text AS plazo, t.tomada_por, t.tomada_at,
         t.cierre_tipo, t.resultado, t.resultado_monto, t.afectado_usuario_id,
         t.pedido_cierre_at, t.terminada_por, t.terminada_at, t.causa_id, t.created_at, t.updated_at,
         l.nombre AS local_nombre,
         ut.nombre AS tomada_por_nombre, ua.nombre AS afectado_nombre, uf.nombre AS terminada_por_nombre,
         (SELECT COUNT(*) FROM tarea_eventos e WHERE e.tarea_id = t.id AND e.tipo = 'plazo')::int AS cambios_plazo,
         (SELECT COALESCE(SUM(g.monto), 0) FROM tarea_gastos g
           WHERE g.tarea_id = t.id AND g.estado IN ('aprobado_solo', 'aprobado')) AS gastado
  FROM tareas t
  LEFT JOIN locales  l  ON l.id  = t.local_id
  LEFT JOIN usuarios ut ON ut.id = t.tomada_por
  LEFT JOIN usuarios ua ON ua.id = t.afectado_usuario_id
  LEFT JOIN usuarios uf ON uf.id = t.terminada_por
`;

// Le agrega a cada tarea sus relojes, si está vencida y el último movimiento.
async function enriquecer(tareas) {
  if (!tareas.length) return tareas;
  const eventos = (await pool.query(`
    SELECT e.id, e.tarea_id, e.tipo, e.texto, e.datos, e.created_at, u.nombre AS usuario
    FROM tarea_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tarea_id = ANY($1) ORDER BY e.created_at, e.id
  `, [tareas.map(t => t.id)])).rows;
  const hoy = T.hoyMendoza();
  return tareas.map(t => {
    const evs = eventos.filter(e => e.tarea_id === t.id);
    return {
      ...t,
      gastado: n(t.gastado),
      resultado_monto: t.resultado_monto === null ? null : n(t.resultado_monto),
      tipo_label: T.TIPOS[t.tipo]?.label || t.tipo,
      local_corto: corto(t.local_nombre),
      relojes: T.relojes(t, evs),
      dias_vencida: T.diasVencida(t, hoy),
      ultimo: evs[evs.length - 1] || null,
    };
  });
}

async function tareaPorId(id) {
  const { rows } = await pool.query(`${SELECT_TAREA} WHERE t.id = $1`, [id]);
  return rows[0] || null;
}

async function evento(tareaId, usuarioId, tipo, texto, datos = {}) {
  const { rows } = await pool.query(
    `INSERT INTO tarea_eventos (tarea_id, usuario_id, tipo, texto, datos) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
    [tareaId, usuarioId, tipo, texto || null, JSON.stringify(datos)]
  );
  return rows[0].id;
}

async function subirAdjunto(file, tareaId, usuarioId, { eventoId = null, gastoId = null, rol = 'foto' } = {}) {
  const ext = file.mimetype === 'application/pdf' ? 'pdf' : (file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
  const key = `tareas/${tareaId}/${Date.now()}-${rol}.${ext}`;
  await uploadToR2(key, file.buffer, file.mimetype);
  await pool.query(`
    INSERT INTO tarea_adjuntos (tarea_id, evento_id, gasto_id, rol, r2_key, mime, tamano, subido_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [tareaId, eventoId, gastoId, rol, key, file.mimetype, file.size, usuarioId]);
}

// ── GET /opciones ────────────────────────────────────────────────────────────
router.get('/opciones', requireAuth, (_req, res) => res.json({ ok: true, data: T.opciones() }));

// ── GET / (bandeja) ──────────────────────────────────────────────────────────
// Lo abierto, lo que espera a los dueños, lo terminado de los últimos días, los gastos
// que esperan aprobación y el cuadro de los últimos días por local.
router.get('/', requireAuth, soloEncargado, async (_req, res) => {
  try {
    const tareas = await enriquecer((await pool.query(`
      ${SELECT_TAREA}
      WHERE t.estado <> 'terminada' OR t.terminada_at > NOW() - INTERVAL '3 days'
      ORDER BY t.created_at
    `)).rows);

    const gastos = (await pool.query(`
      SELECT g.id, g.tarea_id, g.concepto, g.monto, g.estado, g.created_at,
             t.titulo, l.nombre AS local_nombre
      FROM tarea_gastos g JOIN tareas t ON t.id = g.tarea_id LEFT JOIN locales l ON l.id = t.local_id
      WHERE g.estado = 'pendiente' ORDER BY g.created_at
    `)).rows.map(g => ({ ...g, monto: n(g.monto), local_corto: corto(g.local_nombre) }));

    res.json({ ok: true, data: { tareas, gastos_pendientes: gastos, dias: await cuadroDias(), hoy: T.hoyMendoza() } });
  } catch (err) {
    console.error('[tareas GET]', err);
    fail(res, 500, 'No se pudo cargar la bandeja');
  }
});

// El cuadro "qué pasó en cada local": los últimos tres días que ya tienen algún Fudo
// cargado. El lunes son el viernes, el sábado y el domingo.
async function cuadroDias() {
  const hoy = T.hoyMendoza();
  const locales = (await pool.query('SELECT id, nombre FROM locales WHERE activo = true ORDER BY id')).rows;
  const fechas = [];
  for (let i = 1; i <= 10 && fechas.length < 3; i++) {
    const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - i);
    const f = T.fechaStr(d);
    if (f < T.INICIO) break;
    const cub = await alertas.localesCubiertos(f);
    if (cub.size) fechas.unshift({ fecha: f, cubiertos: cub });
  }
  // Si todavía no entró ningún Fudo desde el arranque, se muestran igual los días.
  if (!fechas.length) {
    for (let i = 3; i >= 1; i--) {
      const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - i);
      const f = T.fechaStr(d);
      if (f >= T.INICIO) fechas.push({ fecha: f, cubiertos: new Set() });
    }
  }

  const dias = [];
  for (const { fecha, cubiertos } of fechas) {
    const tickets = Object.fromEntries((await pool.query(
      `SELECT local_id, COUNT(*)::int AS n FROM ventas_tickets WHERE fecha = $1 AND estado = 'cerrada' GROUP BY local_id`, [fecha]
    )).rows.map(r => [r.local_id, r.n]));
    const abiertos = new Set(locales.filter(l => cubiertos.has(l.id) && tickets[l.id] > 0).map(l => l.id));
    const slots = await alertas.slotsDelDia(fecha, abiertos);
    const tareas = (await pool.query(
      `SELECT id, tipo, local_id, titulo, estado FROM tareas WHERE fecha = $1 AND tipo <> 'mantenimiento'`, [fecha]
    )).rows;
    dias.push({
      fecha,
      locales: locales.map(l => {
        const s = slots.filter(x => x.local_id === l.id);
        return {
          local_id: l.id, nombre: corto(l.nombre), nombre_completo: l.nombre,
          estado: !cubiertos.has(l.id) ? 'sin_fudo' : !abiertos.has(l.id) ? 'no_abrio' : 'abrio',
          esperados: s.length, recibidos: s.filter(x => x.reporte).length,
          tareas: tareas.filter(t => t.local_id === l.id).map(t => ({ id: t.id, tipo: t.tipo, label: T.TIPOS[t.tipo]?.label, estado: t.estado })),
        };
      }),
    });
  }
  return dias;
}

// ── GET /tablero (dueños) ────────────────────────────────────────────────────
router.get('/tablero', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const abiertas = await enriquecer((await pool.query(
      `${SELECT_TAREA} WHERE t.estado <> 'terminada' ORDER BY t.created_at`
    )).rows);
    const terminadas = await enriquecer((await pool.query(
      `${SELECT_TAREA} WHERE t.estado = 'terminada' AND t.terminada_at > NOW() - INTERVAL '30 days' ORDER BY t.terminada_at DESC`
    )).rows);

    // "En el plazo": pidió el cierre antes de que se le venciera la fecha que él puso.
    const conPlazo = terminadas.filter(t => t.plazo && t.pedido_cierre_at && t.cierre_tipo === 'resultado');
    const enPlazo = conPlazo.filter(t => T.fechaStr(new Date(t.pedido_cierre_at)) <= t.plazo).length;
    const prom = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;

    const kpis = {
      abiertas: abiertas.length,
      vencidas: abiertas.filter(t => t.dias_vencida > 0).length,
      mas_vieja_vencida: Math.max(0, ...abiertas.map(t => t.dias_vencida)),
      por_aprobar: abiertas.filter(t => t.estado === 'por_aprobar').length,
      ms_encargado: prom(terminadas.map(t => t.relojes.encargado_ms)),
      // Las que se aprobaron solas (causa conocida) no esperaron a nadie: no cuentan.
      ms_duenos: prom(terminadas.filter(t => t.terminada_por).map(t => t.relojes.duenos_ms)),
      en_plazo: enPlazo, con_plazo: conPlazo.length,
      descartadas: terminadas.filter(t => t.cierre_tipo === 'descarte').length,
      terminadas: terminadas.length,
    };

    const mesDesde = `${T.hoyMendoza().slice(0, 7)}-01`;
    const causas = (await pool.query(`
      SELECT c.id, c.local_id, c.tipo, c.resultado, c.created_at, u.nombre AS aprobada_por_nombre, l.nombre AS local_nombre,
             (SELECT COUNT(*) FROM tareas t WHERE t.causa_id = c.id AND t.fecha >= $1)::int AS usos,
             (SELECT COALESCE(SUM(t.resultado_monto), 0) FROM tareas t WHERE t.causa_id = c.id AND t.fecha >= $1) AS monto,
             (SELECT COUNT(*) FROM tarea_eventos e JOIN tareas t ON t.id = e.tarea_id
               WHERE t.local_id = c.local_id AND e.datos->>'no_coincide' = 'true' AND t.fecha >= $1)::int AS no_coincidio
      FROM causas_conocidas c LEFT JOIN usuarios u ON u.id = c.aprobada_por LEFT JOIN locales l ON l.id = c.local_id
      WHERE c.activa ORDER BY c.created_at
    `, [mesDesde])).rows.map(c => ({ ...c, monto: n(c.monto), local_corto: corto(c.local_nombre) }));

    const gastos = (await pool.query(`
      SELECT g.id, g.tarea_id, g.concepto, g.monto, g.estado, g.created_at, t.titulo, l.nombre AS local_nombre,
             EXISTS (SELECT 1 FROM tarea_adjuntos a WHERE a.gasto_id = g.id AND a.rol = 'comprobante') AS con_comprobante
      FROM tarea_gastos g JOIN tareas t ON t.id = g.tarea_id LEFT JOIN locales l ON l.id = t.local_id
      WHERE g.created_at >= $1::date ORDER BY g.created_at DESC
    `, [mesDesde])).rows.map(g => ({ ...g, monto: n(g.monto), local_corto: corto(g.local_nombre) }));

    // Por persona, últimos 30 días: lo que cuenta es cómo llegó el reporte cuando
    // entró el Fudo, no cómo quedó después.
    const personas = (await pool.query(`
      WITH r AS (
        SELECT usuario_id, COUNT(*)::int AS enviados FROM reportes
        WHERE estado <> 'borrador' AND fecha >= CURRENT_DATE - 30 GROUP BY usuario_id
      ), t AS (
        SELECT afectado_usuario_id AS usuario_id,
               COUNT(*) FILTER (WHERE tipo = 'no_cargo')::int AS no_cargo,
               COUNT(*) FILTER (WHERE tipo = 'no_cargo' AND detalle ? 'llego_tarde')::int AS llego_despues,
               COUNT(*) FILTER (WHERE tipo = 'ventas')::int AS ventas_mal
        FROM tareas WHERE afectado_usuario_id IS NOT NULL AND fecha >= CURRENT_DATE - 30 GROUP BY 1
      )
      SELECT u.id, u.nombre, COALESCE(r.enviados, 0) AS enviados, COALESCE(t.no_cargo, 0) AS no_cargo,
             COALESCE(t.llego_despues, 0) AS llego_despues, COALESCE(t.ventas_mal, 0) AS ventas_mal,
             (SELECT l.nombre FROM empleados e JOIN locales l ON l.id = e.local_id_principal WHERE e.id = u.empleado_id) AS local_nombre
      FROM usuarios u
      LEFT JOIN r ON r.usuario_id = u.id
      LEFT JOIN t ON t.usuario_id = u.id
      WHERE u.activo AND u.rol NOT IN ('admin', 'encargado_general') AND (r.enviados > 0 OR t.usuario_id IS NOT NULL)
      ORDER BY (COALESCE(t.no_cargo, 0) + COALESCE(t.ventas_mal, 0)) DESC, u.nombre
    `)).rows.map(p => ({ ...p, local_corto: corto(p.local_nombre) }));

    // Lo que se repite: el mismo tipo de problema en el mismo local, últimos 10 días.
    const repetidas = (await pool.query(`
      SELECT t.local_id, t.tipo, l.nombre AS local_nombre, COUNT(DISTINCT t.fecha)::int AS dias
      FROM tareas t LEFT JOIN locales l ON l.id = t.local_id
      WHERE t.fecha >= CURRENT_DATE - 10 AND t.tipo IN ('ventas', 'no_cargo', 'cafe', 'faltante')
      GROUP BY 1, 2, 3 HAVING COUNT(DISTINCT t.fecha) >= 3 ORDER BY dias DESC
    `)).rows.map(r => ({ ...r, local_corto: corto(r.local_nombre), label: T.TIPOS[r.tipo]?.label }));

    res.json({
      ok: true,
      data: {
        kpis, abiertas, causas, gastos, personas, repetidas,
        descartadas: terminadas.filter(t => t.cierre_tipo === 'descarte'),
      },
    });
  } catch (err) {
    console.error('[tareas/tablero]', err);
    fail(res, 500, 'No se pudo armar el tablero');
  }
});

// El último día que tiene el Fudo de todos los locales; si ninguno, ayer.
async function ultimoDiaCompleto() {
  const activos = n((await pool.query('SELECT COUNT(*) FROM locales WHERE activo = true')).rows[0].count);
  const hoy = T.hoyMendoza();
  for (let i = 1; i <= 10; i++) {
    const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - i);
    const f = T.fechaStr(d);
    if ((await alertas.localesCubiertos(f)).size >= activos) return f;
  }
  const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - 1);
  return T.fechaStr(d);
}

// ── El reporte del día ───────────────────────────────────────────────────────
// Se arma una sola vez y lo usan la pantalla y el PDF: lo mismo, en el mismo orden,
// solo cambia dónde se ve (Martín, 11/10/2026). Estructura aprobada en la maqueta:
// para decidir, cuatro números con su comparación, cada local, lo que salió mal, el
// encargado; después mantenimiento, vencimientos, café y plata; la deuda aparte.

const DIA_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLargaDe = f => { const d = new Date(`${f}T12:00:00`); return `${DIA_NOMBRE[d.getDay()]} ${d.getDate()} de ${MES_NOMBRE[d.getMonth()]}`; };
const correrFecha = (f, dias) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + dias); return T.fechaStr(d); };

// Venta, tickets y docenas por local en un rango de fechas.
async function ventasEntre(desde, hasta) {
  const { rows } = await pool.query(`
    SELECT t.local_id, COALESCE(SUM(t.total), 0) AS total, COUNT(*)::int AS tickets,
           COALESCE((SELECT SUM(i.docenas_equivalentes) FROM ventas_items i
                     JOIN ventas_tickets t2 ON t2.id = i.ticket_id
                     WHERE t2.local_id = t.local_id AND t2.fecha BETWEEN $1 AND $2
                       AND t2.estado = 'cerrada' AND NOT i.cancelada), 0) AS docenas
    FROM ventas_tickets t
    WHERE t.fecha BETWEEN $1 AND $2 AND t.estado = 'cerrada'
    GROUP BY t.local_id
  `, [desde, hasta]);
  return Object.fromEntries(rows.map(r => [r.local_id, { total: n(r.total), tickets: r.tickets, docenas: n(r.docenas) }]));
}
const sumaVentas = (m, campo, filtro = () => true) =>
  Object.entries(m).filter(([id]) => filtro(Number(id))).reduce((s, [, v]) => s + v[campo], 0);
const variacionPct = (hoy, antes) => (antes > 0 ? (hoy / antes - 1) * 100 : null);

// La grilla de vencimientos: producto en filas, tienda en columnas. Si un local lo
// reportó dos veces, se suman las unidades y queda el vencimiento más corto.
function grillaDe(items) {
  const lista = items.filter(it => it.producto && it.vence);
  const tiendas = [...new Set(lista.map(it => corto(it.local)))];
  const porProducto = new Map();
  for (const it of lista) {
    if (!porProducto.has(it.producto)) porProducto.set(it.producto, {});
    const fila = porProducto.get(it.producto);
    const loc = corto(it.local);
    const antes = fila[loc];
    fila[loc] = {
      cantidad: (antes?.cantidad || 0) + (Number(it.cantidad) || 0),
      dias: antes ? Math.min(antes.dias, Number(it.dias)) : Number(it.dias),
    };
  }
  const filas = [...porProducto.entries()].map(([producto, celdas]) => ({
    producto, celdas,
    urgencia: Math.min(...Object.values(celdas).map(c => c.dias)),
    unidades: Object.values(celdas).reduce((s, c) => s + c.cantidad, 0),
  })).sort((a, b) => a.urgencia - b.urgencia || a.producto.localeCompare(b.producto));
  return { tiendas, filas, mas_proximo: filas.length ? filas[0].urgencia : null };
}

async function armarReporte(fecha) {
  const activos = n((await pool.query('SELECT COUNT(*) FROM locales WHERE activo = true')).rows[0].count);
  const cubiertos = await alertas.localesCubiertos(fecha);
  const dia = await armarDia(fecha);
  const abiertos = new Set(dia.locales.filter(l => cubiertos.has(l.local_id) && l.tickets_sistema > 0).map(l => l.local_id));
  const slots = await alertas.slotsDelDia(fecha, abiertos);

  // Comparaciones: el mismo día de la semana anterior, y el mes contra el mismo tramo
  // del mes pasado. Siempre se dice contra qué fecha y cuánto fue.
  const ref = correrFecha(fecha, -7);
  const d = new Date(`${fecha}T12:00:00`);
  const mesDesde = `${fecha.slice(0, 7)}-01`;
  const finMesPasado = new Date(d.getFullYear(), d.getMonth(), 0);
  const mesPasadoDesde = `${T.fechaStr(finMesPasado).slice(0, 7)}-01`;
  const mesPasadoHasta = T.fechaStr(new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), finMesPasado.getDate())));
  const [vHoy, vRef, vMes, vMesPasado] = await Promise.all([
    ventasEntre(fecha, fecha), ventasEntre(ref, ref),
    ventasEntre(mesDesde, fecha), ventasEntre(mesPasadoDesde, mesPasadoHasta),
  ]);
  const esTienda = id => dia.locales.find(l => l.local_id === id)?.tipo !== 'cafeteria';

  // Tareas.
  const todas = await enriquecer((await pool.query(`${SELECT_TAREA} WHERE t.estado <> 'terminada' OR t.fecha = $1 ORDER BY t.created_at`, [fecha])).rows);
  const abiertas = todas.filter(t => t.estado !== 'terminada');
  const delDia = todas.filter(t => t.fecha === fecha && (t.tipo !== 'mantenimiento' || t.detalle?.desde === fecha));
  const gastosPend = (await pool.query(`
    SELECT g.id, g.tarea_id, g.concepto, g.monto, g.created_at, t.titulo, l.nombre AS local_nombre
    FROM tarea_gastos g JOIN tareas t ON t.id = g.tarea_id LEFT JOIN locales l ON l.id = t.local_id
    WHERE g.estado = 'pendiente' ORDER BY g.created_at
  `)).rows.map(g => ({ ...g, monto: n(g.monto), local_corto: corto(g.local_nombre) }));
  const tareaCorta = t => ({
    id: t.id, tipo: t.tipo, tipo_label: t.tipo_label, local: t.local_corto, local_nombre: t.local_nombre,
    titulo: t.titulo, estado: t.estado, accion: t.accion, plazo: t.plazo, resultado: t.resultado,
    resultado_monto: t.resultado_monto, cierre_tipo: t.cierre_tipo, dias_vencida: t.dias_vencida,
    aprobada_sola: t.estado === 'terminada' && t.causa_id && !t.terminada_por,
    esperando_ms: t.relojes.duenos_ms, desde: t.detalle?.desde || t.fecha,
  });

  // Cada local.
  const locales = dia.locales.map(l => {
    const hoy = vHoy[l.local_id] || { total: 0, tickets: 0, docenas: 0 };
    const antes = vRef[l.local_id] || { total: 0, tickets: 0, docenas: 0 };
    const tareaVentas = todas.find(t => t.tipo === 'ventas' && t.local_id === l.local_id && t.fecha === fecha);
    const esp = slots.filter(s => s.local_id === l.local_id);
    return {
      local_id: l.local_id, nombre: corto(l.nombre), nombre_completo: l.nombre, tipo: l.tipo,
      fudo: cubiertos.has(l.local_id), abrio: abiertos.has(l.local_id),
      venta: hoy.total, venta_ref: antes.total, var_venta: variacionPct(hoy.total, antes.total),
      docenas: l.tipo === 'cafeteria' ? null : hoy.docenas, docenas_ref: l.tipo === 'cafeteria' ? null : antes.docenas,
      ticket: l.tipo === 'cafeteria'
        ? (l.personas_reportadas ? hoy.total / l.personas_reportadas : (hoy.tickets ? hoy.total / hoy.tickets : null))
        : (hoy.tickets ? hoy.total / hoy.tickets : null),
      ticket_es: l.tipo === 'cafeteria' && l.personas_reportadas ? 'por persona' : 'por ticket',
      personas: l.tipo === 'cafeteria' ? l.personas_reportadas : null,
      personal: l.horas_sobre_ventas, objetivo: l.objetivo, personal_sin_dato: l.horas_incompletas,
      reportes: { esperados: esp.length, recibidos: esp.filter(s => s.reporte).length },
      diferencia: l.diferencia, completo: l.completo,
      tarea_ventas: tareaVentas ? tareaCorta(tareaVentas) : null,
    };
  });

  const tot = {
    venta: sumaVentas(vHoy, 'total'), venta_ref: sumaVentas(vRef, 'total'),
    docenas: sumaVentas(vHoy, 'docenas', esTienda), docenas_ref: sumaVentas(vRef, 'docenas', esTienda),
    mes: sumaVentas(vMes, 'total'), mes_pasado: sumaVentas(vMesPasado, 'total'),
    tickets_tiendas: sumaVentas(vHoy, 'tickets', esTienda), venta_tiendas: sumaVentas(vHoy, 'total', esTienda),
  };

  // Mantenimiento abierto: lo dicen las tareas, con los días desde que nació.
  const mant = abiertas.filter(t => t.tipo === 'mantenimiento').map(t => ({
    ...tareaCorta(t), rubro: t.detalle?.rubro || '', texto: t.detalle?.texto || t.titulo,
    dias: T.diasEntre(t.detalle?.desde || t.fecha, fecha),
  })).sort((a, b) => b.dias - a.dias);

  // Café en grano.
  const c = dia.cafe || {};
  const cafe = c.turnos?.length ? {
    manana: c.turnos.find(x => x.turno === 'Mañana') ? { usuario: c.turnos.find(x => x.turno === 'Mañana').usuario, kg: c.manana } : null,
    tarde: c.turnos.find(x => x.turno === 'Tarde') ? { usuario: c.turnos.find(x => x.turno === 'Tarde').usuario, kg: c.tarde } : null,
    consumo: c.consumo, teorico: c.control?.teorico ?? null, queda: c.queda,
    sin_definir: c.control?.sin_definir || 0,
  } : null;

  // Plata: lo que entró y salió ese día, y la deuda con proveedores (sin vencimientos:
  // se mira cuánto hace que está sin pagar cada factura).
  const p = dia.proveedores || {};
  const gastosTareas = (await pool.query(`
    SELECT g.concepto, g.monto, g.estado, t.titulo, l.nombre AS local_nombre,
           EXISTS (SELECT 1 FROM tarea_adjuntos a WHERE a.gasto_id = g.id AND a.rol = 'comprobante') AS con_comprobante
    FROM tarea_gastos g JOIN tareas t ON t.id = g.tarea_id LEFT JOIN locales l ON l.id = t.local_id
    WHERE (g.created_at AT TIME ZONE 'America/Argentina/Mendoza')::date = $1 ORDER BY g.id
  `, [fecha])).rows.map(g => ({ ...g, monto: n(g.monto), local_corto: corto(g.local_nombre) }));
  const facturasAbiertas = (await pool.query(`
    SELECT f.id, f.numero, f.fecha::text AS fecha, COALESCE(pr.nombre, f.proveedor) AS proveedor, l.nombre AS local_nombre,
           f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS saldo
    FROM facturas f LEFT JOIN proveedores pr ON pr.id = f.proveedor_id LEFT JOIN locales l ON l.id = f.local_id
    WHERE f.fecha <= $1
      AND f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) > 0
    ORDER BY f.fecha, f.id
  `, [fecha])).rows.map(f => ({ ...f, saldo: n(f.saldo), dias: T.diasEntre(f.fecha, fecha), local: corto(f.local_nombre) }));
  const tramo = (a, b) => {
    const fs = facturasAbiertas.filter(f => f.dias >= a && f.dias <= b);
    return { monto: fs.reduce((s, f) => s + f.saldo, 0), facturas: fs.length };
  };
  const porProv = {};
  for (const f of facturasAbiertas) {
    const x = (porProv[f.proveedor] ||= { proveedor: f.proveedor, deuda: 0, facturas: 0, mas_vieja: f.dias });
    x.deuda += f.saldo; x.facturas++; x.mas_vieja = Math.max(x.mas_vieja, f.dias);
  }

  const vencidas = abiertas.filter(t => t.dias_vencida > 0);
  return {
    fecha, fecha_larga: fechaLargaDe(fecha),
    ref: { fecha: ref, larga: fechaLargaDe(ref) },
    mes: { desde: mesDesde, hasta: fecha, pasado_desde: mesPasadoDesde, pasado_hasta: mesPasadoHasta },
    completo: cubiertos.size >= activos,
    sin_fudo: dia.locales.filter(l => !cubiertos.has(l.local_id)).map(l => corto(l.nombre)),
    reportes: { esperados: slots.length, recibidos: slots.filter(s => s.reporte).length },
    para_decidir: {
      tareas: abiertas.filter(t => t.estado === 'por_aprobar').map(tareaCorta),
      gastos: gastosPend,
    },
    kpis: {
      venta: tot.venta, venta_ref: tot.venta_ref, var_venta: variacionPct(tot.venta, tot.venta_ref),
      docenas: tot.docenas, docenas_ref: tot.docenas_ref, var_docenas: variacionPct(tot.docenas, tot.docenas_ref),
      mes: tot.mes, mes_pasado: tot.mes_pasado, var_mes: variacionPct(tot.mes, tot.mes_pasado),
      personal: dia.totales.horas_sobre_ventas, objetivo: dia.totales.objetivo,
      locales_con_kpi: dia.totales.locales_con_kpi, locales_con_venta: dia.totales.locales_con_venta,
      ticket_tiendas: tot.tickets_tiendas ? tot.venta_tiendas / tot.tickets_tiendas : null,
    },
    locales,
    salio_mal: delDia.map(tareaCorta).sort((a, b) => ({ nueva: 0, en_curso: 1, por_aprobar: 2, terminada: 3 })[a.estado] - ({ nueva: 0, en_curso: 1, por_aprobar: 2, terminada: 3 })[b.estado]),
    encargado: {
      abiertas: abiertas.length,
      sin_tomar: abiertas.filter(t => t.estado === 'nueva').length,
      vencidas: vencidas.length, mas_vieja_vencida: Math.max(0, ...vencidas.map(t => t.dias_vencida)),
      arreglos: mant.length, arreglo_mas_viejo: mant[0]?.dias || 0,
    },
    mantenimiento: mant,
    vencimientos: grillaDe(dia.novedades.vencimientos),
    cafe,
    plata: {
      facturas_hoy: { monto: p.total_cargadas || 0, cantidad: (p.cargadas || []).length },
      pagado_hoy: { monto: p.pagado_hoy || 0, cantidad: (p.pagos || []).length },
      gastos_caja: { monto: dia.novedades.total_gastos || 0, items: dia.novedades.gastos.map(g => ({ local: corto(g.local), detalle: g.detalle || g.tipo, monto: g.monto })) },
      gastos_tareas: gastosTareas,
      deuda: {
        total: facturasAbiertas.reduce((s, f) => s + f.saldo, 0),
        facturas: facturasAbiertas.length,
        mas_vieja: facturasAbiertas[0] ? { proveedor: facturasAbiertas[0].proveedor, dias: facturasAbiertas[0].dias, fecha: facturasAbiertas[0].fecha } : null,
        tramos: [
          { label: 'Hasta 7 días', ...tramo(0, 7) },
          { label: '8 a 15 días', ...tramo(8, 15) },
          { label: '16 a 30 días', ...tramo(16, 30) },
          { label: 'Más de 30 días', ...tramo(31, 100000) },
        ],
        por_proveedor: Object.values(porProv).sort((a, b) => b.deuda - a.deuda),
        mas_viejas: facturasAbiertas.slice(0, 10),
      },
    },
  };
}

// ── GET /dia (el reporte del día) ────────────────────────────────────────────
// Sin fecha, el último día que tiene el Fudo de todos los locales.
router.get('/dia', requireAuth, soloEncargado, async (req, res) => {
  try {
    const fecha = req.query.fecha || await ultimoDiaCompleto();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fail(res, 400, 'Fecha inválida');
    res.json({ ok: true, data: await armarReporte(fecha) });
  } catch (err) {
    console.error('[tareas/dia]', err);
    fail(res, 500, 'No se pudo armar el reporte del día');
  }
});

// ── GET /dia/pdf ─────────────────────────────────────────────────────────────
// El mismo reporte, en papel. Se arma en el momento: nunca queda viejo.
router.get('/dia/pdf', requireAuth, soloEncargado, async (req, res) => {
  try {
    const fecha = req.query.fecha || await ultimoDiaCompleto();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fail(res, 400, 'Fecha inválida');
    const { pdfDia } = require('../services/pdfDia');
    const buffer = await pdfDia(await armarReporte(fecha));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Reporte del dia ${fecha}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('[tareas/dia/pdf]', err);
    fail(res, 500, 'No se pudo armar el PDF');
  }
});

// ── GET /adjuntos/:id ────────────────────────────────────────────────────────
router.get('/adjuntos/:id', requireAuth, soloEncargado, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT r2_key, mime FROM tarea_adjuntos WHERE id = $1', [req.params.id]);
    if (!rows.length) return fail(res, 404, 'No se encontró el archivo');
    const obj = await getFromR2(rows[0].r2_key);
    res.setHeader('Content-Type', rows[0].mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    obj.Body.pipe(res);
  } catch (err) {
    console.error('[tareas/adjuntos]', err);
    fail(res, 500, 'No se pudo abrir el archivo');
  }
});

// ── POST /generar ────────────────────────────────────────────────────────────
// Vuelve a pasar el motor sobre la última semana. Lo hace solo cada import; esto es
// por si hace falta forzarlo.
router.post('/generar', requireAuth, soloEncargado, async (_req, res) => {
  try {
    res.json({ ok: true, data: { nuevas: await alertas.despuesDeImport() } });
  } catch (err) {
    console.error('[tareas/generar]', err);
    fail(res, 500, 'No se pudieron generar las alertas');
  }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, soloEncargado, async (req, res) => {
  try {
    const t = await tareaPorId(req.params.id);
    if (!t) return fail(res, 404, 'No existe esa tarea');
    const [tarea] = await enriquecer([t]);

    const eventos = (await pool.query(`
      SELECT e.id, e.tipo, e.texto, e.datos, e.created_at, u.nombre AS usuario, u.rol AS usuario_rol
      FROM tarea_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.tarea_id = $1 ORDER BY e.created_at, e.id
    `, [t.id])).rows;
    const adjuntos = (await pool.query(
      'SELECT id, evento_id, gasto_id, rol, mime, created_at FROM tarea_adjuntos WHERE tarea_id = $1 ORDER BY id', [t.id]
    )).rows;
    const gastos = (await pool.query(`
      SELECT g.id, g.concepto, g.monto, g.estado, g.created_at, g.respuesta, g.respondido_at,
             uc.nombre AS creado_por_nombre, ur.nombre AS respondido_por_nombre
      FROM tarea_gastos g LEFT JOIN usuarios uc ON uc.id = g.creado_por LEFT JOIN usuarios ur ON ur.id = g.respondido_por
      WHERE g.tarea_id = $1 ORDER BY g.id
    `, [t.id])).rows.map(g => ({
      ...g, monto: n(g.monto),
      adjuntos: adjuntos.filter(a => a.gasto_id === g.id),
      con_comprobante: adjuntos.some(a => a.gasto_id === g.id && a.rol === 'comprobante'),
    }));

    // Las personas que pudieron ser: los que cargan reporte en ese local.
    const personas = t.local_id ? (await pool.query(`
      SELECT u.id, u.nombre FROM usuarios u
      LEFT JOIN empleados e ON e.id = u.empleado_id
      WHERE u.activo AND u.rol NOT IN ('admin', 'encargado_general')
        AND (e.local_id_principal = $1 OR $1 = ANY(u.locales_permitidos))
      ORDER BY u.nombre
    `, [t.local_id])).rows : [];

    // Los reportes de ese local ese día, para abrirlos desde la tarea.
    const reportes = t.local_id ? (await pool.query(`
      SELECT r.id, r.turno, r.plantilla_codigo, r.enviado_at, u.nombre AS usuario_nombre
      FROM reportes r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.local_id = $1 AND r.fecha = $2 AND r.estado <> 'borrador' ORDER BY r.turno, r.id
    `, [t.local_id, t.fecha])).rows : [];

    const causa = t.tipo === 'ventas' && t.local_id ? (await pool.query(
      `SELECT id, resultado FROM causas_conocidas WHERE local_id = $1 AND tipo = 'ventas' AND activa ORDER BY id DESC LIMIT 1`,
      [t.local_id]
    )).rows[0] || null : null;

    const negativa = tarea.estado === 'en_curso' && tarea.resultado ? await ultimaRespuestaNegativa(tarea.id) : null;
    res.json({
      ok: true,
      data: {
        tarea,
        aprobar_igual: negativa ? { quien: negativa.nombre, tipo: negativa.tipo } : null,
        eventos: eventos.map(e => ({ ...e, adjuntos: adjuntos.filter(a => a.evento_id === e.id) })),
        gastos, personas, reportes, causa,
        opciones: T.TIPOS[t.tipo] || { acciones: [], resultados: [] },
      },
    });
  } catch (err) {
    console.error('[tareas GET :id]', err);
    fail(res, 500, 'No se pudo cargar la tarea');
  }
});

// ── Acciones del encargado ───────────────────────────────────────────────────

async function cargarParaEditar(req, res, estados) {
  const t = await tareaPorId(req.params.id);
  if (!t) { fail(res, 404, 'No existe esa tarea'); return null; }
  if (!estados.includes(t.estado)) {
    const txt = { por_aprobar: 'Está esperando la respuesta de un dueño', terminada: 'La tarea ya está terminada', nueva: 'Primero hay que tomarla' };
    fail(res, 409, txt[t.estado] || 'No se puede en este estado'); return null;
  }
  return t;
}

// POST /:id/tomar  { accion, plazo }
router.post('/:id/tomar', requireAuth, encargadoNada, async (req, res) => {
  try {
    const t = await cargarParaEditar(req, res, ['nueva']); if (!t) return;
    // Lo escribe el encargado: no todo se resuelve igual (Martín, 11/10/2026). La lista
    // del tipo queda solo como ideas en la pantalla.
    const accion = String(req.body.accion || '').trim().slice(0, 300);
    const { plazo } = req.body;
    if (accion.length < 3) return fail(res, 400, 'Escribí qué vas a hacer');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plazo || '')) return fail(res, 400, 'Poné para cuándo lo vas a resolver');
    if (plazo < T.hoyMendoza()) return fail(res, 400, 'La fecha no puede ser anterior a hoy');
    await pool.query(`
      UPDATE tareas SET estado = 'en_curso', accion = $2, plazo = $3, tomada_por = $4, tomada_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [t.id, accion, plazo, req.user.id]);
    await evento(t.id, req.user.id, 'tomada', `Va a hacer: ${accion}. Para el ${ddmm(plazo)}.`, { accion, plazo });
    await planParaElTurno(t, accion, plazo, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/tomar]', err);
    fail(res, 500, 'No se pudo tomar la tarea');
  }
});

// POST /:id/descartar  { motivo } — también la aprueba un dueño.
router.post('/:id/descartar', requireAuth, encargadoNada, async (req, res) => {
  try {
    const t = await cargarParaEditar(req, res, ['nueva', 'en_curso']); if (!t) return;
    const motivo = escrito(req.body.motivo);
    if (motivo.length < 3) return fail(res, 400, 'Escribí por qué no hay nada que hacer');
    await pool.query(`
      UPDATE tareas SET estado = 'por_aprobar', cierre_tipo = 'descarte', resultado = $2, resultado_monto = NULL,
             pedido_cierre_at = NOW(), tomada_por = COALESCE(tomada_por, $3), updated_at = NOW()
      WHERE id = $1
    `, [t.id, motivo, req.user.id]);
    await evento(t.id, req.user.id, 'pidio_cierre', `Pide descartarla: ${motivo}.`, { descarte: true, motivo });
    avisos.enSegundoPlano(avisos.aDuenos({
      titulo: `Para aprobar · ${corto(t.local_nombre) || 'Red'}`,
      texto: `Descartar "${t.titulo}": ${motivo}`,
      url: `/tareas/${t.id}`, etiqueta: `tarea-${t.id}`,
    }), 'descartar');
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/descartar]', err);
    fail(res, 500, 'No se pudo descartar');
  }
});

// POST /:id/avance  multipart { tipo, nota, foto? }
router.post('/:id/avance', requireAuth, encargadoNada, upload.single('foto'), async (req, res) => {
  try {
    const t = await cargarParaEditar(req, res, ['en_curso']); if (!t) return;
    const texto = escrito(req.body.texto || [req.body.tipo, req.body.nota].filter(Boolean).join(': '), 1000);
    if (texto.length < 3) return fail(res, 400, 'Escribí qué hiciste');
    const evId = await evento(t.id, req.user.id, 'avance', texto);
    if (req.file) await subirAdjunto(req.file, t.id, req.user.id, { eventoId: evId });
    await pool.query('UPDATE tareas SET updated_at = NOW() WHERE id = $1', [t.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/avance]', err);
    fail(res, 500, err.message || 'No se pudo guardar el avance');
  }
});

// POST /:id/plazo  { plazo, motivo }
router.post('/:id/plazo', requireAuth, encargadoNada, async (req, res) => {
  try {
    const t = await cargarParaEditar(req, res, ['en_curso']); if (!t) return;
    const { plazo } = req.body;
    const motivo = escrito(req.body.motivo);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plazo || '')) return fail(res, 400, 'Poné la fecha nueva');
    if (plazo < T.hoyMendoza()) return fail(res, 400, 'La fecha no puede ser anterior a hoy');
    if (plazo === t.plazo) return fail(res, 400, 'Es la misma fecha que ya tenía');
    if (motivo.length < 3) return fail(res, 400, 'Escribí por qué cambia la fecha');
    await pool.query('UPDATE tareas SET plazo = $2, updated_at = NOW() WHERE id = $1', [t.id, plazo]);
    await planParaElTurno(t, t.accion, plazo, req.user.id);
    await evento(t.id, req.user.id, 'plazo', `Cambió la fecha: ${ddmm(t.plazo)} → ${ddmm(plazo)}. Motivo: ${motivo}.`, { antes: t.plazo, despues: plazo, motivo });
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/plazo]', err);
    fail(res, 500, 'No se pudo cambiar la fecha');
  }
});

// POST /:id/gastos  multipart { concepto, monto, rol: presupuesto|comprobante, foto }
router.post('/:id/gastos', requireAuth, encargadoNada, upload.single('foto'), async (req, res) => {
  try {
    const t = await cargarParaEditar(req, res, ['en_curso']); if (!t) return;
    const concepto = (req.body.concepto || '').trim();
    const monto = Math.round(n(req.body.monto));
    const rol = req.body.rol === 'comprobante' ? 'comprobante' : 'presupuesto';
    if (!concepto) return fail(res, 400, 'Escribí qué es el gasto');
    if (monto <= 0) return fail(res, 400, 'Poné el monto');
    if (!req.file) return fail(res, 400, 'Adjuntá la foto del presupuesto o del comprobante');

    const estado = monto < T.TOPE_GASTO ? 'aprobado_solo' : 'pendiente';
    const { rows } = await pool.query(`
      INSERT INTO tarea_gastos (tarea_id, concepto, monto, estado, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id
    `, [t.id, concepto.slice(0, 200), monto, estado, req.user.id]);
    const gastoId = rows[0].id;
    await subirAdjunto(req.file, t.id, req.user.id, { gastoId, rol });
    await evento(t.id, req.user.id, 'gasto',
      `Gasto: ${concepto} ${$(monto)} (${rol}). ${estado === 'aprobado_solo' ? 'Menos de $ 100.000: aprobado solo.' : 'Pasa los $ 100.000: espera la aprobación de un dueño.'}`,
      { gasto_id: gastoId, monto, estado });
    if (estado === 'pendiente') {
      avisos.enSegundoPlano(avisos.aDuenos({
        titulo: `Gasto para aprobar: ${$(monto)}`,
        texto: `${corto(t.local_nombre) || 'Red'} · ${concepto} · ${t.titulo}`,
        url: `/tareas/${t.id}`, etiqueta: `gasto-${gastoId}`,
      }), 'gasto');
    }
    res.json({ ok: true, data: { estado } });
  } catch (err) {
    console.error('[tareas/gastos]', err);
    fail(res, 500, err.message || 'No se pudo cargar el gasto');
  }
});

// POST /gastos/:gid/comprobante  multipart { foto }
router.post('/gastos/:gid/comprobante', requireAuth, encargadoNada, upload.single('foto'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT g.*, t.estado AS tarea_estado FROM tarea_gastos g JOIN tareas t ON t.id = g.tarea_id WHERE g.id = $1', [req.params.gid]
    );
    if (!rows.length) return fail(res, 404, 'No existe ese gasto');
    const g = rows[0];
    if (!['aprobado_solo', 'aprobado'].includes(g.estado)) return fail(res, 409, 'Ese gasto no está aprobado');
    if (!req.file) return fail(res, 400, 'Adjuntá la foto del comprobante');
    await subirAdjunto(req.file, g.tarea_id, req.user.id, { gastoId: g.id, rol: 'comprobante' });
    await evento(g.tarea_id, req.user.id, 'comprobante', `Subió el comprobante de pago: ${g.concepto} ${$(n(g.monto))}.`, { gasto_id: g.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/comprobante]', err);
    fail(res, 500, err.message || 'No se pudo subir el comprobante');
  }
});

// POST /:id/pedir-cierre  multipart { resultado, monto?, afectado_usuario_id?, nota?, foto? }
router.post('/:id/pedir-cierre', requireAuth, encargadoNada, upload.single('foto'), async (req, res) => {
  try {
    const t = await cargarParaEditar(req, res, ['en_curso']); if (!t) return;
    const tipo = T.TIPOS[t.tipo];
    const resultado = escrito(req.body.resultado);
    if (resultado.length < 3) return fail(res, 400, 'Escribí qué era');
    // Si eligió una idea que habla de plata (venta ficticia, faltante), el monto es
    // obligatorio: es lo que se compara contra la diferencia. Si no, es opcional.
    const conMonto = (tipo?.con_monto || []).includes(resultado);
    const monto = n(req.body.monto) > 0 ? Math.round(n(req.body.monto)) : null;
    if (conMonto && !monto) return fail(res, 400, 'Poné el monto');
    const afectado = req.body.afectado_usuario_id ? Number(req.body.afectado_usuario_id) : null;

    // Sin comprobante no se cierra: lo que se gastó tiene que quedar registrado.
    const gastos = (await pool.query(`
      SELECT g.id, g.concepto, g.estado,
             EXISTS (SELECT 1 FROM tarea_adjuntos a WHERE a.gasto_id = g.id AND a.rol = 'comprobante') AS con_comprobante
      FROM tarea_gastos g WHERE g.tarea_id = $1
    `, [t.id])).rows;
    const faltan = [
      ...gastos.filter(g => g.estado === 'pendiente').map(g => `El gasto "${g.concepto}" todavía espera la aprobación de un dueño`),
      ...gastos.filter(g => ['aprobado_solo', 'aprobado'].includes(g.estado) && !g.con_comprobante).map(g => `Falta el comprobante de pago de "${g.concepto}"`),
    ];
    if (faltan.length) return res.status(400).json({ ok: false, error: faltan[0], data: { faltan } });

    const nota = (req.body.nota || '').trim();
    await pool.query(`
      UPDATE tareas SET estado = 'por_aprobar', cierre_tipo = 'resultado', resultado = $2, resultado_monto = $3,
             afectado_usuario_id = COALESCE($4, afectado_usuario_id), pedido_cierre_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [t.id, resultado, monto, afectado]);
    const evId = await evento(t.id, req.user.id, 'pidio_cierre',
      `Pide cerrar: ${resultado}${monto ? ` (${$(monto)})` : ''}${nota ? `. ${nota}` : ''}`,
      { resultado, monto, afectado });
    if (req.file) await subirAdjunto(req.file, t.id, req.user.id, { eventoId: evId });

    // Causa conocida: si los dueños ya aprobaron esto como normal para el local, se
    // aprueba sola, pero solo si el monto declarado coincide con la diferencia.
    let sola = false;
    if (t.tipo === 'ventas' && t.local_id) {
      const causa = (await pool.query(
        `SELECT id, resultado FROM causas_conocidas WHERE local_id = $1 AND tipo = 'ventas' AND activa AND resultado = $2 ORDER BY id DESC LIMIT 1`,
        [t.local_id, resultado]
      )).rows[0];
      if (causa) {
        const dif = Math.abs(n(t.detalle?.diferencia));
        if (monto && Math.abs(monto - dif) < 1) {
          await pool.query(`
            UPDATE tareas SET estado = 'terminada', causa_id = $2, terminada_at = NOW(), updated_at = NOW() WHERE id = $1
          `, [t.id, causa.id]);
          await evento(t.id, null, 'aprobada', `Se aprobó sola: es una causa conocida (${causa.resultado}) y el monto coincide con la diferencia.`, { causa_id: causa.id });
          sola = true;
        } else {
          await evento(t.id, null, 'sistema',
            `El monto declarado (${$(monto || 0)}) no coincide con la diferencia (${$(dif)}): no se aprueba sola, va a los dueños.`,
            { no_coincide: true });
        }
      }
    }

    if (!sola) {
      avisos.enSegundoPlano(avisos.aDuenos({
        titulo: `Para aprobar · ${corto(t.local_nombre) || 'Red'}`,
        texto: `${t.titulo} → ${resultado}${monto ? ` (${$(monto)})` : ''}`,
        url: `/tareas/${t.id}`, etiqueta: `tarea-${t.id}`,
      }), 'pedir-cierre');
    }
    res.json({ ok: true, data: { aprobada_sola: sola } });
  } catch (err) {
    console.error('[tareas/pedir-cierre]', err);
    fail(res, 500, err.message || 'No se pudo pedir el cierre');
  }
});

// ── Comentarios ──────────────────────────────────────────────────────────────
// Cualquier dueño y el encargado pueden escribir en una tarea cuando quieran, aunque
// ya esté terminada. Queda en el seguimiento como todo lo demás.
router.post('/:id/comentar', requireAuth, soloEncargado, async (req, res) => {
  try {
    const t = await tareaPorId(req.params.id);
    if (!t) return fail(res, 404, 'No existe esa tarea');
    const texto = String(req.body.texto || '').trim().slice(0, 1000);
    if (!texto) return fail(res, 400, 'Escribí el comentario');
    await evento(t.id, req.user.id, 'comentario', texto);
    await pool.query('UPDATE tareas SET updated_at = NOW() WHERE id = $1', [t.id]);
    const payload = {
      titulo: `${req.user.nombre} comentó`,
      texto: `${corto(t.local_nombre) || 'Red'}: ${t.titulo} · "${texto.slice(0, 140)}"`,
      url: `/tareas/${t.id}`, etiqueta: `comentario-${t.id}`,
    };
    // A todos los dueños siempre; al encargado, si el que escribió es un dueño.
    avisos.enSegundoPlano(avisos.aDuenos(payload), 'comentario');
    if (req.user.rol !== ROLES.ENCARGADO_GENERAL) avisarEncargado(t, payload);
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/comentar]', err);
    fail(res, 500, 'No se pudo guardar el comentario');
  }
});

// ── Respuestas de los dueños ─────────────────────────────────────────────────

// Al encargado que la tomó; si nadie la tomó, a todos los encargados.
function avisarEncargado(t, payload) {
  const p = t.tomada_por ? avisos.enviarAUsuarios([t.tomada_por], payload) : avisos.aEncargados(payload);
  avisos.enSegundoPlano(p, 'respuesta');
}

// A todos los dueños, incluido el que respondió: así los cuatro saben que ya se
// contestó y qué se dijo. Usa la misma etiqueta que el "Para aprobar", que queda
// reemplazado en el celular.
function avisarDuenos(payload) {
  avisos.enSegundoPlano(avisos.aDuenos(payload), 'respuesta a dueños');
}

// Si un dueño rechazó o pidió más, otro dueño puede aprobarla igual: quizás sabe algo
// que el primero no (Martín, 11/10/2026). Vale mientras la última respuesta al pedido de
// cierre sea negativa, y el que aprueba tiene que aclarar por qué.
async function ultimaRespuestaNegativa(tareaId) {
  const { rows } = await pool.query(`
    SELECT e.tipo, u.nombre FROM tarea_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tarea_id = $1 AND e.tipo IN ('pidio_cierre', 'aprobada', 'pidio_mas', 'rechazada')
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1
  `, [tareaId]);
  return rows[0] && ['pidio_mas', 'rechazada'].includes(rows[0].tipo) ? rows[0] : null;
}

// POST /:id/responder  { accion: aprobar|pedir|rechazar, texto, causa_conocida }
router.post('/:id/responder', requireAuth, requireAdmin, async (req, res) => {
  try {
    const t = await tareaPorId(req.params.id);
    if (!t) return fail(res, 404, 'No existe esa tarea');
    const { accion } = req.body;
    const texto = (req.body.texto || '').trim();
    let aprobarIgual = null;
    if (t.estado !== 'por_aprobar') {
      if (t.estado === 'terminada') return fail(res, 409, 'Ya la aprobó otro dueño');
      aprobarIgual = accion === 'aprobar' && t.estado === 'en_curso' && t.resultado ? await ultimaRespuestaNegativa(t.id) : null;
      if (!aprobarIgual) return fail(res, 409, 'No está esperando aprobación');
      if (!texto) return fail(res, 400, `${aprobarIgual.nombre} la ${aprobarIgual.tipo === 'rechazada' ? 'rechazó' : 'devolvió'}: escribí por qué la aprobás igual`);
    }

    if (accion === 'aprobar') {
      let causaId = null;
      if (req.body.causa_conocida && t.tipo === 'ventas' && t.cierre_tipo === 'resultado' && t.local_id) {
        const ya = (await pool.query(
          `SELECT id FROM causas_conocidas WHERE local_id = $1 AND tipo = 'ventas' AND resultado = $2 AND activa`, [t.local_id, t.resultado]
        )).rows[0];
        causaId = ya?.id || (await pool.query(
          `INSERT INTO causas_conocidas (local_id, tipo, resultado, aprobada_por) VALUES ($1, 'ventas', $2, $3) RETURNING id`,
          [t.local_id, t.resultado, req.user.id]
        )).rows[0].id;
      }
      await pool.query(`
        UPDATE tareas SET estado = 'terminada', terminada_por = $2, terminada_at = NOW(), causa_id = COALESCE($3, causa_id), updated_at = NOW()
        WHERE id = $1
      `, [t.id, req.user.id, causaId]);
      await evento(t.id, req.user.id, 'aprobada',
        `${aprobarIgual ? `Aprobada igual (${aprobarIgual.nombre} la había ${aprobarIgual.tipo === 'rechazada' ? 'rechazado' : 'devuelto'})` : 'Aprobada'}${texto ? `: ${texto}` : '.'}${causaId ? ' Quedó como causa conocida del local: las próximas se aprueban solas si el monto coincide.' : ''}`,
        { causa_id: causaId, aprobada_igual: !!aprobarIgual });
      // El mantenimiento terminado se saca de la lista que ven los turnos.
      if (t.tipo === 'mantenimiento' && t.detalle?.item_id) {
        await pool.query(`
          UPDATE mantenimiento_items SET estado = 'resuelto', resuelto_fecha = $2, updated_at = NOW()
          WHERE id = $1 AND estado = 'abierto'
        `, [t.detalle.item_id, T.hoyMendoza()]);
      }
      avisarEncargado(t, { titulo: 'Tarea aprobada', texto: `${req.user.nombre}: ${t.titulo}`, url: `/tareas/${t.id}`, etiqueta: `tarea-${t.id}` });
      avisarDuenos({
        titulo: aprobarIgual ? `${req.user.nombre} aprobó igual una tarea que ${aprobarIgual.nombre} había ${aprobarIgual.tipo === 'rechazada' ? 'rechazado' : 'devuelto'}` : `${req.user.nombre} aprobó una tarea`,
        texto: `${corto(t.local_nombre) || 'Red'}: ${t.titulo} → ${t.resultado}${causaId ? ' (quedó como causa conocida)' : ''}`,
        url: `/tareas/${t.id}`, etiqueta: `tarea-${t.id}`,
      });
    } else if (accion === 'pedir' || accion === 'rechazar') {
      if (!texto) return fail(res, 400, accion === 'pedir' ? 'Escribí qué le pedís' : 'Escribí por qué no alcanza');
      await pool.query(`UPDATE tareas SET estado = 'en_curso', updated_at = NOW() WHERE id = $1`, [t.id]);
      await evento(t.id, req.user.id, accion === 'pedir' ? 'pidio_mas' : 'rechazada', texto);
      avisarEncargado(t, {
        titulo: accion === 'pedir' ? `${req.user.nombre} te pide más` : `${req.user.nombre} no la aprobó`,
        texto: `${t.titulo}: ${texto}`, url: `/tareas/${t.id}`, etiqueta: `tarea-${t.id}`,
      });
      avisarDuenos({
        titulo: accion === 'pedir' ? `${req.user.nombre} le pidió más al encargado` : `${req.user.nombre} no aprobó una tarea`,
        texto: `${corto(t.local_nombre) || 'Red'}: ${t.titulo} · "${texto}"`,
        url: `/tareas/${t.id}`, etiqueta: `tarea-${t.id}`,
      });
    } else {
      return fail(res, 400, 'Acción inválida');
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/responder]', err);
    fail(res, 500, 'No se pudo guardar la respuesta');
  }
});

// POST /gastos/:gid/responder  { accion: aprobar|otro|rechazar, texto }
router.post('/gastos/:gid/responder', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT g.*, t.titulo, t.tomada_por, t.id AS tid, l.nombre AS local_nombre
      FROM tarea_gastos g JOIN tareas t ON t.id = g.tarea_id LEFT JOIN locales l ON l.id = t.local_id WHERE g.id = $1
    `, [req.params.gid]);
    if (!rows.length) return fail(res, 404, 'No existe ese gasto');
    const g = rows[0];
    if (g.estado !== 'pendiente') return fail(res, 409, 'Ese gasto ya tiene respuesta');
    const { accion } = req.body;
    const texto = (req.body.texto || '').trim();
    if (!['aprobar', 'otro', 'rechazar'].includes(accion)) return fail(res, 400, 'Acción inválida');
    if (accion === 'rechazar' && !texto) return fail(res, 400, 'Escribí por qué no');

    const estado = accion === 'aprobar' ? 'aprobado' : 'rechazado';
    const respuesta = accion === 'otro' ? `Pidió otro presupuesto${texto ? `: ${texto}` : ''}` : texto || null;
    await pool.query(`
      UPDATE tarea_gastos SET estado = $2, respondido_por = $3, respondido_at = NOW(), respuesta = $4 WHERE id = $1
    `, [g.id, estado, req.user.id, respuesta]);
    const msg = accion === 'aprobar'
      ? `Aprobó el gasto ${g.concepto} ${$(n(g.monto))}. Ya se puede hacer; la tarea no cierra sin el comprobante.`
      : accion === 'otro' ? `Pidió otro presupuesto para ${g.concepto}${texto ? `: ${texto}` : ''}.`
      : `No aprobó el gasto ${g.concepto}: ${texto}`;
    await evento(g.tid, req.user.id, accion === 'aprobar' ? 'gasto_aprobado' : 'gasto_rechazado', msg, { gasto_id: g.id });
    avisarEncargado({ tomada_por: g.tomada_por, id: g.tid }, {
      titulo: accion === 'aprobar' ? `Gasto aprobado: ${$(n(g.monto))}` : accion === 'otro' ? 'Piden otro presupuesto' : 'Gasto no aprobado',
      texto: `${g.concepto} · ${g.titulo}`, url: `/tareas/${g.tid}`, etiqueta: `gasto-${g.id}`,
    });
    avisarDuenos({
      titulo: accion === 'aprobar' ? `${req.user.nombre} aprobó un gasto de ${$(n(g.monto))}`
        : accion === 'otro' ? `${req.user.nombre} pidió otro presupuesto` : `${req.user.nombre} no aprobó un gasto`,
      texto: `${corto(g.local_nombre) || 'Red'}: ${g.concepto} ${$(n(g.monto))} · ${g.titulo}${texto ? ` · "${texto}"` : ''}`,
      url: `/tareas/${g.tid}`, etiqueta: `gasto-${g.id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/gastos/responder]', err);
    fail(res, 500, 'No se pudo guardar la respuesta');
  }
});

// POST /causas/:cid/baja — un dueño deja de aceptar esa causa como normal.
router.post('/causas/:cid/baja', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE causas_conocidas SET activa = false, baja_por = $2, baja_at = NOW() WHERE id = $1 AND activa`,
      [req.params.cid, req.user.id]
    );
    if (!rowCount) return fail(res, 404, 'Esa causa ya no está activa');
    res.json({ ok: true });
  } catch (err) {
    console.error('[tareas/causas/baja]', err);
    fail(res, 500, 'No se pudo dar de baja');
  }
});

module.exports = router;
