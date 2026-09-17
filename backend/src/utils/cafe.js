// Consumo teórico de café: lo que vendió la cafetería multiplicado por los gramos que
// lleva cada producto según el maestro de café. Se compara contra lo que pesaron los
// baristas (utils/etapas → cafeDeReporte).
const pool = require('../config/db');
const { cafeDeReporte } = require('./etapas');

const TZ = 'America/Argentina/Mendoza';

async function localCafeteria() {
  const { rows } = await pool.query("SELECT id FROM locales WHERE tipo = 'cafeteria' AND activo = true ORDER BY id LIMIT 1");
  return rows[0]?.id || null;
}

// Gramos teóricos de un día, partidos en mañana y tarde por un corte: la hora en que
// la barista de la tarde recibió el turno (o en que la de la mañana lo entregó).
// La hora del ticket está guardada como reloj de pared etiquetado UTC (ver memoria),
// por eso se compara en "naive": ticket AT TIME ZONE 'UTC' contra corte en Mendoza.
async function teoricoCafe(fecha, localId, corte) {
  if (!localId) return null;
  const { rows } = await pool.query(`
    SELECT
      CASE WHEN $3::timestamptz IS NULL THEN 'Mañana'
           WHEN (t.creacion AT TIME ZONE 'UTC') < ($3::timestamptz AT TIME ZONE '${TZ}') THEN 'Mañana'
           ELSE 'Tarde' END AS turno,
      SUM(i.cantidad * pc.cafe_gramos) FILTER (WHERE pc.cafe_gramos IS NOT NULL) AS gramos
    FROM ventas_items i
    JOIN ventas_tickets t ON t.id = i.ticket_id
    LEFT JOIN productos_catalogo pc ON pc.id = i.producto_id
    WHERE t.local_id = $1 AND t.fecha = $2 AND t.estado = 'cerrada'
      AND NOT COALESCE(i.cancelada, false)
    GROUP BY 1
  `, [localId, fecha, corte || null]);

  const g = v => Math.round(Number(v || 0));
  const porTurno = { 'Mañana': 0, 'Tarde': 0 };
  for (const r of rows) porTurno[r.turno] = g(r.gramos);

  // Lo vendido sin gramos definidos se cuenta aparte, sin partir por turno: son
  // productos distintos del día entero.
  const sd = (await pool.query(`
    SELECT COALESCE(SUM(i.cantidad), 0) AS unidades, COUNT(DISTINCT pc.id) AS productos
    FROM ventas_items i
    JOIN ventas_tickets t ON t.id = i.ticket_id
    LEFT JOIN productos_catalogo pc ON pc.id = i.producto_id
    WHERE t.local_id = $1 AND t.fecha = $2 AND t.estado = 'cerrada'
      AND NOT COALESCE(i.cancelada, false) AND pc.cafe_gramos IS NULL
  `, [localId, fecha])).rows[0];
  const sinDefinir = Number(sd.unidades), productosSinDefinir = Number(sd.productos);
  const total = porTurno['Mañana'] + porTurno['Tarde'];
  return {
    total_kg: total / 1000,
    por_turno: { 'Mañana': porTurno['Mañana'] / 1000, 'Tarde': porTurno['Tarde'] / 1000 },
    sin_definir: sinDefinir,                     // unidades vendidas de productos sin gramos
    productos_sin_definir: productosSinDefinir,  // cuántos productos distintos
    con_corte: !!corte,
  };
}

// El corte entre turnos sale de los reportes de barista del día.
function corteDe(turnos) {
  const tarde  = turnos.find(t => t.turno === 'Tarde');
  const manana = turnos.find(t => t.turno === 'Mañana');
  return tarde?.apertura_at || manana?.enviado_at || null;
}

// Un día: lo pesado por turno contra lo teórico por turno.
function compararDia(turnos, teorico) {
  const filas = turnos.map(t => ({
    turno: t.turno, usuario: t.usuario,
    real: t.consumo,
    teorico: teorico && teorico.con_corte ? teorico.por_turno[t.turno] ?? null : null,
  }));
  for (const f of filas) {
    f.diferencia = (f.real !== null && f.teorico !== null) ? Math.round((f.real - f.teorico) * 100) / 100 : null;
  }
  const conPesaje = turnos.filter(t => t.consumo !== null);
  const real = conPesaje.length ? Math.round(conPesaje.reduce((s, t) => s + t.consumo, 0) * 100) / 100 : null;
  const teo  = teorico ? Math.round(teorico.total_kg * 100) / 100 : null;
  return {
    turnos: filas, real, teorico: teo,
    diferencia: (real !== null && teo !== null) ? Math.round((real - teo) * 100) / 100 : null,
    sin_definir: teorico?.sin_definir || 0,
    productos_sin_definir: teorico?.productos_sin_definir || 0,
  };
}

// Control de un rango de días, para la pantalla del maestro.
async function controlCafe(desde, hasta) {
  const localId = await localCafeteria();
  if (!localId) return [];
  const plantillas = (await pool.query('SELECT codigo, campos FROM reporte_plantillas WHERE activo = true')).rows;
  const reportes = (await pool.query(`
    SELECT r.fecha::text AS fecha, r.turno, r.respuestas, r.plantilla_codigo, r.apertura_at, r.enviado_at,
           u.nombre AS usuario
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.local_id = $1 AND r.fecha BETWEEN $2 AND $3 AND r.estado IN ('enviado', 'aprobado')
    ORDER BY r.fecha, r.turno
  `, [localId, desde, hasta])).rows;

  const porDia = new Map();
  for (const r of reportes) {
    const p = plantillas.find(x => x.codigo === r.plantilla_codigo);
    const c = p ? cafeDeReporte(p.campos, r.respuestas) : null;
    if (!c) continue;
    if (!porDia.has(r.fecha)) porDia.set(r.fecha, []);
    porDia.get(r.fecha).push({ turno: r.turno, usuario: r.usuario, apertura_at: r.apertura_at, enviado_at: r.enviado_at, ...c });
  }

  // Todos los días con ventas del café en el rango, tengan o no reporte de barista.
  const dias = (await pool.query(
    "SELECT DISTINCT fecha::text AS fecha FROM ventas_tickets WHERE local_id = $1 AND fecha BETWEEN $2 AND $3 AND estado = 'cerrada' ORDER BY 1",
    [localId, desde, hasta]
  )).rows.map(r => r.fecha);
  for (const f of porDia.keys()) if (!dias.includes(f)) dias.push(f);
  dias.sort();

  const out = [];
  for (const fecha of dias) {
    const turnos = (porDia.get(fecha) || []).sort((a, b) => (a.turno === 'Mañana' ? 0 : 1) - (b.turno === 'Mañana' ? 0 : 1));
    const teorico = await teoricoCafe(fecha, localId, corteDe(turnos));
    out.push({ fecha, ...compararDia(turnos, teorico) });
  }
  return out;
}

module.exports = { localCafeteria, teoricoCafe, corteDe, compararDia, controlCafe };
