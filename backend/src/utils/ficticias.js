// Ventas ficticias (3/11/2026): Sheraton carga en Fudo ventas que no existieron porque
// Entre Dos las usa para hacerle una nota de crédito. Se cargan con cliente "-" y se pagan
// "en efectivo". Tienen que seguir en Fudo, pero acá no cuentan como venta: el ticket queda
// con estado 'ficticia' (todo lo que suma ventas filtra estado = 'cerrada') y sus productos
// como cancelados (las docenas filtran NOT cancelada). Antes del 1/8/2026 nadie las cargaba;
// los "-" de antes son ventas reales.
const DESDE = '2026-08-01';
const CLIENTES = ['-', 'ficticia', 'ficticio'];

// Marca las ficticias de un local (o de todos, sin local) y devuelve cuántos tickets marcó.
async function marcarFicticias(client, localId = null) {
  const { rowCount } = await client.query(`
    UPDATE ventas_tickets SET estado = 'ficticia', updated_at = NOW()
    WHERE estado = 'cerrada' AND fecha >= $1 AND lower(trim(cliente)) = ANY($2::text[])
      AND ($3::int IS NULL OR local_id = $3)
  `, [DESDE, CLIENTES, localId]);
  await client.query(`
    UPDATE ventas_items vi SET cancelada = true, cancelada_por = 'Venta ficticia'
    FROM ventas_tickets vt
    WHERE vt.id = vi.ticket_id AND vt.estado = 'ficticia' AND NOT COALESCE(vi.cancelada, false)
      AND ($1::int IS NULL OR vt.local_id = $1)
  `, [localId]);
  return rowCount;
}

module.exports = { marcarFicticias };
