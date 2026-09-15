// Corrige la fecha de los tickets de los imports del 15/9/2026 (ids 125 a 129).
//
// Ese día el servidor pasó a vivir en hora de Mendoza, y el import mandaba la fecha
// del Excel como Date: pg la escribía "2026-09-14T21:00-03:00" y Postgres, para una
// columna DATE, se quedaba con el 14. Todas las facturas de las cuatro tiendas
// quedaron un día atrás (y las del café cargadas entre las 0 y las 3 también).
//
// La fecha real es la del timestamp de creación, que está guardado como UTC pero es
// hora de Mendoza. Se corre una vez:  node scripts/corregir_fechas_imports_15sep.js
// Antes de tocar nada muestra qué va a cambiar; con --aplicar lo escribe.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../src/config/db');

const IMPORTS = [125, 126, 127, 128, 129];
const MAL = `archivo_import_id = ANY($1) AND fecha <> (creacion AT TIME ZONE 'UTC')::date`;

(async () => {
  const antes = await pool.query(`
    SELECT archivo_import_id AS import, COUNT(*)::int AS tickets,
           MIN(fecha)::text AS desde_mal, MAX(fecha)::text AS hasta_mal,
           MIN((creacion AT TIME ZONE 'UTC')::date)::text AS desde_bien,
           MAX((creacion AT TIME ZONE 'UTC')::date)::text AS hasta_bien
    FROM ventas_tickets WHERE ${MAL}
    GROUP BY 1 ORDER BY 1
  `, [IMPORTS]);
  console.table(antes.rows);

  if (!process.argv.includes('--aplicar')) {
    console.log('Solo mostré. Para corregir: node scripts/corregir_fechas_imports_15sep.js --aplicar');
  } else {
    const u = await pool.query(`
      UPDATE ventas_tickets
      SET fecha = (creacion AT TIME ZONE 'UTC')::date, updated_at = NOW()
      WHERE ${MAL}
    `, [IMPORTS]);
    console.log(`Corregidos: ${u.rowCount} tickets.`);

    const hoy = await pool.query(`
      SELECT l.nombre, COUNT(*)::int AS tickets, SUM(t.total)::numeric AS venta
      FROM ventas_tickets t JOIN locales l ON l.id = t.local_id
      WHERE t.fecha = '2026-09-15' AND t.estado = 'cerrada'
      GROUP BY 1 ORDER BY 1
    `);
    console.log('Ventas del 15/9 según el sistema, ahora:');
    console.table(hoy.rows);
  }
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
