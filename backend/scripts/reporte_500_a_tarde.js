// Caso del 15/9/2026 en el café: Martina envió el turno mañana (#392) y Candela envió
// otro del mismo turno (#500) con la misma venta. Candela trabajó la tarde, así que su
// reporte pasa a Tarde y se le devuelve con un comentario para que corrija la venta.
// Con eso le aparece "Tenés un reporte por resolver → Corregir" y lo reenvía.
//
// Se corre una vez:  node scripts/reporte_500_a_tarde.js --aplicar   (sin --aplicar solo muestra)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../src/config/db');

const REPORTE = 500;
const COMENTARIO = 'Este reporte era del turno tarde: lo pasé a Tarde. Corregí la venta del turno (quedó la de la mañana) y volvé a enviarlo.';

(async () => {
  const { rows } = await pool.query(`
    SELECT r.id, r.fecha::text, r.turno, r.estado, u.nombre, u.id AS usuario_id,
           r.respuestas->>'ventas' AS ventas
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id WHERE r.id = $1
  `, [REPORTE]);
  const r = rows[0];
  if (!r) { console.error(`No existe el reporte ${REPORTE}`); process.exit(1); }
  console.log(`#${r.id} · ${r.nombre} · ${r.fecha} · turno ${r.turno} · ${r.estado} · ventas ${r.ventas}`);

  if (r.turno !== 'Mañana' || r.estado !== 'enviado') {
    console.log('Ya no está como Mañana/enviado: no hay nada que hacer.');
    await pool.end();
    return;
  }
  if (!process.argv.includes('--aplicar')) {
    console.log('Solo mostré. Para pasarlo a Tarde y devolvérselo: node scripts/reporte_500_a_tarde.js --aplicar');
    await pool.end();
    return;
  }

  const admin = (await pool.query(`SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1`)).rows[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE reportes SET turno = 'Tarde', estado = 'observado', updated_at = NOW() WHERE id = $1
    `, [REPORTE]);
    await client.query(`
      INSERT INTO reporte_revisiones (reporte_id, usuario_id, accion, comentario) VALUES ($1, $2, 'observo', $3)
    `, [REPORTE, admin.id, COMENTARIO]);
    await client.query('COMMIT');
    console.log('Listo: #500 es ahora Tarde y está devuelto a Candela con el comentario.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => { console.error(err); process.exit(1); });
