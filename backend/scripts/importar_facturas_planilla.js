// Importa una hoja de facturas de proveedores (formato de KPI E2.xlsx: Fecha, Proveedor,
// Nº Factura, Debe, Haber, Estado, Cheque, notas) a las tablas proveedores, facturas y
// pagos_proveedor. Una sola transacción: o entra todo o no entra nada.
//
//   node scripts/importar_facturas_planilla.js <archivo.xlsx> <hoja> <local_id> [--aplicar]
//
// Sin --aplicar solo muestra qué haría. Cada factura queda con importado_de =
// "<hoja> · fila N", así se puede deshacer:
//   DELETE FROM facturas WHERE importado_de LIKE '<hoja> · %';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const [,, archivo, hoja, localArg, flag] = process.argv;
if (!archivo || !hoja || !localArg) {
  console.error('Uso: node scripts/importar_facturas_planilla.js <archivo.xlsx> <hoja> <local_id> [--aplicar]');
  process.exit(1);
}
const LOCAL_ID = Number(localArg);
const APLICAR  = flag === '--aplicar';
const USUARIO  = 1; // Martín (admin): es quien pidió la carga.

// Nombres que en la planilla aparecen de más de una forma, o abreviados.
const NOMBRE = { 'club de campo': 'Club de Campo', 'hojaldre': 'Hojaldre', 'zuccardi': 'Zuccardi', 'coca': 'Coca-Cola' };
const norm = p => { const k = String(p).trim().toLowerCase(); return NOMBRE[k] || String(p).trim(); };

// "$118,750.00", "$240.293,30", "-$67,000.00"
function num(s) {
  const t = String(s ?? '').trim(); if (!t) return 0;
  let x = t.replace(/[$\s]/g, '').replace(/(\d)-(\d{2})$/, '$1.$2');   // "33,245-76": guion por punto
  if (/\d\.\d{3},\d{2}$/.test(x)) x = x.replace(/\./g, '').replace(',', '.'); else x = x.replace(/,/g, '');
  return Number(x) || 0;
}

// "26/7/2025", "30-01-2026", "31-08-0226", "13-08/2026", "18/8" (sin año), "01-092026"
function fecha(s, anioAnterior) {
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[\/-]+(\d{1,2})[\/-]*(\d{2,4})?$/) || s.match(/^(\d{1,2})-(\d{2})(\d{4})$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : anioAnterior;
  if (y < 100) y += 2000;
  if (y === 226) y = 2026;
  return { y, m: Number(m[2]), d: Number(m[1]) };
}
const iso = f => `${f.y}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
const sumar = (isoStr, dias) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  const x = new Date(y, m - 1, d + dias);
  return iso({ y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() });
};

// Cómo se pagó, según la columna "Cheque": "eft 4-9", "Trans 26/12", "307", "cheque 372", "cruz".
function pago(raw, fFactura) {
  raw = String(raw ?? '').trim();
  if (!raw) return { medio: 'santander', fecha: null, nota: 'La planilla no dice cuándo ni cómo se pagó' };
  let medio = 'santander', nota = null;
  if (/^\d+$/.test(raw) || /cheque/i.test(raw)) medio = 'cheque';
  else if (/cruz/i.test(raw)) nota = 'En la planilla dice «cruz»: revisar el medio';
  else if (/compensa/i.test(raw)) nota = `En la planilla: «${raw}»`;
  else if (!/eft|tran|trasf/i.test(raw)) nota = `En la planilla: «${raw}»`;
  let f = null;
  const pm = raw.match(/(\d{1,2})[\/-](\d{1,2})/);
  if (pm && Number(pm[2]) >= 1 && Number(pm[2]) <= 12 && fFactura) {
    const d = Number(pm[1]), m = Number(pm[2]);
    const y = m < fFactura.m - 6 ? fFactura.y + 1 : fFactura.y;   // factura de diciembre pagada en enero
    f = iso({ y, m, d });
  }
  return { medio, fecha: f, nota };
}

async function main() {
  const wb = XLSX.readFile(archivo);
  const ws = wb.Sheets[hoja];
  if (!ws) { console.error(`No existe la hoja "${hoja}". Hay: ${wb.SheetNames.join(', ')}`); process.exit(1); }
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

  const facturas = [], saltadas = [];
  let anio = new Date().getFullYear();
  filas.forEach((r, i) => {
    const fila = i + 1;
    if (fila === 1 || !r.some(c => String(c).trim() !== '')) return;
    const f = fecha(r[0], anio);
    if (!f) { saltadas.push({ fila, motivo: `fecha ilegible «${r[0]}»`, r }); return; }
    anio = f.y;
    const debe = num(r[3]), haber = num(r[4]);
    const e = String(r[5]).trim().toLowerCase().replace(/[^a-z]/g, '');
    const esNC = /^nc|notacred/.test(e) || (haber > 0 && !debe) || debe < 0;
    if (esNC) { saltadas.push({ fila, motivo: `nota de crédito por $${(haber || -debe).toLocaleString('es-AR')}`, r }); return; }
    if (!(debe > 0)) { saltadas.push({ fila, motivo: `sin monto (${[r[7], r[8]].filter(Boolean).join(' · ') || 'vacío'})`, r }); return; }
    let estado = /^pagad/.test(e) ? 'pagada' : /^pend|^pedie/.test(e) ? 'pendiente' : e === '' ? 'sin_estado' : null;
    if (String(r[4]).trim().toLowerCase().startsWith('pend')) estado = 'pendiente';
    if (!estado) { saltadas.push({ fila, motivo: `estado raro «${r[5]}»`, r }); return; }
    facturas.push({
      fila, fecha: iso(f), f, proveedor: norm(r[1]),
      numero: String(r[2]).trim() || null, total: debe, estado,
      pago: estado === 'pagada' ? pago(r[6], f) : null,
      nota: [r[7], r[8]].map(x => String(x).trim()).filter(Boolean).join(' · ') || null,
    });
  });

  // Ficha propuesta por proveedor: medio, días y plazo según cómo se le pagó.
  const fichas = {};
  for (const fa of facturas) {
    const p = fichas[fa.proveedor] = fichas[fa.proveedor] || { nombre: fa.proveedor, plazos: [], dias: {}, medios: {} };
    if (fa.estado === 'pagada') {
      p.medios[fa.pago.medio] = (p.medios[fa.pago.medio] || 0) + 1;
      if (fa.pago.fecha) {
        const dias = Math.round((new Date(fa.pago.fecha) - new Date(fa.fecha)) / 86400000);
        if (dias >= 0 && dias < 120) { p.plazos.push(dias); const wd = new Date(`${fa.pago.fecha}T12:00:00`).getDay(); p.dias[wd] = (p.dias[wd] || 0) + 1; }
      }
    }
  }
  for (const p of Object.values(fichas)) {
    const s = [...p.plazos].sort((a, b) => a - b);
    p.plazo = s.length >= 5 ? s[Math.floor(s.length / 2)] : 30;
    const tot = Object.values(p.dias).reduce((a, b) => a + b, 0);
    p.diasPago = tot >= 5 ? Object.entries(p.dias).filter(([, v]) => v / tot >= 0.15).map(([k]) => Number(k)).sort() : [1, 2, 3, 4, 5];
    p.medio = p.medios.cheque && !p.medios.santander ? 'cheque' : 'santander';
  }

  console.log(`Hoja "${hoja}": ${facturas.length} facturas a cargar, ${saltadas.length} filas que no entran.`);
  console.log(`  pagadas ${facturas.filter(f => f.estado === 'pagada').length} · pendientes ${facturas.filter(f => f.estado === 'pendiente').length} · sin estado (entran como pendientes) ${facturas.filter(f => f.estado === 'sin_estado').length}`);
  for (const s of saltadas) console.log(`  fila ${s.fila} no entra: ${s.motivo}  [${s.r.slice(0, 7).join(' | ')}]`);
  console.log('\nFichas propuestas:');
  for (const p of Object.values(fichas)) console.log(`  ${p.nombre}: ${p.medio}, días ${JSON.stringify(p.diasPago)}, ${p.plazo} días`);

  if (!APLICAR) { console.log('\n(sin --aplicar no se toca la base)'); await pool.end(); return; }

  const marca = `${hoja} · fila `;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ya = await client.query('SELECT COUNT(*)::int AS n FROM facturas WHERE importado_de LIKE $1', [`${marca}%`]);
    if (ya.rows[0].n) throw new Error(`Esta hoja ya está importada (${ya.rows[0].n} facturas). Borrala antes si querés repetir.`);

    // Proveedores: los que ya existen se respetan tal cual (la ficha la maneja el encargado).
    const provId = {}, provPlazo = {};
    for (const p of Object.values(fichas)) {
      const ex = await client.query('SELECT id, plazo_dias FROM proveedores WHERE lower(btrim(nombre)) = lower($1)', [p.nombre]);
      if (ex.rowCount) { provId[p.nombre] = ex.rows[0].id; provPlazo[p.nombre] = ex.rows[0].plazo_dias; console.log(`  proveedor ${p.nombre}: ya existía, ficha sin tocar`); continue; }
      const ins = await client.query(
        'INSERT INTO proveedores (nombre, medio_pago, dias_pago, plazo_dias, nota) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [p.nombre, p.medio, p.diasPago, p.plazo, `Ficha deducida de la planilla ${hoja}: revisar forma de pago, días y plazo.`]
      );
      provId[p.nombre] = ins.rows[0].id; provPlazo[p.nombre] = p.plazo;
    }

    let nFact = 0, nPagos = 0;
    for (const fa of facturas) {
      const venc = sumar(fa.fecha, provPlazo[fa.proveedor]);
      const marcaFila = `${marca}${fa.fila}${fa.estado === 'sin_estado' ? ' · sin estado en la planilla' : ''}`;
      const ins = await client.query(`
        INSERT INTO facturas (local_id, proveedor, proveedor_id, numero, fecha, vencimiento, total, created_by, importado_de)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
      `, [LOCAL_ID, fa.proveedor, provId[fa.proveedor], fa.numero, fa.fecha, venc, fa.total, USUARIO, marcaFila]);
      nFact++;
      if (fa.estado === 'pagada') {
        const notas = [fa.pago.nota, fa.nota ? `Planilla: ${fa.nota}` : null].filter(Boolean).join(' · ') || null;
        await client.query(`
          INSERT INTO pagos_proveedor (factura_id, fecha, monto, medio, comprobante, nota, usuario_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [ins.rows[0].id, fa.pago.fecha || fa.fecha, fa.total, fa.pago.medio, String(fa.pago && filas[fa.fila - 1][6] || '').trim() || null, notas, USUARIO]);
        nPagos++;
      }
    }
    await client.query('COMMIT');
    console.log(`\nListo: ${Object.keys(fichas).length} proveedores, ${nFact} facturas, ${nPagos} pagos.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nNo se cargó nada:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
