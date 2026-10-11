// Borra de la Peatonal los 47 tickets del Sheraton que entraron por error el 7/10/2026.
//
// A las 10:01 se subió el Excel del Sheraton (1 al 6/10) con la Peatonal elegida (import 303).
// Los tickets 3919–3965 ($1.407.945) ya están en el Sheraton (local 4) con la misma hora y
// el mismo total, y en la Peatonal inflaban octubre: 502 tickets contra 457 en Fudo.
// Es lo mismo que pasó el 23/9 (borrar_tickets_peatonal_en_amigorena_23sep.js); desde ahora
// el import rechaza un Excel cuyas ventas ya están cargadas en otro local.
//
// Todo en una transacción: si no encuentra exactamente esos 47, todos repetidos en el
// Sheraton, no toca nada.
// Correr una sola vez:  cd backend && node scripts/borrar_tickets_sheraton_en_peatonal_7oct.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const ids = (await c.query(`
      SELECT p.id FROM ventas_tickets p
      JOIN ventas_tickets s ON s.local_id = 4 AND s.pos_id = p.pos_id
                           AND s.creacion = p.creacion AND s.total = p.total
      WHERE p.local_id = 3 AND p.archivo_import_id = 303
        AND p.pos_id BETWEEN 3919 AND 3965
    `)).rows.map(r => r.id);
    if (ids.length !== 47) throw new Error(`esperaba 47 tickets, hay ${ids.length}`);

    for (const t of ['ventas_items', 'ventas_pagos', 'ventas_descuentos', 'ventas_fiscales']) {
      const r = await c.query(`DELETE FROM ${t} WHERE ticket_id = ANY($1)`, [ids]);
      console.log(t, r.rowCount);
    }
    const r = await c.query('DELETE FROM ventas_tickets WHERE id = ANY($1)', [ids]);
    console.log('ventas_tickets', r.rowCount);
    await c.query('COMMIT');
    console.log('OK, borrado');
  } catch (e) {
    await c.query('ROLLBACK');
    console.log('ROLLBACK, no se borró nada:', e.message);
  } finally {
    c.release();
  }

  console.table((await pool.query(`
    SELECT local_id, COUNT(*)::int AS tickets, SUM(total) AS total
    FROM ventas_tickets
    WHERE fecha >= '2026-10-01' AND estado = 'cerrada' AND local_id IN (3, 4)
    GROUP BY 1 ORDER BY 1
  `)).rows);
  await pool.end();
})();
