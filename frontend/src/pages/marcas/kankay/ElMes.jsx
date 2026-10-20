import { useState } from 'react';
import { fmt, num, pc, mesN, cap, ultimoDia, Chg, enCurso, diaHasta, gastosRef, calcMes, parseMonto } from './kankayUtils';

// "El mes": tarjetas, venta acumulada contra el equilibrio, el calendario, rubros y lo más vendido.
export default function ElMes({ D, eerr, comPct }) {
  const meses = Object.keys(D.meses).sort();
  const curso = enCurso(D);
  const [sel, setSel] = useState(meses.at(-1));
  const [ncSim, setNcSim] = useState(null);

  const M = D.meses[sel], i = meses.indexOf(sel), prevK = meses[i - 1], P = prevK ? D.meses[prevK] : null;
  const esCurso = sel === curso, n = ultimoDia(sel), hasta = esCurso ? diaHasta(D, sel) : n;
  const cmpP = P ? (esCurso ? P.hasta1_[hasta] : P) : null;
  const vs = esCurso ? `1–${hasta} ${mesN(prevK || sel).slice(0, 3)}` : (prevK ? mesN(prevK) : '');
  const f = esCurso ? n / hasta : 1;
  const ticket = M.tot / M.ventas, mbp = (M.neto - M.cmv) / M.neto;

  // equilibrio
  const G = gastosRef(D, eerr, sel, comPct), c = calcMes(D, eerr, sel, comPct);
  const iibbRate = G?.iibb != null ? G.iibb / (G.netoRef || M.neto) : 0;
  const contrib = 1 - (M.cmv / M.neto + comPct / 100 + iibbRate);
  const nc = ncSim != null ? ncSim : (c.s.nc || 0);
  const pe = G ? G.g / contrib : null, pe2 = G && nc > 0 ? Math.max(G.g - nc, 0) / contrib : null;
  const netoFin = M.neto * f;

  const elegir = k => { setSel(k); setNcSim(null); };
  const foot = (v, extra) => cmpP
    ? <div className="cmp"><span>vs {vs}{extra ? ` · ${extra}` : ''}</span>{v}</div>
    : <div className="cmp"><span>Primer mes del local</span></div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="bar">
        <span className="cap">
          {esCurso
            ? <><b>{cap(mesN(sel))} {sel.slice(0, 4)}</b> · del 1 al {hasta}{P && ` · contra los mismos días de ${mesN(prevK)}`}</>
            : <><b>{cap(mesN(sel))} {sel.slice(0, 4)}</b> · {Number(M.desde.slice(8))} al {Number(M.hasta.slice(8))}{P ? ` · contra ${mesN(prevK)}` : ' · primer mes del local'}</>}
        </span>
        <div className="seg">
          {meses.map(k => <button key={k} aria-pressed={k === sel} onClick={() => elegir(k)}>{cap(mesN(k))}{k === curso ? ' (en curso)' : ''}</button>)}
        </div>
      </div>

      <div className="cards">
        <div className="kc dark">
          <span className="l">Venta con IVA</span>
          <span className="v">{fmt(M.tot)}</span>
          <span className="a">Sin IVA: <b>{fmt(M.neto)}</b></span>
          {foot(cmpP && <Chg v={M.tot / cmpP.tot - 1} />)}
        </div>
        <div className="kc">
          <span className="l">Margen bruto</span>
          <span className="v">{pc(mbp)}</span>
          <span className="a">{fmt(M.neto - M.cmv)} sobre la venta sin IVA</span>
          {foot(cmpP && <span className="chg">{pc((cmpP.neto - cmpP.cmv) / cmpP.neto)}</span>)}
        </div>
        <div className="kc">
          <span className="l">Ventas</span>
          <span className="v">{num(M.ventas)}</span>
          <span className="a">Ticket promedio {fmt(ticket)}</span>
          {foot(cmpP && <Chg v={M.ventas / cmpP.ventas - 1} />, cmpP && cmpP.ventas)}
        </div>
        <div className="kc">
          <span className="l">Unidades</span>
          <span className="v">{num(M.q)}</span>
          <span className="a">{(M.q / M.ventas).toLocaleString('es-AR', { maximumFractionDigits: 2 })} por venta</span>
          {foot(cmpP && <Chg v={M.q / cmpP.q - 1} />, cmpP && num(cmpP.q))}
        </div>
      </div>

      <div className="g32">
        <Acumulado D={D} sel={sel} prevK={prevK} esCurso={esCurso} hasta={hasta} pe={pe} estimado={!!G?.de} G={G} netoFin={netoFin} />
        <div className="card">
          <h3>Punto de equilibrio</h3>
          <p className="sub">{!G ? 'Todavía no hay ningún mes con gastos cargados.' : G.de ? `${cap(mesN(sel))} todavía no tiene gastos cargados: uso los de ${mesN(G.de)}.` : 'Venta sin IVA contra lo que hace falta vender para cubrir los gastos del mes.'}</p>
          {pe != null && <Equilibrio key={sel} M={M} pe={pe} pe2={pe2} nc={nc} esCurso={esCurso} netoFin={netoFin} contrib={contrib} comPct={comPct} G={G} onSim={setNcSim} />}
        </div>
      </div>

      <Calendario M={M} sel={sel} esCurso={esCurso} hasta={hasta} />

      <div className="g2">
        <div className="card">
          <h3>Rubros</h3>
          <p className="sub">Venta con IVA. El margen es sobre la venta sin IVA, igual que en el estado de resultados.</p>
          <div className="sx"><table className="t">
            <thead><tr><th>Rubro</th><th>Venta</th><th>%</th><th>Unid.</th><th>Margen</th></tr></thead>
            <tbody>
              {Object.entries(M.rubro).filter(r => r[1].tot > 0).sort((a, b) => b[1].tot - a[1].tot).map(([nm, v]) => (
                <tr key={nm}><td>{nm}</td><td>{fmt(v.tot)}</td><td>{pc(v.tot / M.tot, 0)}</td><td>{num(v.q)}</td><td>{pc((v.neto - v.cmv) / v.neto)}</td></tr>
              ))}
              <tr className="tot"><td>Total</td><td>{fmt(M.tot)}</td><td></td><td>{num(M.q)}</td><td>{pc(mbp)}</td></tr>
            </tbody>
          </table></div>
        </div>
        <div className="card">
          <h3>Lo más vendido del mes</h3>
          <p className="sub">Los 8 productos que más vendieron</p>
          <div className="sx"><table className="t">
            <thead><tr><th>Producto</th><th>Unid.</th><th>Venta</th><th>Margen</th></tr></thead>
            <tbody>
              {Object.entries(M.prod).sort((a, b) => b[1].tot - a[1].tot).slice(0, 8).map(([nm, v]) => (
                <tr key={nm}><td className="w">{nm}</td><td>{num(v.q)}</td><td>{fmt(v.tot)}</td><td>{v.neto ? pc((v.neto - v.cmv) / v.neto) : '–'}</td></tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

function acumulado(D, k, hasta) {
  const M = D.meses[k]; let a = 0; const out = [];
  for (let d = 1; d <= hasta; d++) { a += M.porDiaNeto[d] || 0; out.push(a); }
  return out;
}

function Acumulado({ D, sel, prevK, esCurso, hasta, pe, estimado, G, netoFin }) {
  const n = ultimoDia(sel);
  const cur = acumulado(D, sel, hasta), prv = prevK ? acumulado(D, prevK, ultimoDia(prevK)) : null;
  const W = 660, H = 250, L = 58, Rr = 150, T = 14, B = 28;
  const ymax = Math.max(pe || 0, netoFin, cur.at(-1), prv ? prv.at(-1) : 0) * 1.08;
  const step = ymax > 8e6 ? 2e6 : ymax > 3e6 ? 1e6 : 5e5;
  const x = d => L + (d - 1) / 30 * (W - L - Rr), y = v => T + (1 - v / ymax) * (H - T - B);
  const path = a => a.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const labs = [];
  if (pe) labs.push([y(pe), `${estimado ? 'Equilibrio estimado' : 'Equilibrio'} ${fmt(pe)}`, '#a0522d', 700]);
  if (prv) labs.push([y(prv.at(-1)), `${cap(mesN(prevK))} ${fmt(prv.at(-1))}`, '#7d7066', 500]);
  if (esCurso) labs.push([y(netoFin), `A este ritmo ${fmt(netoFin)}`, '#241a16', 600]);
  else labs.push([y(cur.at(-1)), `${cap(mesN(sel))} ${fmt(cur.at(-1))}`, '#241a16', 800]);
  labs.sort((a, b) => a[0] - b[0]);
  for (let j = 1; j < labs.length; j++) if (labs[j][0] - labs[j - 1][0] < 14) labs[j][0] = labs[j - 1][0] + 14;
  const cruce = pe ? cur.findIndex(v => v >= pe) : -1;
  const ticks = []; for (let v = 0; v <= ymax; v += step) ticks.push(v);

  return (
    <div className="card">
      <h3>Cómo se fue juntando la venta</h3>
      <p className="sub">
        Venta sin IVA sumada día a día.{' '}
        {G?.de && `${cap(mesN(sel))} no tiene gastos cargados: el equilibrio es estimado con los gastos de ${mesN(G.de)} (${fmt(G.g)}) y el margen de ${mesN(sel)}. `}
        {pe ? (cruce >= 0 ? `El día ${cruce + 1} se pasó el punto de equilibrio (círculo verde).` : esCurso ? 'Todavía no llegó al punto de equilibrio.' : 'No llegó al punto de equilibrio.') : ''}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Venta acumulada del mes" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {ticks.map(v => <g key={v}><line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} stroke="#eeedeb" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="#7d7066">$ {(v / 1e6).toLocaleString('es-AR')} M</text></g>)}
        {[1, 5, 10, 15, 20, 25, 30].map(d => <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#7d7066">{d}</text>)}
        {pe && <line x1={L} x2={W - Rr} y1={y(pe)} y2={y(pe)} stroke="#a0522d" strokeWidth="1.5" strokeDasharray="5 4" />}
        {prv && <path d={path(prv)} fill="none" stroke="#c4b8aa" strokeWidth="2" />}
        {esCurso && <path d={`M${x(cur.length)},${y(cur.at(-1))}L${x(n)},${y(netoFin)}`} fill="none" stroke="#241a16" strokeWidth="2" strokeDasharray="2 4" />}
        <path d={path(cur)} fill="none" stroke="#241a16" strokeWidth="2.6" />
        <circle cx={x(cur.length)} cy={y(cur.at(-1))} r="4" fill="#241a16" />
        {esCurso && <text x={x(cur.length)} y={y(cur.at(-1)) - 10} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#241a16">{fmt(cur.at(-1))}</text>}
        {cruce >= 0 && <circle cx={x(cruce + 1)} cy={y(cur[cruce])} r="5" fill="none" stroke="#047857" strokeWidth="2" />}
        {labs.map(([yy, t, col, w]) => <text key={t} x={W - Rr + 8} y={yy + 4} fontSize="10.5" fill={col} fontWeight={w}>{t}</text>)}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#241a16' }} />{cap(mesN(sel))}</span>
        {prv && <span><i style={{ background: '#c4b8aa' }} />{cap(mesN(prevK))}</span>}
        {esCurso && <span><i style={{ background: 'repeating-linear-gradient(90deg,#241a16 0 2px,transparent 2px 5px)' }} />a este ritmo</span>}
        {pe && <span><i style={{ background: '#a0522d' }} />punto de equilibrio</span>}
      </div>
    </div>
  );
}

function Equilibrio({ M, pe, pe2, nc, esCurso, netoFin, contrib, comPct, G, onSim }) {
  const [txt, setTxt] = useState(nc ? num(nc) : '');
  const top = Math.max(pe, netoFin, M.neto) * 1.12;
  const falta = pe - netoFin;
  return (
    <div className="meter">
      <div className="tr">
        {esCurso && <span className="pr" style={{ width: `${netoFin / top * 100}%` }} />}
        <span className="fi" style={{ width: `${M.neto / top * 100}%` }} />
        <span className="mk a" style={{ left: `${pe / top * 100}%` }}><span>sin NC</span></span>
        {pe2 != null && <span className="mk b" style={{ left: `${pe2 / top * 100}%` }}><span>con NC</span></span>}
      </div>
      <div className="pe-rows">
        <div><span>{esCurso ? 'Vendido hasta hoy' : 'Vendido'}</span><b>{fmt(M.neto)}</b></div>
        {esCurso && <div><span>A este ritmo, a fin de mes</span><b>{fmt(netoFin)}</b></div>}
        <div><span style={{ color: '#a0522d' }}>Equilibrio sin NC</span><b style={{ color: '#a0522d' }}>{fmt(pe)}</b></div>
        {pe2 != null && <div><span style={{ color: '#047857' }}>Equilibrio con NC de {fmt(nc)}</span><b style={{ color: '#047857' }}>{fmt(pe2)}</b></div>}
      </div>
      <div style={{ fontSize: 13.5 }}>
        {falta > 0
          ? <><b className="neg">{esCurso ? 'A este ritmo faltarían' : 'Faltaron'} {fmt(falta)}</b> para cubrir los gastos sin ayuda de Kankay.</>
          : <><b className="pos">{esCurso ? 'A este ritmo sobrarían' : 'Sobraron'} {fmt(-falta)}</b> por encima del equilibrio, sin contar la NC.</>}
      </div>
      <div className="mut" style={{ fontSize: 12 }}>
        Cómo se calcula: de cada $ 100 vendidos sin IVA quedan $ {(contrib * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} después
        de mercadería, tarjetas ({pc(comPct / 100, 0)}) e IIBB. Los gastos fijos ({fmt(G.g)}) se dividen por eso. Una NC es plata que entra
        sin vender: le resta a los gastos fijos, así que baja el equilibrio en NC ÷ {contrib.toLocaleString('es-AR', { maximumFractionDigits: 3 })}.
      </div>
      <label className="sim">
        Probar con una NC de $
        <input className="in" value={txt} placeholder="0" inputMode="numeric"
               onChange={e => setTxt(e.target.value)}
               onBlur={() => onSim(parseMonto(txt) || 0)}
               onKeyDown={e => { if (e.key === 'Enter') onSim(parseMonto(txt) || 0); }} />
      </label>
    </div>
  );
}

function Calendario({ M, sel, esCurso, hasta }) {
  const n = ultimoDia(sel);
  const off = (new Date(Number(sel.slice(0, 4)), Number(sel.slice(5)) - 1, 1).getDay() + 6) % 7;
  const mx = Math.max(...Object.values(M.porDia));
  const best = Object.entries(M.porDia).sort((a, b) => b[1] - a[1])[0];
  const shade = v => { if (v <= 0) return ['#f6f1e9', false]; const t = v / mx;
    return t < .2 ? ['#ebe3d6', false] : t < .4 ? ['#d3c8ba', false] : t < .6 ? ['#8e7f71', true] : t < .8 ? ['#3b2a24', true] : ['#241a16', true]; };
  const sinV = Array.from({ length: hasta }, (_, i) => i + 1).filter(d => !(M.porDia[d] > 0)).length;
  const celdas = [];
  for (let k = 0; k < off; k++) celdas.push(<div key={`e${k}`} className="d empty" />);
  for (let d = 1; d <= n; d++) {
    if (esCurso && d > hasta) { celdas.push(<div key={d} className="d fut"><span className="n">{d}</span></div>); continue; }
    const v = M.porDia[d] || 0, [bg, dark] = shade(v);
    celdas.push(<div key={d} className={`d ${dark ? 'dark' : ''} ${Number(best[0]) === d ? 'best' : ''}`} style={{ background: bg }}>
      <span className="n">{d}</span><span className="m">{v ? fmt(v) : '–'}</span></div>);
  }
  return (
    <div className="card">
      <h3>Día por día</h3>
      <p className="sub">Venta con IVA de cada día. El mejor fue el {best[0]}, con {fmt(best[1])}. {sinV} {sinV === 1 ? 'día' : 'días'} sin ventas.</p>
      <div className="sx"><div className="cal">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="h">{d}</div>)}
        {celdas}
      </div></div>
      <div className="scale">
        <span>menos</span>{['#f6f1e9', '#d3c8ba', '#8e7f71', '#3b2a24', '#241a16'].map(c => <span key={c} className="sw" style={{ background: c }} />)}<span>más</span>
        <span style={{ marginLeft: 12 }}><span className="sw" style={{ outline: '2px solid #a0522d', background: 'none', verticalAlign: -2 }} /> mejor día</span>
      </div>
    </div>
  );
}
