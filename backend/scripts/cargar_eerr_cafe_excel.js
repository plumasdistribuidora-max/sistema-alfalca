// Carga al EERR del Café los gastos operativos y los % de CMV por rubro de julio a
// diciembre de 2025, desde el Excel "Info Financiera Cafeteria.xlsx" que usaba Martín.
//
//   node backend/scripts/cargar_eerr_cafe_excel.js "<ruta al xlsx>"
//
// Hoja "Gastos": una fila por concepto, una columna por mes (B = julio … G = diciembre).
// Hoja "E.E.R.R.": el % de costo de cada rubro, mes por mes (filas 9 a 14).
// Los rubros del Excel se guardan con el nombre que tienen en Fudo. Se puede correr de
// nuevo: pisa los meses que carga.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const LOCAL_CAFE = 5;
const MESES = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];

// Columna del % de costo de cada mes en la hoja E.E.R.R.
const COL_PCT = ['G', 'J', 'M', 'Q', 'U', 'Y'];
const RUBROS = [   // fila del Excel → rubro de Fudo
  [9,  'Cafeteria'],
  [10, 'Panificados'],
  [11, 'Promociones'],
  [12, 'Menú Almuezo'],
  [13, 'Principales'],
  [14, 'Bebidas'],
];

async function main() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error('Falta la ruta al Excel');
  const wb = XLSX.readFile(archivo);
  const gastos = wb.Sheets['Gastos'];
  const eerr   = wb.Sheets['E.E.R.R.'];
  const val = (ws, ref) => ws[ref]?.v;

  for (let i = 0; i < MESES.length; i++) {
    const mes = MESES[i];
    const col = String.fromCharCode('B'.charCodeAt(0) + i);

    const conceptos = [];
    for (let fila = 2; fila <= 11; fila++) {
      const nombre = String(val(gastos, `A${fila}`) || '').trim();
      if (!nombre) continue;
      conceptos.push({ nombre, monto: Math.round((Number(val(gastos, `${col}${fila}`)) || 0) * 100) / 100 });
    }
    const total = conceptos.reduce((s, c) => s + c.monto, 0);
    const totalExcel = Number(val(gastos, `${col}12`)) || 0;
    if (Math.abs(total - totalExcel) > 1) throw new Error(`${mes}: los gastos suman ${total} y el Excel dice ${totalExcel}`);

    await pool.query(`
      INSERT INTO eerr_local (local_id, mes, gastos, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (local_id, mes) DO UPDATE SET gastos = EXCLUDED.gastos, updated_at = NOW()
    `, [LOCAL_CAFE, mes, JSON.stringify({ bloques: [{ nombre: 'Gastos', conceptos }] })]);

    const pcts = [];
    for (const [fila, rubro] of RUBROS) {
      const pct = Number(val(eerr, `${COL_PCT[i]}${fila}`));
      if (!Number.isFinite(pct)) throw new Error(`${mes}: falta el % de ${rubro}`);
      pcts.push(`${rubro} ${Math.round(pct * 100)}%`);
      await pool.query(`
        INSERT INTO eerr_cafeteria_cmv (local_id, mes, categoria, cmv_pct, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (local_id, mes, categoria) DO UPDATE SET cmv_pct = EXCLUDED.cmv_pct, updated_at = NOW()
      `, [LOCAL_CAFE, mes, rubro, Math.round(pct * 10000) / 100]);
    }
    console.log(`${mes}: gastos $ ${Math.round(total).toLocaleString('es-AR')} · ${pcts.join(', ')}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
