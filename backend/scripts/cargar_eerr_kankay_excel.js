// Carga en el estado de resultados de Kankay las ventas, el CMV y el costo financiero
// de un mes, sacados de la "Consulta de ventas detallada" del sistema de Kankay (.xls).
//
// - Ventas: "Total Sin IVA" por rubro. Ya viene con los descuentos aplicados y con
//   las notas de crédito restando. Lo que no tiene IVA (CX) entra completo.
// - CMV: "Costo Total Producto" (las notas de crédito lo devuelven).
// - "Costo Financiero" (cuotas con tarjeta) va a gastos financieros. El Excel lo suma
//   en "Costo Total" y lo resta en "Ganancia"; acá se separa para que el margen bruto
//   sea solo mercadería. Ganancia del Excel = margen bruto − costo financiero.
//
// Los demás renglones del mes (gastos, impuestos) se dejan como estaban.
//
//   node backend/scripts/cargar_eerr_kankay_excel.js <archivo.xls> 2026-08            (solo muestra)
//   node backend/scripts/cargar_eerr_kankay_excel.js <archivo.xls> 2026-08 --aplicar

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const [archivo, periodo] = process.argv.slice(2);
const aplicar = process.argv.includes('--aplicar');
if (!archivo || !/^\d{4}-\d{2}$/.test(periodo || '')) {
  console.error('Uso: node cargar_eerr_kankay_excel.js <archivo.xls> YYYY-MM [--aplicar]');
  process.exit(1);
}

const nuevoId = () => Math.random().toString(36).slice(2, 10);
const titulo  = s => s.charAt(0) + s.slice(1).toLowerCase();
const fmt     = n => Math.round(n).toLocaleString('es-AR');

(async () => {
  const wb    = XLSX.readFile(archivo);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const idxH  = filas.findIndex(f => f.includes('Total Sin IVA'));
  const h     = filas[idxH];
  const col   = n => { const i = h.indexOf(n); if (i < 0) throw new Error(`Falta la columna ${n}`); return i; };
  const datos = filas.slice(idxH + 1).filter(f => f[col('Empresa')]);

  // Que todas las ventas sean del mes pedido (Fecha Registro viene DD/MM/YYYY HH:mm).
  const [y, m] = periodo.split('-');
  const fuera  = datos.filter(f => String(f[col('Fecha Registro')]).slice(3, 10) !== `${m}/${y}`);
  if (fuera.length) throw new Error(`${fuera.length} renglones no son de ${periodo}`);

  const porRubro = {};
  let cmv = 0, costoFin = 0, ganancia = 0;
  for (const f of datos) {
    const r = titulo(String(f[col('Rubro')] || 'Sin rubro'));
    porRubro[r] = (porRubro[r] || 0) + Number(f[col('Total Sin IVA')]);
    cmv      += Number(f[col('Costo Total Producto')]);
    costoFin += Number(f[col('Costo Financiero')]);
    ganancia += Number(f[col('Ganancia')]);
  }
  const ventas = Object.values(porRubro).reduce((a, b) => a + b, 0);
  console.log(`${datos.length} renglones de ${periodo}`);
  for (const [r, v] of Object.entries(porRubro).sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(14)} $ ${fmt(v)}`);
  console.log(`Ventas netas     $ ${fmt(ventas)}`);
  console.log(`CMV              $ ${fmt(cmv)}`);
  console.log(`Margen bruto     $ ${fmt(ventas - cmv)}  (${(100 * (ventas - cmv) / ventas).toFixed(1)}%)  · Ganancia del Excel $ ${fmt(ganancia)}`);
  console.log(`Costo financiero $ ${fmt(costoFin)}`);

  // Se parte de lo que ya tenga el mes (o del mes anterior, o de la plantilla del endpoint).
  const { rows } = await pool.query(
    `SELECT lineas FROM eerr_manual WHERE marca = 'kankay' AND periodo <= $1 ORDER BY periodo DESC LIMIT 1`, [periodo]);
  let base = rows[0]?.lineas || [];
  if (!base.length) {
    base = [
      ['deducciones', 'Comisiones de tarjetas y plataformas'],
      ['cmv', 'Fletes de compra'],
      ['gastos', 'Sueldos y cargas sociales'], ['gastos', 'Alquiler y expensas'],
      ['gastos', 'Servicios (luz, agua, internet)'], ['gastos', 'Marketing y publicidad'],
      ['gastos', 'Envíos y logística'], ['gastos', 'Honorarios (contador, etc.)'],
      ['gastos', 'Sistemas y software'], ['gastos', 'Otros gastos'],
      ['financieros', 'Ingresos brutos'], ['financieros', 'Impuesto al cheque'],
      ['financieros', 'Intereses y gastos bancarios'],
    ].map(([grupo, nombre]) => ({ id: nuevoId(), grupo, nombre, monto: null }));
  }

  const CMV_NOMBRE = 'Costo de la mercadería vendida';
  const CF_NOMBRE  = 'Costo financiero de tarjetas (cuotas)';
  const redondo    = n => Math.round(n);
  const ingresos   = Object.entries(porRubro).sort((a, b) => b[1] - a[1])
    .map(([r, v]) => ({ id: nuevoId(), grupo: 'ingresos', nombre: `Ventas ${r.toLowerCase()}`, monto: redondo(v) }));
  const resto = base.filter(l => l.grupo !== 'ingresos' && l.nombre !== CMV_NOMBRE && l.nombre !== CF_NOMBRE
                                && l.nombre !== 'Descuentos y devoluciones');
  const lineas = [...ingresos, ...resto];
  lineas.splice(lineas.findIndex(l => l.grupo === 'cmv'), 0, { id: nuevoId(), grupo: 'cmv', nombre: CMV_NOMBRE, monto: redondo(cmv) });
  const iFin = lineas.findIndex(l => l.grupo === 'financieros');
  lineas.splice(iFin === -1 ? lineas.length : iFin, 0, { id: nuevoId(), grupo: 'financieros', nombre: CF_NOMBRE, monto: redondo(costoFin) });

  if (!aplicar) { console.log('\n(sin --aplicar: no se guardó nada)'); return pool.end(); }
  await pool.query(
    `INSERT INTO eerr_manual (marca, periodo, lineas) VALUES ('kankay', $1, $2)
     ON CONFLICT (marca, periodo) DO UPDATE SET lineas = EXCLUDED.lineas, actualizado_en = NOW()`,
    [periodo, JSON.stringify(lineas)]
  );
  console.log(`\nGuardado ${periodo}: ${lineas.length} renglones.`);
  await pool.end();
})().catch(err => { console.error(err.message); process.exit(1); });
