import { useEffect, useState } from 'react';
import api from '../../../api';
import { fmt, num, pc, mesN, cap, MC, DW, ultimoDia, iso, enCurso, diaHasta, calcMes, parseMonto } from './kankayUtils';

// ---------------------------------------------------------------- Mes a mes
export function MesAMes({ D }) {
  const meses = Object.keys(D.meses).sort(), curso = enCurso(D);
  const cols = meses.map(k => ({ k, M: D.meses[k], t: MC[Number(k.slice(5)) - 1] + (k === curso ? ` 1–${diaHasta(D, k)}` : '') }));
  let pr = null;
  if (curso) {
    const O = D.meses[curso], f = ultimoDia(curso) / diaHasta(D, curso);
    pr = { tot: O.tot * f, neto: O.neto * f, cmv: O.cmv * f, ventas: O.ventas * f, q: O.q * f, sinFact: O.sinFact * f, dias: O.dias * f };
  }
  const filas = [
    ['Venta con IVA', M => fmt(M.tot)], ['Venta sin IVA', M => fmt(M.neto)], ['Costo de mercadería', M => pc(M.cmv / M.neto)],
    ['Margen bruto', M => fmt(M.neto - M.cmv)], ['Ventas', M => num(M.ventas)], ['Ticket promedio', M => fmt(M.tot / M.ventas)],
    ['Unidades', M => num(M.q)], ['Venta por día con ventas', M => fmt(M.tot / M.dias)], ['Sin factura', M => pc(M.sinFact / M.tot, 0)],
  ];
  return (
    <div className="card">
      <h3>Mes a mes</h3>
      <p className="sub">{curso ? `${cap(mesN(curso))} va del 1 al ${diaHasta(D, curso)}. La última columna lo proyecta entero a este ritmo.` : 'Todos los meses cargados.'}</p>
      <div className="sx"><table className="t">
        <thead><tr><th></th>{cols.map(c => <th key={c.k}>{c.t}</th>)}{pr && <th style={{ color: '#a0522d' }}>{MC[Number(curso.slice(5)) - 1]} proyectado</th>}</tr></thead>
        <tbody>{filas.map(([n, fn]) => (
          <tr key={n}><td>{n}</td>{cols.map(c => <td key={c.k}>{fn(c.M)}</td>)}{pr && <td style={{ color: '#a0522d' }}>{fn(pr)}</td>}</tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

// ---------------------------------------------------------------- Productos
function Barras({ arr, tot }) {
  const mx = Math.max(...arr.map(a => a[1]));
  return <div className="hb">{arr.map(([n, v]) => (
    <div className="r" key={n}><span>{n}</span><span className="tk"><i style={{ width: `${v / mx * 100}%` }} /></span><b>{pc(v / tot, 0)}</b></div>
  ))}</div>;
}

export function Productos({ D }) {
  const T = D.total, meses = Object.keys(D.meses).sort();
  const P = Object.entries(T.prod).sort((a, b) => b[1].tot - a[1].tot);
  let acc = 0; const top = [];
  for (const p of P) { acc += p[1].tot; top.push([...p, acc]); if (acc >= 0.8 * T.tot) break; }
  const desde = `${Number(T.desde.slice(8))}/${Number(T.desde.slice(5, 7))}`, hasta = `${Number(T.hasta.slice(8))}/${Number(T.hasta.slice(5, 7))}`;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="g2">
        <div className="card"><h3>Rubros</h3><p className="sub">Del {desde} al {hasta}</p>
          <Barras arr={Object.entries(T.rubro).map(([n, v]) => [n, v.tot]).sort((a, b) => b[1] - a[1])} tot={T.tot} /></div>
        {T.rubro.Sartenes && <div className="card"><h3>Sartenes por línea</h3><p className="sub">Dentro del rubro Sartenes</p>
          <Barras arr={Object.entries(T.sub).map(([n, v]) => [n.replace('Linea ', 'Línea ').replace('Ceramica', 'Cerámica'), v.tot]).sort((a, b) => b[1] - a[1])} tot={T.rubro.Sartenes.tot} /></div>}
      </div>
      <div className="card">
        <h3>{top.length} de {P.length} productos hacen el 80 % de la venta</h3>
        <p className="sub">Del {desde} al {hasta}. En cada mes, las unidades vendidas.</p>
        <div className="sx"><table className="t">
          <thead><tr><th>#</th><th>Producto</th><th>Venta</th><th>% acum.</th><th>Margen</th>{meses.map(k => <th key={k}>{MC[Number(k.slice(5)) - 1]}</th>)}</tr></thead>
          <tbody>{top.map(([n, v, a], i) => (
            <tr key={n}><td className="mut">{i + 1}</td><td className="w">{n}</td><td>{fmt(v.tot)}</td><td>{pc(a / T.tot, 0)}</td>
              <td>{v.neto ? pc((v.neto - v.cmv) / v.neto) : '–'}</td>
              {meses.map(k => <td key={k}>{D.meses[k].prod[n]?.q ? num(D.meses[k].prod[n].q) : <span className="mut">–</span>}</td>)}</tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Vendedores (en mejora)
export function Vendedores({ D }) {
  const T = D.total;
  const vs = Object.keys(T.vdias).sort((a, b) => (T.vend[b]?.tot || 0) - (T.vend[a]?.tot || 0)).filter(v => T.vend[v]?.tot > 0);
  const loc = {};
  for (const [k, M] of Object.entries(D.meses)) for (const [d, v] of Object.entries(M.porDia)) {
    if (v <= 0) continue;
    const w = new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, Number(d)).getDay();
    loc[w] = loc[w] || { t: 0, n: 0 }; loc[w].t += v; loc[w].n++;
  }
  const ord = [1, 2, 3, 4, 5, 6, 0];
  const nom = v => v === 'Sin vendedor' ? <span className="mut">Sin vendedor</span> : v;
  const Celda = ({ t, n, prom: r0 }) => {
    if (!n) return <td className="mut">–</td>;
    const v = t / n, r = r0 ? v / r0 - 1 : null;
    return <td className="c">{fmt(v)}<small>{n} {n === 1 ? 'día' : 'días'}{r != null && <> · <span className={`chg ${r >= 0 ? 'up' : 'down'}`}>{r >= 0 ? '+' : '−'}{pc(Math.abs(r), 0)}</span></>}</small></td>;
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="wipbox"><b>En mejora.</b> Hoy cada venta queda a nombre de quien figura como vendedor en Dux, y eso muchas veces está mal cargado.
        Cuando esté el calendario con el turno de cada uno, cada venta va a quedar a nombre de quien estaba trabajando a esa hora,
        y la comparación va a ser justa: por día de la semana y por turno.</div>
      <div className="card"><h3>Cada vendedor</h3>
        <p className="sub">"Días" son los días en que tiene al menos una venta a su nombre; con el calendario van a ser los días que trabajó.</p>
        <div className="sx"><table className="t">
          <thead><tr><th>Vendedor</th><th>Días</th><th>Venta</th><th>%</th><th>Por día</th><th>Ventas</th><th>Ticket</th></tr></thead>
          <tbody>{vs.map(v => { const x = T.vend[v]; return (
            <tr key={v}><td>{nom(v)}</td><td>{T.vdias[v]}</td><td>{fmt(x.tot)}</td><td>{pc(x.tot / T.tot, 0)}</td><td>{fmt(x.tot / T.vdias[v])}</td><td>{x.ventas}</td><td>{fmt(x.tot / Math.max(x.ventas, 1))}</td></tr>); })}</tbody>
        </table></div></div>
      <div className="card"><h3>Venta por día trabajado, según el día de la semana</h3>
        <p className="sub">No se compara un martes con un domingo: cada columna compara a los vendedores contra el promedio del local ese mismo día. Abajo de cada monto, cuántos días.</p>
        <div className="sx"><table className="t vg">
          <thead><tr><th>Vendedor</th>{ord.map(d => <th key={d}>{DW[d].slice(0, 3)}</th>)}</tr></thead>
          <tbody>
            <tr style={{ background: '#fafaf9' }}><td><b>Promedio del local</b></td>{ord.map(d => <Celda key={d} t={loc[d]?.t || 0} n={loc[d]?.n || 0} />)}</tr>
            {vs.map(v => <tr key={v}><td>{nom(v)}</td>{ord.map(d => { const x = T.vdow[v]?.[d];
              return <Celda key={d} t={x?.tot || 0} n={x?.f || 0} prom={loc[d] ? loc[d].t / loc[d].n : null} />; })}</tr>)}
          </tbody>
        </table></div></div>
      <div className="card"><h3>Mañana y tarde</h3><p className="sub">Corte a las 15 h, a confirmar con los turnos reales de Kankay</p>
        <div className="sx"><table className="t">
          <thead><tr><th>Vendedor</th><th>Mañana (hasta 15 h)</th><th>Tarde (desde 15 h)</th><th>% tarde</th></tr></thead>
          <tbody>{vs.map(v => { const t = T.vturno[v]; return (
            <tr key={v}><td>{nom(v)}</td><td>{fmt(t.man)}</td><td>{fmt(t.tar)}</td><td>{pc(t.tar / (t.man + t.tar), 0)}</td></tr>); })}</tbody>
        </table></div></div>
    </div>
  );
}

// ---------------------------------------------------------------- Días y horas
export function DiasHoras({ D }) {
  const TK = D.tickets, ord = [1, 2, 3, 4, 5, 6, 0];
  const dias = [];
  const [a0, m0, d0] = D.total.desde.split('-').map(Number), [a1, m1, d1] = D.total.hasta.split('-').map(Number);
  for (let d = new Date(a0, m0 - 1, d0); d <= new Date(a1, m1 - 1, d1); d.setDate(d.getDate() + 1)) dias.push({ f: iso(d), w: d.getDay() });
  const porF = {}; TK.forEach(t => { porF[t[0]] = (porF[t[0]] || 0) + t[2]; });
  const W = ord.map(w => { const ds = dias.filter(x => x.w === w); return [w, ds.length ? ds.reduce((a, x) => a + (porF[x.f] || 0), 0) / ds.length : 0]; });
  const hs = [...new Set(TK.map(t => t[1]))].sort((a, b) => a - b);
  const H = hs.map(h => [h, TK.filter(t => t[1] === h).reduce((a, t) => a + t[2], 0) / dias.length]);
  const marca = arr => { const v = arr.map(a => a[1]); return { mx: Math.max(...v), mn: Math.min(...v), sm: v.reduce((a, b) => a + b, 0) }; };
  const dw = marca(W), hh = marca(H);
  const best = W.find(x => x[1] === dw.mx), worst = W.find(x => x[1] === dw.mn);
  const rango = `Del ${Number(D.total.desde.slice(8))}/${Number(D.total.desde.slice(5, 7))} al ${Number(D.total.hasta.slice(8))}/${Number(D.total.hasta.slice(5, 7))}`;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <h3>¿Cuánto se vende cada día?</h3>
        <p className="sub">Venta con IVA de un {DW[best[0]].toLowerCase()} promedio, de un {DW[worst[0]].toLowerCase()} promedio, y así. Abajo del monto, qué parte de la venta de una semana hace ese día. {rango}. Cuenta también los días sin ventas.</p>
        <div className="sx"><div className="vc">{W.map(([w, v]) => { const c = v === dw.mx ? 'best' : v === dw.mn ? 'worst' : '';
          return <div key={w} className={`c ${c}`}>{c ? <span className="pill">{c === 'best' ? 'Mejor' : 'Peor'}</span> : <span className="ph" />}
            <span className="m">{fmt(v)}</span><span className="pc">{pc(v / dw.sm, 0)}</span>
            <i style={{ height: `${Math.max(v / dw.mx * 100, 2) * 0.68}%` }} /><span className="d">{DW[w]}</span></div>; })}</div></div>
      </div>
      <div className="card">
        <h3>¿Cuánto se vende a cada hora?</h3>
        <p className="sub">Venta con IVA de un día promedio en cada hora. Por ejemplo, "20 h" es lo que se vende de 20 a 21 h en un día cualquiera. Al lado, qué parte de la venta del día entra en esa hora.</p>
        <div className="hr">{H.map(([h, v]) => { const c = v === hh.mx ? 'best' : v === hh.mn ? 'worst' : '';
          return <div key={h} className={`r ${c}`}><span className="d">{h} h</span><span className="tk"><i style={{ width: `${Math.max(v / hh.mx * 100, 1)}%` }} /></span>
            <span className="m">{c && <span className="pill">{c === 'best' ? 'Mejor' : 'Peor'}</span>}{fmt(v)}<span className="pc">{pc(v / hh.sm, 0)}</span></span></div>; })}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Estado de resultados
// Meses uno al lado del otro y el total del año. Ventas y costo salen del Excel; gastos,
// impuestos y NC se escriben acá y se guardan al salir del casillero.
export function Eerr({ D, eerr, comPct, onCambio }) {
  const meses = Object.keys(D.meses).sort(), curso = enCurso(D);
  const [st, setSt] = useState(eerr.meses);
  const [pct, setPct] = useState(String(comPct).replace('.', ','));
  const [estado, setEstado] = useState('');
  useEffect(() => { setSt(eerr.meses); }, [eerr]);

  const E = { meses: st };
  const C = meses.map(k => calcMes(D, E, k, comPct));
  const RUB = [...new Set(meses.flatMap(k => Object.keys(D.meses[k].rubro)))].sort((a, b) => (D.total.rubro[b]?.neto || 0) - (D.total.rubro[a]?.neto || 0));
  const nombres = (st[meses.at(-1)] || st[meses[0]] || { gastos: [] }).gastos.map(g => g[0]);

  async function guardar(k, nuevo) {
    setSt(s => ({ ...s, [k]: nuevo }));
    setEstado('Guardando…');
    try {
      const r = await api.put(`/kankay/eerr/${k}`, { gastos: nuevo.gastos, iibb: nuevo.iibb, f931: nuevo.f931, nc: nuevo.nc });
      onCambio(r.data.data);
      setEstado('Guardado');
    } catch (err) { setEstado(err.response?.data?.error || 'No se pudo guardar'); }
  }
  const base = k => st[k] || { gastos: nombres.map(n => [n, null]), iibb: null, f931: null, nc: null };
  const setGasto = (k, nombre, v) => { const b = base(k); const g = nombres.map(n => [n, n === nombre ? v : (b.gastos.find(x => x[0] === n)?.[1] ?? null)]); guardar(k, { ...b, gastos: g }); };
  const setCampo = (k, f, v) => guardar(k, { ...base(k), [f]: v });
  async function terminar(k) {
    setEstado('Avisando…');
    try {
      const r = await api.post(`/kankay/eerr/${k}/terminar`);
      onCambio(r.data.data.eerr);
      setEstado(r.data.data.enviados ? `${cap(mesN(k))} terminado. Aviso enviado.` : `${cap(mesN(k))} terminado. Nadie tiene los avisos activados en su celular.`);
    } catch (err) { setEstado(err.response?.data?.error || 'No se pudo marcar como terminado'); }
  }

  async function guardarPct() {
    const n = Number(String(pct).replace(',', '.'));
    if (!Number.isFinite(n) || String(pct).trim() === '' || n === comPct) return;
    try { await api.put('/kankay/comision', { pct: n }); onCambio(null, n); setEstado('Guardado'); }
    catch (err) { setEstado(err.response?.data?.error || 'No se pudo guardar'); }
  }

  const ncol = meses.length + 2;
  const casillero = (k, label, v, onSave) => <Casillero key={`${k}-${label}-${v}`} v={v} label={`${label} ${mesN(k)}`} onSave={onSave} />;
  const A = <span className="tag a">del Excel</span>, MN = <span className="tag m">a mano</span>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="bar">
        <span className="cap"><b>Estado de resultados {meses.at(-1).slice(0, 4)}</b> · los meses uno al lado del otro y el total del año.{curso ? ` ${cap(mesN(curso))} es parcial (1 al ${diaHasta(D, curso)}).` : ''}</span>
        <span className="cap"><span className="tag a">del Excel</span> sale solo · <span className="tag m">a mano</span> lo escribís · <span className="tag p">%</span> porcentaje {estado && <b style={{ fontSize: 12, marginLeft: 8 }}>{estado}</b>}</span>
      </div>
      <div className="card sx"><table className="t er">
        <thead><tr><th></th>{meses.map(k => <th key={k}>{cap(mesN(k))}{k === curso ? <small> 1–{diaHasta(D, k)}</small> : null}
          <Terminado e={st[k]} onTerminar={() => terminar(k)} /></th>)}<th className="tot">Total {meses.at(-1).slice(0, 4)}</th></tr></thead>
        <tbody>
          <Grupo n={ncol} t="Ventas sin IVA" />
          {RUB.map(r => <Linea C={C} key={`v${r}`} label={<>{r}{A}</>} vals={C.map(c => c.M.rubro[r] ? c.M.rubro[r].neto : null)} />)}
          <Linea C={C} label="Ventas netas" vals={C.map(c => c.M.neto)} cls="s" />
          <Grupo n={ncol} t="Costo de mercadería" />
          {RUB.map(r => <Linea C={C} key={`c${r}`} label={<>{r}{A}</>} vals={C.map(c => c.M.rubro[r] ? -c.M.rubro[r].cmv : null)} />)}
          <Linea C={C} label="Costo de mercadería" vals={C.map(c => -c.M.cmv)} cls="s" pctOf />
          <Linea C={C} label="Margen bruto" vals={C.map(c => c.mb)} cls="s" pctOf />
          <Grupo n={ncol} t="Gastos operativos" />
          {nombres.map(n => (
            <tr key={n}><td className="i">{n}{MN}</td>
              {meses.map(k => <td key={k}>{casillero(k, n, base(k).gastos.find(g => g[0] === n)?.[1] ?? null, v => setGasto(k, n, v))}</td>)}
              <td className="tot">{fmt(-meses.reduce((a, k) => a + (base(k).gastos.find(g => g[0] === n)?.[1] || 0), 0))}</td></tr>
          ))}
          <Linea C={C} label="Gastos operativos" vals={C.map(c => c.cargado ? -c.gT : null)} cls="s" pctOf falta />
          <Linea C={C} label="Resultado operativo" vals={C.map(c => c.ro)} cls="res" pctOf falta />
          <Grupo n={ncol} t="Impuestos" />
          {[['iibb', 'Ingresos brutos'], ['f931', 'Cargas sociales (F. 931)']].map(([f, n]) => (
            <tr key={f}><td className="i">{n}{MN}</td>
              {meses.map(k => <td key={k}>{casillero(k, n, base(k)[f], v => setCampo(k, f, v))}</td>)}
              <td className="tot">{fmt(-meses.reduce((a, k) => a + (base(k)[f] || 0), 0))}</td></tr>
          ))}
          <Linea C={C} label="Impuestos" vals={C.map(c => c.imp ? -c.imp : null)} cls="s" pctOf />
          <Grupo n={ncol} t="Gastos financieros" />
          <Linea C={C} label={<>Comisión de tarjetas <span className="tag p">%</span>{' '}
            <input className="inp" value={pct} aria-label="porcentaje de comisión" onChange={e => setPct(e.target.value)}
                   onBlur={guardarPct} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} /> % de la venta neta
            <small style={{ display: 'inline' }}> · incluye cuotas y gastos de tarjeta</small></>} vals={C.map(c => -c.com)} pctOf />
          <Linea C={C} label="Resultado antes de no recurrentes" vals={C.map(c => c.antes)} cls="s" pctOf falta />
          <Grupo n={ncol} t="Otros ingresos no recurrentes" />
          <tr><td className="i">Nota de crédito Kankay{MN}</td>
            {meses.map(k => <td key={k}>{casillero(k, 'Nota de crédito', base(k).nc, v => setCampo(k, 'nc', v))}</td>)}
            <td className="tot">{fmt(meses.reduce((a, k) => a + (base(k).nc || 0), 0))}</td></tr>
          <Linea C={C} label="Resultado del mes" vals={C.map(c => c.res)} cls="res" pctOf falta />
          <tr><td colSpan={ncol} className="mut" style={{ textAlign: 'left', whiteSpace: 'normal', fontSize: 12, paddingTop: 14, border: 0 }}>
            Cada monto se guarda solo al salir del casillero, sin avisar a nadie. Cuando termines un mes, tocá
            <b> Terminé, avisar</b> debajo del nombre del mes: ahí les llega el aviso a los dueños, con el resultado. Mientras un mes no tenga gastos cargados, sus resultados dicen "faltan gastos"
            y el total del año suma solo los meses completos.</td></tr>
        </tbody>
      </table></div>
    </div>
  );
}

const cuandoCorto = ts => { const d = new Date(ts); return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// Debajo de cada mes: si ya se dio por terminado, quién y cuándo; si no (o si se cambió
// algo después), el botón que avisa a los dueños.
function Terminado({ e, onTerminar }) {
  if (!e?.guardado) return null;
  const cambiado = e.terminado_en && new Date(e.actualizado_en) > new Date(e.terminado_en);
  return (
    <div style={{ marginTop: 6, display: 'grid', gap: 4, justifyItems: 'end', textTransform: 'none', letterSpacing: 0 }}>
      {e.terminado_en && <span style={{ fontSize: 11, fontWeight: 600, color: cambiado ? '#92400e' : '#047857' }}>
        {cambiado ? 'Cambió después de terminado' : `✓ Terminado ${cuandoCorto(e.terminado_en)}`}</span>}
      {(!e.terminado_en || cambiado) && <button type="button" onClick={onTerminar}
        style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#55585c', border: 0, borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>
        {cambiado ? 'Avisar de nuevo' : 'Terminé, avisar'}</button>}
    </div>
  );
}

function Val({ v, base: b, falta }) {
  if (v == null) return falta ? <span className="mut" style={{ fontWeight: 500, fontSize: 12 }}>faltan gastos</span> : <span className="mut">–</span>;
  return <>{fmt(v)}{b ? <small>{pc(v / b)}</small> : null}</>;
}
function Linea({ C, label, vals, cls = '', pctOf, falta }) {
  const sum = vals.reduce((a, v) => a + (v || 0), 0);
  // El % del total es sobre la venta de los meses que tienen ese dato, no la del año entero.
  const baseT = vals.reduce((a, v, i) => a + (v == null ? 0 : C[i].M.neto), 0);
  const nulo = vals.every(v => v == null);
  return <tr className={cls}><td className={cls ? '' : 'i'}>{label}</td>
    {vals.map((v, i) => <td key={i} className={v < 0 ? 'neg' : ''}><Val v={v} base={pctOf ? C[i].M.neto : null} falta={falta} /></td>)}
    <td className={`tot ${sum < 0 ? 'neg' : ''}`}><Val v={nulo ? null : sum} base={pctOf ? baseT : null} falta={falta} /></td></tr>;
}
const Grupo = ({ t, n }) => <tr className="g"><td colSpan={n}>{t}</td></tr>;

// Un casillero de monto: se escribe libre y se guarda al salir, solo si cambió.
function Casillero({ v, label, onSave }) {
  const [txt, setTxt] = useState(v == null ? '' : num(v));
  const salir = () => { const n = parseMonto(txt); if (n !== (v ?? null)) onSave(n); else setTxt(v == null ? '' : num(v)); };
  return <input className="in" value={txt} placeholder="Sin cargar" aria-label={label} inputMode="numeric"
                onChange={e => setTxt(e.target.value)} onBlur={salir} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />;
}
