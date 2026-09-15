// Corrige los tickets de los imports del 15/9/2026 (ids 125 a 130), los primeros que
// se hicieron con el servidor en hora de Mendoza. El 130 es Amigorena reimportado esa
// misma tarde: ya tenía la fecha bien pero las horas igual de corridas.
//
// Toda la base guarda la hora del Excel (Mendoza) como si fuera UTC: "17:42" en Fudo
// queda "17:42+00". Con el proceso en hora de Mendoza, SheetJS armó los Date en local
// y quedaron "20:42+00": tres horas adelante de todo lo anterior. Y la fecha de las
// tiendas (que en el Excel es un texto "2026-09-15") se corrió un día atrás.
//
// Qué hace, en orden:
//   1. Resta 3 horas a todos los timestamps de esos imports (tickets, ítems, pagos,
//      descuentos y fiscales), para volver a la convención de la base.
//   2. Recalcula la fecha del ticket como el día de su creación, que es como está
//      todo el histórico.
//
// Se corre una vez:  node scripts/corregir_fechas_imports_15sep.js
// Sin --aplicar solo muestra. Tiene una guarda para no restar las 3 horas dos veces.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../src/config/db');

const IMPORTS = [125, 126, 127, 128, 129, 130];
// Pago 24416 del café: Fudo dice 15/09/2026 17:42:58. Si ya está así, no hay nada que restar.
const TESTIGO = { pos_id: 24416, mal: '2026-09-15 20:42:58+00', bien: '2026-09-15 17:42:58+00' };

const HIJAS = [
  ['ventas_items',      'fecha_creacion'],
  ['ventas_pagos',      'fecha_pago'],
  ['ventas_descuentos', 'fecha_descuento'],
  ['ventas_fiscales',   'fecha_creacion'],
];

(async () => {
  const testigo = (await pool.query(`
    SELECT creacion::text FROM ventas_tickets
    WHERE pos_id = $1 AND archivo_import_id = 129
  `, [TESTIGO.pos_id])).rows[0]?.creacion;
  console.log(`Testigo (pago 24416 del café): ${testigo}  — Fudo dice ${TESTIGO.bien}`);

  const yaCorregido = testigo === TESTIGO.bien;
  if (yaCorregido) console.log('Las horas ya están corregidas; solo se revisa la fecha.');
  else if (testigo !== TESTIGO.mal) {
    console.error('El testigo no está en ninguno de los dos estados esperados. No toco nada.');
    process.exit(1);
  }

  const resumen = await pool.query(`
    SELECT archivo_import_id AS import, COUNT(*)::int AS tickets,
           MIN((creacion AT TIME ZONE 'UTC')::time)::text AS primera_hora,
           MAX((creacion AT TIME ZONE 'UTC')::time)::text AS ultima_hora,
           COUNT(*) FILTER (WHERE fecha <> ((creacion - interval '${yaCorregido ? 0 : 3} hours') AT TIME ZONE 'UTC')::date)::int AS fecha_mal
    FROM ventas_tickets WHERE archivo_import_id = ANY($1)
    GROUP BY 1 ORDER BY 1
  `, [IMPORTS]);
  console.table(resumen.rows);

  if (!process.argv.includes('--aplicar')) {
    console.log('Solo mostré. Para corregir: node scripts/corregir_fechas_imports_15sep.js --aplicar');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!yaCorregido) {
      const t = await client.query(`
        UPDATE ventas_tickets
        SET creacion = creacion - interval '3 hours',
            cerrada  = cerrada  - interval '3 hours',
            updated_at = NOW()
        WHERE archivo_import_id = ANY($1)
      `, [IMPORTS]);
      console.log(`Tickets con la hora corregida: ${t.rowCount}`);

      for (const [tabla, col] of HIJAS) {
        const h = await client.query(`
          UPDATE ${tabla} x SET ${col} = x.${col} - interval '3 hours'
          FROM ventas_tickets tk
          WHERE tk.id = x.ticket_id AND tk.archivo_import_id = ANY($1)
        `, [IMPORTS]);
        console.log(`  ${tabla}: ${h.rowCount}`);
      }
    }

    const f = await client.query(`
      UPDATE ventas_tickets
      SET fecha = (creacion AT TIME ZONE 'UTC')::date, updated_at = NOW()
      WHERE archivo_import_id = ANY($1) AND fecha <> (creacion AT TIME ZONE 'UTC')::date
    `, [IMPORTS]);
    console.log(`Tickets con la fecha corregida: ${f.rowCount}`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const control = await pool.query(`
    SELECT l.nombre, COUNT(*)::int AS tickets, SUM(t.total)::numeric AS venta
    FROM ventas_tickets t JOIN locales l ON l.id = t.local_id
    WHERE t.fecha BETWEEN '2026-09-01' AND '2026-09-14' AND t.estado = 'cerrada'
    GROUP BY 1 ORDER BY 1
  `);
  console.log('Del 1 al 14 de septiembre, según el sistema (Fudo café: 946 cerradas, $19.384.085):');
  console.table(control.rows);
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
