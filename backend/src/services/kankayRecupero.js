// Kankay: recupero de la inversión, en dólares oficiales BNA.
//
// Reglas (Martín, 13/10/2026):
// - Inversión = el local y la mercadería inicial, cargados a mano. Las compras de reposición
//   no son inversión: ya están en el costo de mercadería del estado de resultados.
// - Recuperado = resultado de cada mes, con la nota de crédito (es ganancia real).
// - Stock = Stock Real × Costo de la "Consulta Stock" de Dux, un Excel por depósito.
//   Los combos (rubro PROMOCIONES) no cuentan: Dux descuenta sus productos al venderlos.

const XLSX = require('xlsx');
const pool = require('../config/db');

const hoyMza = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' });

// ---------------------------------------------------------------- Dólar oficial

let ultimoIntento = 0;

// Trae el oficial BNA de api.argentinadatos.com si falta el de hoy (como mucho una vez cada 3 horas).
// Si la página no responde, se usa lo que ya está guardado.
async function actualizarDolar() {
  const { rows: [u] } = await pool.query(`SELECT to_char(MAX(fecha),'YYYY-MM-DD') AS f FROM dolar_oficial`);
  if (u.f === hoyMza() || Date.now() - ultimoIntento < 3 * 3600 * 1000) return;
  ultimoIntento = Date.now();
  try {
    const r = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const datos = (await r.json()).filter(x => x.fecha >= '2023-01-01' && Number(x.venta) > 0 && (!u.f || x.fecha > u.f));
    if (!datos.length) return;
    await pool.query(`
      INSERT INTO dolar_oficial (fecha, venta)
      SELECT * FROM unnest($1::date[], $2::numeric[])
      ON CONFLICT (fecha) DO UPDATE SET venta = EXCLUDED.venta
    `, [datos.map(x => x.fecha), datos.map(x => x.venta)]);
  } catch (err) {
    console.warn('[kankay recupero] dólar:', err.message);
  }
}

// Promedio de cada mes y el último valor de cada día (para buscar el de una fecha).
async function cotizaciones() {
  await actualizarDolar();
  const { rows } = await pool.query(`SELECT to_char(fecha,'YYYY-MM-DD') AS f, venta::float AS v FROM dolar_oficial ORDER BY fecha`);
  const mes = {};
  for (const r of rows) (mes[r.f.slice(0, 7)] ||= []).push(r.v);
  const promedio = Object.fromEntries(Object.entries(mes).map(([p, vs]) => [p, vs.reduce((a, b) => a + b, 0) / vs.length]));
  // El de una fecha: el último publicado hasta ese día (fines de semana y feriados no hay).
  const delDia = f => { let v = null; for (const r of rows) { if (r.f > f) break; v = r.v; } return v ?? rows[0]?.v ?? null; };
  return { promedio, delDia, hoy: rows.at(-1) ? { fecha: rows.at(-1).f, venta: rows.at(-1).v } : null };
}

// ---------------------------------------------------------------- Stock

// Lee la "Consulta Stock" de Dux. Devuelve el valor a costo sin combos y el detalle.
function leerStock(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const h = filas.findIndex(f => f.some(c => String(c).trim() === 'Código Producto'));
  if (h < 0) throw new Error('No parece la "Consulta Stock" de Dux: no encuentro la columna "Código Producto".');
  const col = n => filas[h].findIndex(c => String(c).trim() === n);
  const c = { cod: col('Código Producto'), prod: col('Producto'), q: col('Stock Real'), costo: col('Costo'), rubro: col('Rubro') };
  for (const [k, n] of [['q', 'Stock Real'], ['costo', 'Costo'], ['rubro', 'Rubro']]) {
    if (c[k] < 0) throw new Error(`Falta la columna "${n}" en el Excel.`);
  }
  let unidades = 0, valor = 0, combos = 0;
  const detalle = [], negativos = [], sinCosto = [];
  for (const f of filas.slice(h + 1)) {
    const cod = String(f[c.cod] ?? '').trim();
    if (!cod) continue;
    const q = Number(f[c.q]) || 0, costo = Number(f[c.costo]) || 0, rubro = String(f[c.rubro] ?? '').trim();
    const prod = String(f[c.prod] ?? '').trim();
    if (q === 0) continue;
    if (/^promoci/i.test(rubro)) { if (q > 0) combos += q * costo; continue; }
    if (q < 0) { negativos.push(`${prod} (${q})`); continue; }
    if (!costo) sinCosto.push(prod);
    unidades += q; valor += q * costo;
    detalle.push([cod, prod, rubro, q, costo]);
  }
  if (!detalle.length) throw new Error('El Excel no tiene productos con stock.');
  return { unidades, valor: Math.round(valor * 100) / 100, combos: Math.round(combos * 100) / 100, detalle, negativos, sinCosto };
}

async function guardarStock(buffer, archivo, deposito, usuarioId) {
  const s = leerStock(buffer);
  const fecha = hoyMza();
  await pool.query(`
    INSERT INTO kankay_stock (fecha, deposito, archivo, unidades, valor, combos, detalle, subido_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (fecha, deposito) DO UPDATE SET archivo = EXCLUDED.archivo, unidades = EXCLUDED.unidades,
      valor = EXCLUDED.valor, combos = EXCLUDED.combos, detalle = EXCLUDED.detalle,
      subido_por = EXCLUDED.subido_por, subido_en = NOW()
  `, [fecha, deposito, archivo, s.unidades, s.valor, s.combos, JSON.stringify(s.detalle), usuarioId]);
  return { fecha, deposito, unidades: s.unidades, valor: s.valor, combos: s.combos, negativos: s.negativos, sinCosto: s.sinCosto };
}

// ---------------------------------------------------------------- Todo junto

async function recupero() {
  const tc = await cotizaciones();
  const { rows: inv } = await pool.query(`
    SELECT i.id, to_char(i.fecha,'YYYY-MM-DD') AS fecha, i.concepto, i.tipo, i.moneda, i.monto::float, u.nombre AS creado_por
    FROM kankay_inversiones i LEFT JOIN usuarios u ON u.id = i.creado_por ORDER BY i.fecha, i.id
  `);
  const { rows: stk } = await pool.query(`
    SELECT DISTINCT ON (s.deposito) s.deposito, to_char(s.fecha,'YYYY-MM-DD') AS fecha, s.archivo, s.unidades::float,
           s.valor::float, s.combos::float, s.subido_en, u.nombre AS subido_por
    FROM kankay_stock s LEFT JOIN usuarios u ON u.id = s.subido_por
    ORDER BY s.deposito, s.fecha DESC
  `);
  const usd = (monto, moneda, fecha) => {
    if (moneda === 'USD') return { tc: null, usd: monto };
    const t = tc.delDia(fecha);
    return { tc: t, usd: t ? monto / t : null };
  };
  return {
    inversiones: inv.map(i => ({ ...i, ...usd(i.monto, i.moneda, i.fecha) })),
    depositos: stk.map(s => ({ ...s, ...usd(s.valor, 'ARS', s.fecha) })),
    dolarMes: tc.promedio,
    dolarHoy: tc.hoy,
  };
}

async function agregarInversion(b, usuarioId) {
  const fecha = String(b.fecha || '');
  const concepto = String(b.concepto || '').trim().slice(0, 120);
  const monto = Number(b.monto);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Poné la fecha');
  if (!concepto) throw new Error('Poné qué fue');
  if (!['local', 'mercaderia'].includes(b.tipo)) throw new Error('Elegí si es local o mercadería');
  if (!['ARS', 'USD'].includes(b.moneda)) throw new Error('Elegí pesos o dólares');
  if (!isFinite(monto) || monto <= 0) throw new Error('Poné un monto mayor a cero');
  await pool.query(`INSERT INTO kankay_inversiones (fecha, concepto, tipo, moneda, monto, creado_por) VALUES ($1,$2,$3,$4,$5,$6)`,
    [fecha, concepto, b.tipo, b.moneda, monto, usuarioId]);
}

const borrarInversion = id => pool.query('DELETE FROM kankay_inversiones WHERE id = $1', [id]);

async function renombrarDeposito(de, a) {
  a = String(a || '').trim().slice(0, 60);
  if (!a) throw new Error('Poné un nombre');
  await pool.query('UPDATE kankay_stock SET deposito = $2 WHERE deposito = $1', [de, a]);
}

module.exports = { recupero, leerStock, guardarStock, agregarInversion, borrarInversion, renombrarDeposito };
