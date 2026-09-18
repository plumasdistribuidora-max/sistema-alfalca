// Consumo de café del día: lo que pesó la barista de la mañana al entrar menos lo que
// pesó la de la tarde al terminar. Se compara contra el teórico: lo que vendió la
// cafetería multiplicado por los gramos que lleva cada producto según el maestro.
const pool = require('../config/db');
const { pesajeDeReporte } = require('./pesaje');

const r2 = v => Math.round(v * 100) / 100;

async function localCafeteria() {
  const { rows } = await pool.query("SELECT id FROM locales WHERE tipo = 'cafeteria' AND activo = true ORDER BY id LIMIT 1");
  return rows[0]?.id || null;
}

// Gramos teóricos de un día entero. La hora del ticket está guardada como reloj de
// pared etiquetado UTC (ver memoria): el día se corta en "naive".
async function teoricoCafe(fecha, localId) {
  if (!localId) return null;
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(i.cantidad * pc.cafe_gramos) FILTER (WHERE pc.cafe_gramos IS NOT NULL), 0) AS gramos,
      COALESCE(SUM(i.cantidad) FILTER (WHERE pc.cafe_gramos IS NULL), 0) AS sin_definir,
      COUNT(DISTINCT pc.id) FILTER (WHERE pc.cafe_gramos IS NULL) AS productos_sin_definir
    FROM ventas_items i
    LEFT JOIN productos_catalogo pc ON pc.id = i.producto_id
    WHERE i.local_id = $1 AND (i.fecha_creacion AT TIME ZONE 'UTC')::date = $2
      AND NOT COALESCE(i.cancelada, false)
  `, [localId, fecha]);
  const t = rows[0];
  return {
    total_kg: Math.round(Number(t.gramos)) / 1000,
    sin_definir: Number(t.sin_definir),                     // unidades vendidas de productos sin gramos
    productos_sin_definir: Number(t.productos_sin_definir), // cuántos productos distintos
  };
}

// El café de un día a partir de sus reportes de barista (ya elegido uno por turno):
// los dos pesajes, el consumo (mañana menos tarde), con cuánto queda el café, y el
// control contra el teórico.
function cafeDelDia(reportes, plantillas, teorico) {
  const turnos = [];
  for (const rep of reportes) {
    const p = plantillas.find(x => x.codigo === rep.plantilla_codigo);
    const pesaje = p ? pesajeDeReporte(p.campos, rep.respuestas) : null;
    if (!pesaje) continue;
    turnos.push({ turno: rep.turno, usuario: rep.usuario_nombre, enviado_at: rep.enviado_at, ...pesaje });
  }
  turnos.sort((a, b) => (a.turno === 'Mañana' ? 0 : 1) - (b.turno === 'Mañana' ? 0 : 1));

  const manana = turnos.find(t => t.turno === 'Mañana')?.total ?? null;
  const tarde  = turnos.find(t => t.turno === 'Tarde')?.total ?? null;
  const consumo = (manana !== null && tarde !== null) ? r2(manana - tarde) : null;
  const teo = teorico ? r2(teorico.total_kg) : null;
  return {
    turnos, manana, tarde, consumo,
    queda: tarde,
    control: teorico ? {
      real: consumo, teorico: teo,
      diferencia: (consumo !== null && teo !== null) ? r2(consumo - teo) : null,
      sin_definir: teorico.sin_definir,
      productos_sin_definir: teorico.productos_sin_definir,
    } : null,
  };
}

// Control de un rango de días, para la pantalla del maestro.
async function controlCafe(desde, hasta) {
  const localId = await localCafeteria();
  if (!localId) return [];
  const plantillas = (await pool.query('SELECT codigo, campos FROM reporte_plantillas WHERE activo = true')).rows;
  const reportes = (await pool.query(`
    SELECT r.fecha::text AS fecha, r.turno, r.respuestas, r.plantilla_codigo, r.enviado_at,
           u.nombre AS usuario_nombre
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.local_id = $1 AND r.fecha BETWEEN $2 AND $3 AND r.estado IN ('enviado', 'aprobado')
    ORDER BY r.fecha, r.turno, r.enviado_at
  `, [localId, desde, hasta])).rows;

  // Si dos personas enviaron el mismo turno vale el primero, como en el cierre.
  const porDia = new Map();
  for (const r of reportes) {
    if (!porDia.has(r.fecha)) porDia.set(r.fecha, []);
    const dia = porDia.get(r.fecha);
    if (!dia.some(x => x.turno === r.turno && x.plantilla_codigo === r.plantilla_codigo)) dia.push(r);
  }

  // Todos los días con ventas del café en el rango, tengan o no reporte de barista.
  const dias = (await pool.query(
    "SELECT DISTINCT (fecha_creacion AT TIME ZONE 'UTC')::date::text AS fecha FROM ventas_items WHERE local_id = $1 AND (fecha_creacion AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3 ORDER BY 1",
    [localId, desde, hasta]
  )).rows.map(r => r.fecha);
  for (const f of porDia.keys()) if (!dias.includes(f)) dias.push(f);
  dias.sort();

  const out = [];
  for (const fecha of dias) {
    const c = cafeDelDia(porDia.get(fecha) || [], plantillas, await teoricoCafe(fecha, localId));
    out.push({
      fecha, turnos: c.turnos, manana: c.manana, tarde: c.tarde,
      real: c.consumo, teorico: c.control.teorico, diferencia: c.control.diferencia,
      sin_definir: c.control.sin_definir, productos_sin_definir: c.control.productos_sin_definir,
    });
  }
  return out;
}

// Qué se vendió un día, producto por producto, con sus gramos: es lo que explica el
// teórico. Los sin gramos van al final, para que se vea qué falta definir.
async function detalleCafe(fecha) {
  const localId = await localCafeteria();
  if (!localId) return [];
  const { rows } = await pool.query(`
    SELECT pc.id, pc.nombre_display AS nombre, pc.cafe_gramos AS gramos,
           SUM(i.cantidad) AS unidades
    FROM ventas_items i
    JOIN productos_catalogo pc ON pc.id = i.producto_id
    WHERE i.local_id = $1 AND (i.fecha_creacion AT TIME ZONE 'UTC')::date = $2
      AND NOT COALESCE(i.cancelada, false)
    GROUP BY pc.id, pc.nombre_display, pc.cafe_gramos
    ORDER BY (pc.cafe_gramos IS NULL), SUM(i.cantidad) * COALESCE(pc.cafe_gramos, 0) DESC, SUM(i.cantidad) DESC
  `, [localId, fecha]);
  return rows.map(r => ({
    id: r.id, nombre: r.nombre,
    unidades: Number(r.unidades),
    gramos: r.gramos === null ? null : Number(r.gramos),
    total_g: r.gramos === null ? null : Math.round(Number(r.unidades) * Number(r.gramos)),
  }));
}

module.exports = { localCafeteria, teoricoCafe, cafeDelDia, controlCafe, detalleCafe };
