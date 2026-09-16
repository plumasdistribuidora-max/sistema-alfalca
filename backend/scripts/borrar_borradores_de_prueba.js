// El sistema se empezó a usar en serio el lunes 14/9/2026. Los borradores de antes son
// de las pruebas: reportes que alguien abrió y nunca envió, y que a esa persona le
// aparecían como "reportes por resolver". Se borran; los aprobados de esos días quedan.
//
// Se corre una vez:  node scripts/borrar_borradores_de_prueba.js --aplicar   (sin --aplicar solo muestra)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../src/config/db');

const INICIO = '2026-09-14';

(async () => {
  const { rows } = await pool.query(`
    SELECT r.id, r.fecha::text, r.turno, r.plantilla_codigo, u.nombre,
           (SELECT COUNT(*)::int FROM reporte_adjuntos a WHERE a.reporte_id = r.id) AS fotos,
           (SELECT COUNT(*)::int FROM facturas f WHERE f.reporte_id = r.id) AS facturas
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.estado = 'borrador' AND r.fecha < $1
    ORDER BY r.fecha, r.id
  `, [INICIO]);
  console.table(rows);

  if (!process.argv.includes('--aplicar')) {
    console.log(`Solo mostré (${rows.length} borradores anteriores al ${INICIO}). Para borrarlos: node scripts/borrar_borradores_de_prueba.js --aplicar`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = rows.map(r => r.id);
    await client.query('UPDATE facturas SET reporte_id = NULL WHERE reporte_id = ANY($1)', [ids]);
    await client.query('DELETE FROM reporte_adjuntos WHERE reporte_id = ANY($1)', [ids]);
    await client.query('DELETE FROM reporte_revisiones WHERE reporte_id = ANY($1)', [ids]);
    const d = await client.query('DELETE FROM reportes WHERE id = ANY($1)', [ids]);
    await client.query('COMMIT');
    console.log(`Borrados: ${d.rowCount} borradores.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => { console.error(err); process.exit(1); });
