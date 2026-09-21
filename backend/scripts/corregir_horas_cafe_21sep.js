// Corrige lo que dejó el import 129 del café (15/9/2026, el primero con el servidor en
// hora de Mendoza) y que el script del 15/9 no alcanzó a arreglar.
//
// Qué pasó: los 954 tickets del café del 1 al 15 de septiembre nacieron con la hora
// 3 horas adelante. En el path del café el ON CONFLICT no refrescaba `creacion`, así
// que los doce imports siguientes (135 a 168) no la tocaron, y el script del 15/9
// buscaba por `archivo_import_id IN (125..130)`, campo que esos mismos imports ya
// habían pisado. Resultado: el análisis por hora muestra al café vendiendo a las 23.
//
// Los pagos y los descuentos, en cambio, sí se reinsertaron con la hora bien (su
// clave incluye la fecha), y quedó cada uno dos veces: la copia corrida +3 h y la
// correcta. Eso pasó en las cinco tiendas, no solo en el café.
//
// Qué hace, en orden:
//   1. Resta 3 horas a `creacion` de los tickets del café creados por el import 129.
//      Solo si el ticket tiene un pago exactamente 3 horas antes (los 954 lo tienen).
//   2. Borra los pagos corridos +3 h que tienen su gemelo correcto en el mismo ticket.
//   3. Ídem descuentos.
//
// Se corre una vez:  node scripts/corregir_horas_cafe_21sep.js --aplicar
// Sin --aplicar solo muestra. El paso 1 no puede correr dos veces: la segunda no
// encuentra ningún ticket con un pago 3 horas antes.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../src/config/db');

const CAFE = 5;
// created_at de los 954 tickets que insertó el import 129 (todos en la misma transacción).
const IMPORT_129 = { desde: '2026-09-15 20:55+00', hasta: '2026-09-15 21:10+00' };
const VENTANA    = ['2026-09-01', '2026-09-15'];

const TICKETS_CORRIDOS = `
  SELECT t.id FROM ventas_tickets t
  WHERE t.local_id = $1 AND t.created_at BETWEEN $2 AND $3
    AND EXISTS (SELECT 1 FROM ventas_pagos p
                WHERE p.ticket_id = t.id AND p.fecha_pago = t.creacion - interval '3 hours')
`;

const PAGOS_COPIA = `
  SELECT DISTINCT b.id FROM ventas_pagos b
  JOIN ventas_pagos a ON a.ticket_id = b.ticket_id AND a.id <> b.id
    AND a.monto = b.monto AND a.medio_pago IS NOT DISTINCT FROM b.medio_pago
    AND a.cancelado IS NOT DISTINCT FROM b.cancelado
    AND b.fecha_pago = a.fecha_pago + interval '3 hours'
  JOIN ventas_tickets t ON t.id = b.ticket_id
  WHERE t.fecha BETWEEN $1 AND $2
`;

const DESC_COPIA = `
  SELECT DISTINCT b.id FROM ventas_descuentos b
  JOIN ventas_descuentos a ON a.local_id = b.local_id AND a.pos_ticket_id = b.pos_ticket_id AND a.id <> b.id
    AND a.valor IS NOT DISTINCT FROM b.valor AND a.porcentaje IS NOT DISTINCT FROM b.porcentaje
    AND a.cancelado IS NOT DISTINCT FROM b.cancelado
    AND b.fecha_descuento = a.fecha_descuento + interval '3 hours'
  WHERE b.fecha_descuento::date BETWEEN $1 AND ($2::date + 1)
`;

(async () => {
  const n = async (sql, params) => (await pool.query(`SELECT COUNT(*)::int AS n FROM (${sql}) x`, params)).rows[0].n;

  const tickets = await n(TICKETS_CORRIDOS, [CAFE, IMPORT_129.desde, IMPORT_129.hasta]);
  const pagos   = await n(PAGOS_COPIA, VENTANA);
  const descs   = await n(DESC_COPIA, VENTANA);
  console.log(`Tickets del café con la hora corrida: ${tickets}`);
  console.log(`Pagos duplicados (copia +3 h):        ${pagos}`);
  console.log(`Descuentos duplicados (copia +3 h):   ${descs}`);

  const horas = await pool.query(`
    SELECT t.fecha::text AS fecha, COUNT(*)::int AS tickets,
           to_char(MIN(t.creacion AT TIME ZONE 'UTC'), 'HH24:MI') AS primero,
           to_char(MAX(t.creacion AT TIME ZONE 'UTC'), 'HH24:MI') AS ultimo
    FROM ventas_tickets t WHERE t.local_id = $1 AND t.fecha BETWEEN $2 AND $3
    GROUP BY 1 ORDER BY 1
  `, [CAFE, ...VENTANA]);
  console.log('Café, primer y último ticket del día:');
  console.table(horas.rows);

  if (!process.argv.includes('--aplicar')) {
    console.log('Solo mostré. Para corregir: node scripts/corregir_horas_cafe_21sep.js --aplicar');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const t = await client.query(`
      UPDATE ventas_tickets SET creacion = creacion - interval '3 hours', updated_at = NOW()
      WHERE id IN (${TICKETS_CORRIDOS})
    `, [CAFE, IMPORT_129.desde, IMPORT_129.hasta]);
    console.log(`Tickets con la hora corregida: ${t.rowCount}`);

    const p = await client.query(`DELETE FROM ventas_pagos WHERE id IN (${PAGOS_COPIA})`, VENTANA);
    console.log(`Pagos duplicados borrados: ${p.rowCount}`);

    const d = await client.query(`DELETE FROM ventas_descuentos WHERE id IN (${DESC_COPIA})`, VENTANA);
    console.log(`Descuentos duplicados borrados: ${d.rowCount}`);

    // Control: ningún ticket del café puede quedar con la fecha distinta de su creación.
    const f = await client.query(`
      SELECT COUNT(*)::int AS n FROM ventas_tickets
      WHERE local_id = $1 AND fecha BETWEEN $2 AND $3
        AND fecha <> (creacion AT TIME ZONE 'UTC')::date
    `, [CAFE, ...VENTANA]);
    if (f.rows[0].n > 0) throw new Error(`${f.rows[0].n} tickets quedaron con fecha distinta de su creación; no aplico nada`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const despues = await pool.query(`
    SELECT t.fecha::text AS fecha, COUNT(*)::int AS tickets,
           to_char(MIN(t.creacion AT TIME ZONE 'UTC'), 'HH24:MI') AS primero,
           to_char(MAX(t.creacion AT TIME ZONE 'UTC'), 'HH24:MI') AS ultimo
    FROM ventas_tickets t WHERE t.local_id = $1 AND t.fecha BETWEEN $2 AND $3
    GROUP BY 1 ORDER BY 1
  `, [CAFE, ...VENTANA]);
  console.log('Después:');
  console.table(despues.rows);
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
