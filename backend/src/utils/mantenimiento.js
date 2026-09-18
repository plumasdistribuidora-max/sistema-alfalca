// Mantenimiento con seguimiento: lo que un turno reporta queda como ítem del local
// hasta que alguien diga que se solucionó. Acá viven las reglas que comparten el
// reporte del empleado (que informa y confirma) y el cierre del encargado (que dice
// cómo lo va a resolver).
const pool = require('../config/db');
const { esNovedad } = require('./reportes');

// El campo "mantenimiento" de un reporte guarda:
//   { seguimiento: { [item_id]: 'sigue' | 'resuelto' },
//     nuevos:      [ { texto, item_id? } ] }
// Los reportes de antes del cambio guardan un texto suelto: se conserva como "legado"
// para que el consolidado de esos días lo siga mostrando.
function valorMantenimiento(v) {
  if (typeof v === 'string') {
    return { seguimiento: {}, nuevos: [], legado: esNovedad(v) ? v.trim() : null };
  }
  const o = v && typeof v === 'object' ? v : {};
  const seguimiento = {};
  for (const [id, resp] of Object.entries(o.seguimiento || {})) {
    if (resp === 'sigue' || resp === 'resuelto') seguimiento[id] = resp;
  }
  const nuevos = (Array.isArray(o.nuevos) ? o.nuevos : [])
    .map(x => ({ texto: String(x?.texto || '').trim(), item_id: x?.item_id ? Number(x.item_id) : null }))
    .filter(x => x.texto);
  return { seguimiento, nuevos, legado: null };
}

// Lo que sigue abierto en un local, con quién lo reportó y qué dijo el encargado.
// Se excluyen los ítems que nacieron en los reportes indicados: el propio reporte no
// tiene que confirmarse a sí mismo. Y solo entra lo reportado en días ANTERIORES a
// `fecha`: un turno de la mañana no puede confirmar lo que la tarde reportó después,
// y al corregir un reporte viejo no tiene que contestar por lo que apareció después.
async function pendientesDe(localId, excluirReportes = [], fecha = null) {
  const { rows } = await pool.query(`
    SELECT m.id, m.texto, m.fecha::text AS fecha, m.plan, u.nombre AS reportado_por
    FROM mantenimiento_items m
    LEFT JOIN usuarios u ON u.id = m.reportado_por
    WHERE m.local_id = $1 AND m.estado = 'abierto'
      AND (m.reporte_id IS NULL OR NOT (m.reporte_id = ANY($2::int[])))
      AND ($3::date IS NULL OR m.fecha < $3::date)
    ORDER BY m.fecha, m.id
  `, [localId, excluirReportes.filter(Boolean), fecha]);
  return rows;
}

// Qué le falta contestar a un reporte antes de enviarlo: cada pendiente del local
// tiene que tener un "sigue igual" o un "se solucionó".
async function faltantesMantenimiento(reporte) {
  const v = valorMantenimiento((reporte.respuestas || {}).mantenimiento);
  const fecha = (await pool.query('SELECT fecha::text AS fecha FROM reportes WHERE id = $1', [reporte.id])).rows[0].fecha;
  const pendientes = await pendientesDe(reporte.local_id, [reporte.id], fecha);
  return pendientes
    .filter(p => !v.seguimiento[String(p.id)])
    .map(p => `Mantenimiento — decí si sigue igual o se solucionó: “${p.texto}”`);
}

// Al enviar el reporte, lo que dijo el turno pasa a la tabla: los ítems nuevos se
// crean (y el reporte se queda con sus ids, así un reenvío los edita en vez de
// duplicarlos), los "se solucionó" cierran el ítem, y un "sigue igual" que corrige
// un "se solucionó" anterior del mismo reporte lo vuelve a abrir.
async function sincronizarMantenimiento(reporte, usuarioId) {
  const v = valorMantenimiento((reporte.respuestas || {}).mantenimiento);
  if (v.legado !== null) return;   // texto viejo: se deja como está

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fecha = (await client.query('SELECT fecha::text AS fecha FROM reportes WHERE id = $1', [reporte.id])).rows[0].fecha;

    const propios = new Set(
      (await client.query('SELECT id FROM mantenimiento_items WHERE reporte_id = $1', [reporte.id])).rows.map(r => r.id)
    );
    const conservar = [];
    for (const nuevo of v.nuevos) {
      if (nuevo.item_id && propios.has(nuevo.item_id)) {
        await client.query(
          'UPDATE mantenimiento_items SET texto = $1, updated_at = NOW() WHERE id = $2',
          [nuevo.texto, nuevo.item_id]
        );
      } else {
        const { rows } = await client.query(`
          INSERT INTO mantenimiento_items (local_id, texto, reporte_id, reportado_por, fecha)
          VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [reporte.local_id, nuevo.texto, reporte.id, usuarioId, fecha]);
        nuevo.item_id = rows[0].id;
      }
      conservar.push(nuevo.item_id);
    }
    // Lo que el turno sacó de la lista antes de reenviar.
    await client.query(
      'DELETE FROM mantenimiento_items WHERE reporte_id = $1 AND NOT (id = ANY($2::int[]))',
      [reporte.id, conservar]
    );

    for (const [id, resp] of Object.entries(v.seguimiento)) {
      if (resp === 'resuelto') {
        await client.query(`
          UPDATE mantenimiento_items
          SET estado = 'resuelto', resuelto_fecha = $2, resuelto_reporte_id = $3, updated_at = NOW()
          WHERE id = $1 AND estado = 'abierto'
        `, [Number(id), fecha, reporte.id]);
      } else {
        await client.query(`
          UPDATE mantenimiento_items
          SET estado = 'abierto', resuelto_fecha = NULL, resuelto_reporte_id = NULL, updated_at = NOW()
          WHERE id = $1 AND estado = 'resuelto' AND resuelto_reporte_id = $2
        `, [Number(id), reporte.id]);
      }
    }

    await client.query(
      `UPDATE reportes SET respuestas = jsonb_set(respuestas, '{mantenimiento}', $2::jsonb), updated_at = NOW()
       WHERE id = $1`,
      [reporte.id, JSON.stringify({ seguimiento: v.seguimiento, nuevos: v.nuevos })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Los ítems que cuentan para el cierre de un día, tal como estaban ese día: los que
// ya existían y seguían abiertos, más los que se resolvieron ese mismo día. Mirar un
// día viejo tiene que mostrar lo que había entonces, no lo que hay hoy.
async function itemsDelDia(fecha) {
  const { rows } = await pool.query(`
    SELECT m.id, m.local_id, m.texto, m.fecha::text AS fecha, m.estado, m.plan,
           m.resuelto_fecha::text AS resuelto_fecha, m.reporte_id,
           u.nombre AS reportado_por
    FROM mantenimiento_items m
    LEFT JOIN usuarios u ON u.id = m.reportado_por
    WHERE m.fecha <= $1
      AND (m.estado = 'abierto' OR m.resuelto_fecha >= $1)
    ORDER BY m.local_id, m.fecha, m.id
  `, [fecha]);
  return rows;
}

// Los ítems que nombra un reporte (los que creó y los que confirmó), para mostrarlos
// con su texto al revisarlo.
async function itemsDeReporte(reporte) {
  const v = valorMantenimiento((reporte.respuestas || {}).mantenimiento);
  const ids = [
    ...Object.keys(v.seguimiento).map(Number),
    ...v.nuevos.map(x => x.item_id).filter(Boolean),
  ];
  const { rows } = await pool.query(`
    SELECT m.id, m.texto, m.fecha::text AS fecha, m.estado, m.plan, u.nombre AS reportado_por
    FROM mantenimiento_items m LEFT JOIN usuarios u ON u.id = m.reportado_por
    WHERE m.id = ANY($1::int[]) OR m.reporte_id = $2
  `, [ids, reporte.id]);
  return rows;
}

module.exports = {
  valorMantenimiento, pendientesDe, faltantesMantenimiento,
  sincronizarMantenimiento, itemsDelDia, itemsDeReporte,
};
