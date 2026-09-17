// Borra los renglones de venta duplicados que dejaron los imports 125–130 del 15/9/2026.
//
// Esos imports entraron con la hora corrida 3 horas (ver memoria "hora guardada como
// UTC"); el script corregir_fechas_imports_15sep.js arregló los tickets, pero los
// renglones de producto quedaron, y al reimportar bien el mismo período entraron de
// nuevo con la hora correcta: septiembre quedó con cada renglón dos veces (~1.200
// docenas de más). Se borra solo la copia corrida (+3 h) que tiene su gemela bien
// cargada, y solo las creadas en la ventana de esos imports.
//
// Correr una sola vez:  cd backend && node scripts/borrar_renglones_duplicados_15sep.js
//                       (con --simular solo cuenta)
require('dotenv').config({ path: '../.env' });
const pool = require('../src/config/db');

const simular = process.argv.includes('--simular');

const GEMELAS = `
  FROM ventas_items b
  JOIN ventas_items a
    ON a.local_id = b.local_id AND a.pos_ticket_id = b.pos_ticket_id
   AND a.producto_nombre_raw = b.producto_nombre_raw AND a.linea = b.linea
   AND b.fecha_creacion = a.fecha_creacion + INTERVAL '3 hours'
  WHERE b.created_at BETWEEN '2026-09-15T18:00:00Z' AND '2026-09-15T22:00:00Z'
    AND a.fecha_creacion >= '2026-08-01'
`;

(async () => {
  const antes = (await pool.query(`SELECT COUNT(*)::int n, ROUND(SUM(b.docenas_equivalentes)) doc ${GEMELAS}`)).rows[0];
  console.log(`Copias corridas +3 h con gemela correcta: ${antes.n} renglones, ${antes.doc} docenas`);
  if (simular) { await pool.end(); return; }

  await pool.query('BEGIN');
  const d = await pool.query(`
    DELETE FROM ventas_items b
    USING ventas_items a
    WHERE a.local_id = b.local_id AND a.pos_ticket_id = b.pos_ticket_id
      AND a.producto_nombre_raw = b.producto_nombre_raw AND a.linea = b.linea
      AND b.fecha_creacion = a.fecha_creacion + INTERVAL '3 hours'
      AND b.created_at BETWEEN '2026-09-15T18:00:00Z' AND '2026-09-15T22:00:00Z'
      AND a.fecha_creacion >= '2026-08-01'
  `);
  await pool.query('COMMIT');
  console.log(`Borrados: ${d.rowCount}`);

  const meses = (await pool.query(`
    SELECT TO_CHAR((fecha_creacion AT TIME ZONE 'UTC')::date, 'YYYY-MM') AS mes, ROUND(SUM(docenas_equivalentes)) AS docenas
    FROM ventas_items WHERE NOT COALESCE(cancelada, false) AND fecha_creacion >= '2026-08-01'
    GROUP BY 1 ORDER BY 1
  `)).rows;
  console.log('Docenas por mes:', meses.map(m => `${m.mes}: ${m.docenas}`).join(' · '));
  await pool.end();
})().catch(err => { console.error('Error:', err); process.exit(1); });
