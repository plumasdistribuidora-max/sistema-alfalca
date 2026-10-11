// Completa ventas_tickets.personas del Café Peatonal en 2026.
//
// Hasta el 11/10/2026 el import del Café armaba los tickets desde la hoja Pagos y nunca
// leía las personas, que están en la hoja Ventas (sin número de venta). Este script relee
// los Excel guardados en R2, cruza las dos hojas con la misma lógica que el import
// (cruzarPersonas) y, para cada mes, usa el archivo que trae más tickets de ese mes
// (a igualdad, el más nuevo); un ticket que ese archivo no trae sale del más nuevo que
// lo tenga. Solo toca la columna personas.
//
// Uso:
//   cd backend && node scripts/completar_personas_cafe_2026.js            # muestra antes/después
//   cd backend && node scripts/completar_personas_cafe_2026.js --aplicar  # guarda
require('dotenv').config({ path: '../.env' });
const xlsx = require('xlsx');
const pool = require('../src/config/db');
const { getFromR2 } = require('../src/config/r2');
const { readSheetNorm, cruzarPersonas } = require('../src/routes/ventas').helpers;

const aplicar = process.argv.includes('--aplicar');
const LOCAL = 5;   // cafe_peatonal

async function leer(key) {
  const obj = await getFromR2(key);
  const chunks = [];
  for await (const c of obj.Body) chunks.push(c);
  return xlsx.read(Buffer.concat(chunks), { type: 'buffer' });
}

(async () => {
  const tickets = (await pool.query(`
    SELECT id, pos_id, to_char(fecha, 'YYYY-MM') AS mes, personas
    FROM ventas_tickets
    WHERE local_id = $1 AND fecha >= '2026-01-01' AND estado = 'cerrada'
  `, [LOCAL])).rows;
  const porMes = {};
  for (const t of tickets) (porMes[t.mes] ||= []).push(t);

  // Un mismo nombre en R2 puede repetirse en varios imports: se lee una vez, el más nuevo.
  const archivos = (await pool.query(`
    SELECT archivo_r2_key AS key, MAX(id) AS import_id
    FROM imports_log
    WHERE local_id = $1 AND status = 'completado' AND archivo_r2_key IS NOT NULL
      AND fecha_hasta >= '2026-01-01'
    GROUP BY archivo_r2_key ORDER BY MAX(id)
  `, [LOCAL])).rows;

  const cruces = [];   // { key, import_id, personas: Map }
  for (const a of archivos) {
    let wb;
    try { wb = await leer(a.key); }
    catch (err) { console.log(`  ${a.key}: no está en R2 (${err.Code || err.message})`); continue; }
    const personas = cruzarPersonas(readSheetNorm(wb, 'ventas', 3), readSheetNorm(wb, 'pagos', 0));
    cruces.push({ ...a, personas });
    console.log(`  ${a.key}: ${personas.size} ventas cruzadas`);
  }

  const cambios = [];
  console.log('\nmes      tickets  cubiertos  personas antes  personas después  archivo');
  for (const mes of Object.keys(porMes).sort()) {
    const ts = porMes[mes];
    let mejor = null, cubre = -1;
    for (const c of cruces) {
      const n = ts.filter(t => c.personas.has(t.pos_id)).length;
      if (n > cubre || (n === cubre && c.import_id > mejor.import_id)) { mejor = c; cubre = n; }
    }
    let antes = 0, despues = 0;
    for (const t of ts) {
      antes += t.personas || 0;
      // Si el archivo del mes no trae este ticket, el más nuevo que lo traiga.
      const fuente = mejor.personas.has(t.pos_id) ? mejor
        : [...cruces].reverse().find(c => c.personas.has(t.pos_id));
      if (fuente !== mejor) console.log(`  ${mes}: venta ${t.pos_id} sale de ${fuente ? fuente.key.split('/').pop() : 'ningún archivo'}`);
      const p = fuente ? fuente.personas.get(t.pos_id) : t.personas;
      despues += p || 0;
      if (p !== t.personas) cambios.push({ id: t.id, personas: p });
    }
    console.log(`${mes}  ${String(ts.length).padStart(7)}  ${String(cubre).padStart(9)}  ${String(antes).padStart(14)}  ${String(despues).padStart(16)}  ${mejor.key.split('/').pop()}`);
  }
  console.log(`\n${cambios.length} tickets cambian de personas`);

  if (aplicar && cambios.length) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`
        UPDATE ventas_tickets t SET personas = x.personas
        FROM unnest($1::int[], $2::int[]) AS x(id, personas)
        WHERE t.id = x.id AND t.local_id = $3
      `, [cambios.map(c => c.id), cambios.map(c => c.personas), LOCAL]);
      if (r.rowCount !== cambios.length) throw new Error(`se iban a cambiar ${cambios.length} y cambiaron ${r.rowCount}`);
      await client.query('COMMIT');
      console.log(`Guardado: ${r.rowCount} tickets`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else if (!aplicar) {
    console.log('Simulación: no se guardó nada (agregar --aplicar).');
  }
  await pool.end();
})();
