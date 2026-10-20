import { useEffect, useRef, useState } from 'react';
import api from '../../../api';
import { fmt, num, pc, mesN, cap, MES, enCurso, calcMes, parseMonto } from './kankayUtils';

// Recupero de la inversión, en dólares oficiales BNA (Martín, 13/10/2026).
// Recuperado = resultado de cada mes cerrado del estado de resultados, con la nota de crédito,
// pasado con el promedio del dólar de ese mes. Se compara contra el local. El stock va aparte:
// es plata que vuelve si se cierra, pero mientras esté en la estantería no está en el bolsillo.

const usd = v => `${v < 0 ? '− ' : ''}US$ ${Math.round(Math.abs(v)).toLocaleString('es-AR')}`;
const dolar = v => `$ ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = s => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}/${s.slice(0, 4)}`;
const mesSig = (p, n) => { const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5)) - 1 + n, 1); return `${MES[d.getMonth()]} ${d.getFullYear()}`; };

export default function Recupero({ D, eerr, comPct }) {
  const [R, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/kankay/recupero').then(r => setR(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudo calcular el recupero'));
  }, []);

  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!R) return <div className="h-48 bg-stone-200 rounded-2xl animate-pulse" />;

  // Mes a mes: solo los meses cerrados y con gastos cargados suman.
  const curso = enCurso(D);
  let acc = 0;
  const filas = Object.keys(D.meses).sort().map(p => {
    const c = calcMes(D, eerr, p, comPct), tc = R.dolarMes[p];
    if (p === curso) return { p, estado: 'en curso' };
    if (!c.cargado) return { p, estado: 'faltan gastos' };
    if (!tc) return { p, estado: 'falta el dólar' };
    const u = c.res / tc; acc += u;
    return { p, res: c.res, tc, u, acc };
  });
  const cerrados = filas.filter(f => f.u != null);
  const ult3 = cerrados.slice(-3), prom = ult3.length ? ult3.reduce((a, f) => a + f.u, 0) / ult3.length : null;

  const local = R.inversiones.filter(i => i.tipo === 'local').reduce((a, i) => a + (i.usd || 0), 0);
  const merc = R.inversiones.filter(i => i.tipo === 'mercaderia').reduce((a, i) => a + (i.usd || 0), 0);
  const stock = R.depositos.reduce((a, d) => a + (d.usd || 0), 0);
  const falta = Math.max(local - acc, 0), pct = local ? acc / local : 0;
  const n = local && falta > 0 && prom > 0 ? Math.ceil(falta / prom) : null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="bar">
        <span className="cap"><b>Recupero de la inversión</b> · en dólares oficiales BNA{R.dolarHoy ? ` · hoy ${dolar(R.dolarHoy.venta)}` : ''}</span>
        <span className="cap">Cada mes se pasa con el promedio del dólar de ese mes; la inversión y el stock, con el del día.</span>
      </div>

      <div className="card rc-hero dark">
        <div className="l">Recupero de la inversión · lo que costó el local</div>
        {local ? <>
          <div className="big">{pc(pct, 1)}</div>
          <div className="rc-bar"><i style={{ width: `${Math.min(Math.max(pct, 0), 1) * 100}%` }} /></div>
          <div className="rc-k">
            <div><b>{usd(acc)}</b><span>recuperado, de {usd(local)}</span></div>
            <div><b>{falta > 0 ? usd(falta) : 'Nada'}</b><span>falta</span></div>
            <div><b>{prom != null ? usd(prom) : '–'}</b><span>resultado promedio por mes{ult3.length ? ` (${ult3.length === 1 ? 'un mes' : `últimos ${ult3.length}`})` : ''}</span></div>
            <div><b>{falta === 0 ? 'Recuperado' : n ? `${n} ${n === 1 ? 'mes' : 'meses'} más` : '–'}</b>
              <span>{falta === 0 ? 'ya se pagó el local' : n ? `se recupera en ${mesSig(cerrados.at(-1).p, n)}, si sigue igual` : 'con este promedio no se recupera'}</span></div>
          </div>
        </> : <>
          <div className="big">{usd(acc)}</div>
          <p className="sub" style={{ margin: 0 }}>es lo que ganó Kankay hasta ahora. <b>Cargá lo que costó el local</b> abajo, en "Lo que pusimos", para ver cuánto se recuperó y en cuántos meses.</p>
        </>}
      </div>

      <div className="card">
        <h3>Mes a mes</h3>
        <p className="sub">El resultado del mes del estado de resultados, con la nota de crédito. Un mes entra cuando terminó y tiene los gastos cargados.</p>
        {cerrados.length > 0 && local > 0 && <Grafico cerrados={cerrados} local={local} prom={prom} n={n} />}
        <div className="sx"><table className="t">
          <thead><tr><th>Mes</th><th>Resultado</th><th>Dólar BNA</th><th>Resultado US$</th><th>Acumulado US$</th></tr></thead>
          <tbody>
            {filas.map(f => f.u == null
              ? <tr key={f.p}><td>{cap(mesN(f.p))}</td><td colSpan={4} className="mut">{f.estado}</td></tr>
              : <tr key={f.p}><td>{cap(mesN(f.p))}</td><td className={f.res < 0 ? 'neg' : ''}>{fmt(f.res)}</td><td className="mut">{dolar(f.tc)}</td>
                  <td>{usd(f.u)}</td><td><b>{usd(f.acc)}</b></td></tr>)}
          </tbody>
        </table></div>
      </div>

      <div className="g2">
        <Inversiones R={R} setR={setR} />
        <div className="card">
          <h3>Si cerráramos hoy</h3>
          <p className="sub">El stock no se pierde: si se cierra, se vende y vuelve. Pero mientras esté en la estantería no está en el bolsillo.</p>
          <div className="rc-liq">
            <span>Resultado acumulado</span><b>{usd(acc)}</b>
            <span>− Local</span><b>{usd(-local)}</b>
            <span>− Plata metida en mercadería (stock hoy)</span><b>{usd(-stock)}</b>
            <i />
            <span className="t">Plata en el bolsillo hoy</span><b className={acc - local - stock < 0 ? 'neg' : 'pos'}>{usd(acc - local - stock)}</b>
            <span>+ Si vendemos el stock a costo</span><b>{usd(stock)}</b>
            <i />
            <span className="t">Resultado si cerráramos hoy</span><b className={acc - local < 0 ? 'neg' : 'pos'}>{usd(acc - local)}</b>
          </div>
          {merc > 0 && stock > 0 && <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
            Abrimos con {usd(merc)} de mercadería y hoy hay {usd(stock)}: {stock >= merc
              ? <>se pusieron <b>{usd(stock - merc)}</b> más en stock.</>
              : <>el stock bajó <b>{usd(merc - stock)}</b>, que ya volvieron como plata.</>}</p>}
        </div>
      </div>

      <Stock R={R} setR={setR} />
    </div>
  );
}

function Grafico({ cerrados, local, prom, n }) {
  const W = 900, H = 240, L = 64, Rm = 16, T = 18, B = 30;
  const pts = [{ p: null, acc: 0 }, ...cerrados];
  const proy = [];
  if (n && prom > 0) { let a = pts.at(-1).acc; for (let i = 1; i <= Math.min(n, 48); i++) { a += prom; proy.push(Math.min(a, local)); } }
  const total = pts.length - 1 + proy.length, maxY = Math.max(local * 1.1, ...pts.map(p => p.acc), 1);
  const x = i => L + i * (W - L - Rm) / Math.max(total, 1), y = v => T + (H - T - B) * (1 - Math.max(v, 0) / maxY);
  const ticks = [0, 1, 2, 3, 4].map(k => maxY * k / 4);
  const pr = pts.map((p, i) => [x(i), y(p.acc)]);
  const pp = proy.length ? [pr.at(-1), ...proy.map((v, i) => [x(pts.length + i), y(v)])] : [];
  const line = a => a.map(q => q.join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginBottom: 10 }} role="img" aria-label="Acumulado contra lo que costó el local">
      {ticks.map(v => <g key={v}><line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} stroke="#f6f1e9" />
        <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7d7066">{`US$ ${Math.round(v).toLocaleString('es-AR')}`}</text></g>)}
      <line x1={L} x2={W - Rm} y1={y(local)} y2={y(local)} stroke="#a0522d" strokeWidth="2" strokeDasharray="6 4" />
      <text x={W - Rm} y={y(local) - 6} textAnchor="end" fontSize="11" fontWeight="700" fill="#a0522d">local {usd(local)}</text>
      {pp.length > 0 && <>
        <polyline points={line(pp)} fill="none" stroke="#ab9f93" strokeWidth="1.5" strokeDasharray="3 4" />
        <text x={pp.at(-1)[0]} y={H - 8} textAnchor="end" fontSize="11" fill="#7d7066">+{n} meses</text>
      </>}
      <polygon points={`${x(0)},${y(0)} ${line(pr)} ${pr.at(-1)[0]},${y(0)}`} fill="#047857" opacity=".1" />
      <polyline points={line(pr)} fill="none" stroke="#047857" strokeWidth="2.5" />
      {pts.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.acc)} r="4" fill="#047857" />
        <text x={x(i)} y={H - 8} textAnchor={i ? 'middle' : 'start'} fontSize="11" fill="#7d7066">{p.p ? MES[Number(p.p.slice(5)) - 1].slice(0, 3) : 'apertura'}</text></g>)}
    </svg>
  );
}

const TIPO = { local: 'Local', mercaderia: 'Mercadería inicial' };

// Lo que se puso en Kankay: se carga a mano, en pesos o en dólares.
function Inversiones({ R, setR }) {
  const vacio = { fecha: '', concepto: '', tipo: 'local', moneda: 'ARS', monto: '' };
  const [f, setF] = useState(vacio);
  const [msg, setMsg] = useState('');
  const [borrando, setBorrando] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  async function agregar(e) {
    e.preventDefault();
    try {
      const r = await api.post('/kankay/inversiones', { ...f, monto: parseMonto(f.monto) });
      setR(r.data.data); setF(vacio); setMsg('Guardado');
    } catch (err) { setMsg(err.response?.data?.error || 'No se pudo guardar'); }
  }
  async function borrar(id) {
    try { const r = await api.delete(`/kankay/inversiones/${id}`); setR(r.data.data); setBorrando(null); }
    catch (err) { setMsg(err.response?.data?.error || 'No se pudo borrar'); }
  }
  const total = R.inversiones.reduce((a, i) => a + (i.usd || 0), 0);

  return (
    <div className="card">
      <h3>Lo que pusimos</h3>
      <p className="sub">El local y la mercadería inicial. Si lo cargás en pesos, se pasa con el dólar oficial del día.</p>
      {R.inversiones.length > 0 && <div className="sx"><table className="t">
        <thead><tr><th>Fecha</th><th>Qué</th><th>Monto</th><th>US$</th><th></th></tr></thead>
        <tbody>
          {R.inversiones.map(i => <tr key={i.id}>
            <td>{fecha(i.fecha)}</td>
            <td className="w">{i.concepto}<small style={{ display: 'block' }}>{TIPO[i.tipo]}</small></td>
            <td>{i.moneda === 'USD' ? usd(i.monto) : fmt(i.monto)}{i.tc ? <small style={{ display: 'block' }}>dólar {dolar(i.tc)}</small> : null}</td>
            <td><b>{i.usd != null ? usd(i.usd) : '–'}</b></td>
            <td>{borrando === i.id
              ? <span style={{ display: 'inline-flex', gap: 6 }}><button type="button" className="rc-btn danger" onClick={() => borrar(i.id)}>Borrar</button><button type="button" className="rc-btn" onClick={() => setBorrando(null)}>No</button></span>
              : <button type="button" className="rc-btn" onClick={() => setBorrando(i.id)} aria-label={`Borrar ${i.concepto}`}>✕</button>}</td>
          </tr>)}
          <tr className="tot"><td colSpan={3}>Total</td><td>{usd(total)}</td><td></td></tr>
        </tbody>
      </table></div>}
      <form className="rc-form" onSubmit={agregar}>
        <label>Fecha<input id="inv-fecha" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} required /></label>
        <label>Qué fue<input id="inv-concepto" value={f.concepto} onChange={e => set('concepto', e.target.value)} placeholder="Obra del local" required /></label>
        <label>Es<select id="inv-tipo" value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="local">Local</option><option value="mercaderia">Mercadería inicial</option></select></label>
        <label>Monto<span style={{ display: 'flex', gap: 6 }}>
          <select id="inv-moneda" value={f.moneda} onChange={e => set('moneda', e.target.value)} style={{ width: 76 }}><option value="ARS">$</option><option value="USD">US$</option></select>
          <input id="inv-monto" value={f.monto} onChange={e => set('monto', e.target.value)} inputMode="numeric" placeholder="0" required /></span></label>
        <button type="submit" className="btn-primary">Agregar</button>
      </form>
      {msg && <p className="sub" style={{ margin: '8px 0 0' }}><b>{msg}</b></p>}
    </div>
  );
}

// El stock de cada depósito, desde la "Consulta Stock" de Dux.
function Stock({ R, setR }) {
  const [file, setFile] = useState(null);
  const [dep, setDep] = useState('');
  const [msg, setMsg] = useState('');
  const [res, setRes] = useState(null);
  const ref = useRef();

  async function subir(e) {
    e.preventDefault();
    if (!file) return;
    setMsg('Subiendo…'); setRes(null);
    const fd = new FormData(); fd.append('archivo', file); fd.append('deposito', dep);
    try {
      const r = await api.post('/kankay/stock', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setR(r.data.data.recupero); setRes(r.data.data.subido); setMsg(''); setFile(null); if (ref.current) ref.current.value = '';
    } catch (err) { setMsg(err.response?.data?.error || 'No se pudo leer el Excel'); }
  }
  async function renombrar(de, a) {
    if (!a.trim() || a.trim() === de) return;
    try { const r = await api.put('/kankay/stock/deposito', { de, a }); setR(r.data.data); }
    catch (err) { setMsg(err.response?.data?.error || 'No se pudo cambiar el nombre'); }
  }
  const tot = R.depositos.reduce((a, d) => ({ u: a.u + d.unidades, v: a.v + d.valor, usd: a.usd + (d.usd || 0) }), { u: 0, v: 0, usd: 0 });

  return (
    <div className="card">
      <h3>Stock</h3>
      <p className="sub">Stock real × costo de Dux, sin IVA. Los combos no cuentan: Dux descuenta sus productos cuando se venden. Vale el último Excel de cada depósito.</p>
      {R.depositos.length > 0 && <div className="sx"><table className="t">
        <thead><tr><th>Depósito</th><th>Al</th><th>Unidades</th><th>A costo</th><th>Dólar</th><th>US$</th></tr></thead>
        <tbody>
          {R.depositos.map(d => <tr key={d.deposito}>
            <td><input className="in" style={{ textAlign: 'left', minWidth: 130 }} defaultValue={d.deposito} aria-label="Nombre del depósito"
                       onBlur={e => renombrar(d.deposito, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
              {d.combos > 0 && <small style={{ display: 'block' }}>sin {fmt(d.combos)} de combos</small>}</td>
            <td>{fecha(d.fecha)}</td><td>{num(d.unidades)}</td><td>{fmt(d.valor)}</td>
            <td className="mut">{d.tc ? dolar(d.tc) : '–'}</td><td><b>{d.usd != null ? usd(d.usd) : '–'}</b></td>
          </tr>)}
          <tr className="tot"><td colSpan={2}>Total</td><td>{num(tot.u)}</td><td>{fmt(tot.v)}</td><td></td><td>{usd(tot.usd)}</td></tr>
        </tbody>
      </table></div>}
      <form className="rc-form" onSubmit={subir} style={{ marginTop: 14 }}>
        <label>Excel "Consulta Stock" de Dux<input ref={ref} id="stock-archivo" type="file" accept=".xls,.xlsx" onChange={e => setFile(e.target.files[0] || null)} required /></label>
        <label>Depósito<input id="stock-deposito" list="kk-depositos" value={dep} onChange={e => setDep(e.target.value)} placeholder="Local" required />
          <datalist id="kk-depositos">{R.depositos.map(d => <option key={d.deposito} value={d.deposito} />)}</datalist></label>
        <button type="submit" className="btn-primary" disabled={!file}>Subir stock</button>
      </form>
      {msg && <p className="sub" style={{ margin: '8px 0 0' }}><b>{msg}</b></p>}
      {res && <p className="sub" style={{ margin: '8px 0 0' }}>
        ✓ {res.deposito}: {num(res.unidades)} unidades, {fmt(res.valor)} a costo{res.combos ? ` (sin ${fmt(res.combos)} de combos)` : ''}.
        {res.negativos.length > 0 && <> Stock negativo, no se cuenta: {res.negativos.join(', ')}.</>}
        {res.sinCosto.length > 0 && <> Sin costo en Dux: {res.sinCosto.join(', ')}.</>}
      </p>}
    </div>
  );
}
