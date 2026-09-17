// Recupera los renglones de venta que el import descartaba por repetidos.
//
// Hasta la migración 047, tres cafés grandes de una misma mesa (tres renglones iguales
// en el Excel de Fudo) entraban como uno. Este script relee cada Excel guardado en R2,
// numera los renglones idénticos (columna "linea") y vuelve a insertar: los que ya
// están no se tocan (ON CONFLICT DO NOTHING); los que faltaban entran ahora.
//
// Se puede correr más de una vez sin duplicar nada. Uso:
//   cd backend && node scripts/recuperar_renglones_repetidos.js            # todo
//   cd backend && node scripts/recuperar_renglones_repetidos.js --local 5  # un local
//   cd backend && node scripts/recuperar_renglones_repetidos.js --simular  # solo cuenta
//   cd backend && node scripts/recuperar_renglones_repetidos.js --desde 66 # retomar desde ese import
require('dotenv').config({ path: '../.env' });
const xlsx = require('xlsx');
const pool = require('../src/config/db');
const { getFromR2 } = require('../src/config/r2');
const { parseExcelDate, parseFiscal, readSheetNorm, normalizeNombre } = require('../src/routes/ventas').helpers;
const { loadMaestro, getDocenasPorProducto } = require('../src/services/maestroDocenas');

const args = process.argv.slice(2);
const soloLocal = args.includes('--local') ? Number(args[args.indexOf('--local') + 1]) : null;
const desdeImport = args.includes('--desde') ? Number(args[args.indexOf('--desde') + 1]) : 0;   // retomar desde un import
const simular   = args.includes('--simular');

// La bajada de R2 a veces se queda colgada: se reintenta con un límite de tiempo.
function conLimite(promesa, ms, que) {
  return Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error(`${que}: más de ${ms / 1000}s`)), ms))]);
}
async function leer(key) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const obj = await conLimite(getFromR2(key), 30000, 'pedir el archivo');
      const chunks = [];
      await conLimite((async () => { for await (const c of obj.Body) chunks.push(c); })(), 120000, 'bajar el archivo');
      return xlsx.read(Buffer.concat(chunks), { type: 'buffer', cellDates: true });
    } catch (err) {
      if (intento === 3) throw err;
      console.log(`    reintento ${intento} (${err.message})`);
    }
  }
}

(async () => {
  await loadMaestro();
  const imports = (await pool.query(`
    SELECT id, local_id, archivo_r2_key, fecha_desde::text, fecha_hasta::text
    FROM imports_log
    WHERE status = 'completado' AND archivo_r2_key IS NOT NULL ${soloLocal ? 'AND local_id = $1' : ''}
      AND id >= ${desdeImport}
    ORDER BY id
  `, soloLocal ? [soloLocal] : [])).rows;
  console.log(`${imports.length} imports a releer${simular ? ' (simulación)' : ''}`);

  const catalogo = (await pool.query('SELECT id, nombre_normalizado, docenas_por_unidad FROM productos_catalogo')).rows;
  const porNombre = Object.fromEntries(catalogo.map(p => [p.nombre_normalizado, p]));

  let totalNuevos = 0;
  for (const im of imports) {
    let wb;
    try { wb = await leer(im.archivo_r2_key); }
    catch (err) { console.log(`  import ${im.id} (local ${im.local_id}): no se pudo leer el archivo — ${err.message}`); continue; }

    const filas = readSheetNorm(wb, 'adiciones', 0);
    const tickets = Object.fromEntries((await pool.query(
      'SELECT id, pos_id FROM ventas_tickets WHERE local_id = $1', [im.local_id]
    )).rows.map(t => [t.pos_id, t.id]));

    const lineas = new Map();
    let nuevos = 0, repetidos = 0;
    const pendientes = [];   // filas a insertar, de a tandas: un INSERT por renglón tardaba minutos por archivo
    const COLS = 21;
    async function volcar() {
      if (!pendientes.length) return;
      const values = pendientes.map((_, i) => `(${Array.from({ length: COLS }, (__, j) => `$${i * COLS + j + 1}`).join(',')})`).join(',');
      const r = await pool.query(`
        INSERT INTO ventas_items (
          local_id, ticket_id, pos_ticket_id, producto_id, producto_nombre_raw,
          categoria_raw, cantidad, precio_unit, precio_total,
          costo_base, costo_modificadores, costo_total,
          empleado, fecha_creacion, cocina,
          cancelada, cancelada_por, comentario, comentario_cancelacion,
          docenas_equivalentes, linea
        ) VALUES ${values}
        ON CONFLICT (local_id, pos_ticket_id, producto_nombre_raw, fecha_creacion, linea) DO NOTHING
      `, pendientes.flat());
      nuevos += r.rowCount;
      pendientes.length = 0;
    }

    for (const row of filas) {
      const posTicketId = parseInt(row['id venta']);
      const nombreRaw   = row['producto'];
      if (!posTicketId || isNaN(posTicketId) || !nombreRaw) continue;
      const fechaCreacion = parseExcelDate(row['creacion']);
      const nombre = nombreRaw.toString().trim();
      const clave  = `${posTicketId}|${nombre}|${fechaCreacion?.getTime()}`;
      const linea  = lineas.get(clave) || 0;
      lineas.set(clave, linea + 1);
      if (linea === 0) continue;   // el primero de cada grupo ya entró con el import original
      repetidos++;
      if (simular) continue;

      const prod = porNombre[normalizeNombre(nombreRaw)];
      const productoId = prod?.id ?? null;
      const docenas = productoId ? (prod.docenas_por_unidad === null ? 0 : Number(prod.docenas_por_unidad)) : (getDocenasPorProducto(nombreRaw) ?? 0);
      const cantidad   = parseFloat(row['cantidad'] ?? 1) || 1;
      const precioUnit = parseFloat(row['precio'] ?? 0) || 0;

      pendientes.push([
        im.local_id, tickets[posTicketId] ?? null, posTicketId, productoId, nombre,
        row['categoria'] || null, cantidad, precioUnit, cantidad * precioUnit,
        parseFloat(row['costo base'] ?? 0) || 0, parseFloat(row['costo modificadores'] ?? 0) || 0, parseFloat(row['costo total'] ?? 0) || 0,
        row['creada por'] || null, fechaCreacion, row['cocina'] || null,
        parseFiscal(row['cancelada']), row['cancelada por'] || null, row['comentario'] || null, row['comentario de cancelacion'] || null,
        cantidad * docenas, linea,
      ]);
      if (pendientes.length >= 500) await volcar();
    }
    await volcar();
    totalNuevos += nuevos;
    console.log(`  import ${im.id} local ${im.local_id} ${im.fecha_desde}→${im.fecha_hasta}: ${filas.length} renglones, ${repetidos} repetidos${simular ? '' : `, ${nuevos} recuperados`}`);
  }
  console.log(`\nTotal recuperados: ${totalNuevos}`);
  await pool.end();
})().catch(err => { console.error('Error:', err); process.exit(1); });
