import { useEffect, useMemo, useState } from 'react';
import api from '../../../api';
import { fmtARS, fmtDoc, shortName } from '../redUtils';

// "Vendedores": cada local por separado (comparar vendedores de locales distintos es
// injusto) y en las fechas que se elijan. Arriba se eligen a quiénes comparar; abajo,
// lo mismo separado en mañana y tarde. Todo se mide "por turno trabajado", así no
// gana el que más días hizo. Las tiendas se miden en docenas; el Café, en pesos.

const COBRE = '#8a5a3c';      // cobre mate del Café: barras y gráficos
const VERDE = '#1f7a4d';
const MIN_TURNOS = 10;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pct1 = v => Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hoyIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function Chip({ a, b }) {
  if (!b) return null;
  const v = (a / b - 1) * 100;
  const tono = Math.abs(v) < 2 ? 'bg-stone-100 text-stone-500' : v > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700';
  return <span className={`text-[11.5px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${tono}`}>{v >= 0 ? '▲' : '▼'} {pct1(v)} %</span>;
}

function Curva({ serie, color }) {
  if (serie.length < 2) return <span className="text-xs text-stone-400">un solo mes</span>;
  const w = 96, h = 26, p = 3;
  const min = Math.min(...serie), max = Math.max(...serie);
  const pts = serie.map((v, i) => [p + i * (w - 2 * p) / (serie.length - 1), h - p - (v - min) / (max - min || 1) * (h - 2 * p)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block ml-auto" aria-hidden="true">
      <polyline fill="none" stroke="#a3a5a8" strokeWidth="1.5" strokeLinejoin="round" points={pts.map(q => q.join(',')).join(' ')} />
      <circle cx={lx} cy={ly} r="2.8" fill={color} stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

export default function VendedoresSection({ selId = null, locales = [] }) {
  const anioHoy = hoyIso().slice(0, 4);
  const [localId, setLocalId] = useState(selId || locales[0]?.id || null);
  const [desde, setDesde]     = useState(`${anioHoy}-01-01`);
  const [hasta, setHasta]     = useState(hoyIso());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [elegidos, setElegidos] = useState(null); // null = los de siempre (sin genéricos, con 10 turnos o más)

  useEffect(() => { if (selId) setLocalId(selId); }, [selId]);
  useEffect(() => { if (!localId && locales[0]) setLocalId(locales[0].id); }, [locales, localId]);

  useEffect(() => {
    if (!localId || !desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    api.get('/red/vendedores', { params: { local_id: localId, desde, hasta } })
      .then(r => { setData(r.data.data); setElegidos(null); })
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [localId, desde, hasta]);

  const local = locales.find(l => l.id === localId);
  const cafe = local?.tipo === 'cafeteria';
  const med = o => (cafe ? o.f : o.d);
  const fmt = cafe ? fmtARS : fmtDoc;
  const color = cafe ? COBRE : '#1f2022';

  // Totales por persona, por turno y por mes
  const gente = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    for (const r of data.filas) {
      if (!m.has(r.nombre)) m.set(r.nombre, { nombre: r.nombre, gen: data.genericos.includes(r.nombre), tot: { d: 0, f: 0, turnos: 0, tk: 0 }, m: { d: 0, f: 0, turnos: 0, tk: 0 }, t: { d: 0, f: 0, turnos: 0, tk: 0 }, meses: {} });
      const g = m.get(r.nombre);
      for (const o of [g.tot, g[r.turno]]) { o.d += r.d; o.f += r.f; o.turnos += r.turnos; o.tk += r.tk; }
      const mm = g.meses[r.mes] || (g.meses[r.mes] = { d: 0, f: 0, turnos: 0 });
      mm.d += r.d; mm.f += r.f; mm.turnos += r.turnos;
    }
    return [...m.values()].sort((a, b) => (cafe ? b.tot.f - a.tot.f : b.tot.d - a.tot.d));
  }, [data, cafe]);

  const sel = elegidos ?? gente.filter(g => !g.gen && g.tot.turnos >= MIN_TURNOS).map(g => g.nombre);
  const toggle = n => setElegidos(sel.includes(n) ? sel.filter(x => x !== n) : [...sel, n]);
  const meses = data ? [...new Set(data.filas.map(r => r.mes))].sort() : [];

  const filas = gente.filter(g => sel.includes(g.nombre)).map(g => ({
    ...g,
    porTurno: g.tot.turnos ? med(g.tot) / g.tot.turnos : 0,
    ventaTk: g.tot.tk ? g.tot.f / g.tot.tk : 0,
    docCompra: g.tot.tk ? g.tot.d / g.tot.tk : 0,
    serie: meses.map(mes => { const x = g.meses[mes]; return x && x.turnos ? med(x) / x.turnos : 0; }),
  })).sort((a, b) => b.porTurno - a.porTurno);
  const reales = filas.filter(f => !f.gen && f.tot.turnos >= MIN_TURNOS);
  const mejor = k => (reales.length ? Math.max(...reales.map(f => f[k])) : null);
  const mPT = mejor('porTurno'), mVT = mejor('ventaTk'), mDC = mejor('docCompra');
  const promLocal = reales.length ? reales.reduce((s, f) => s + med(f.tot), 0) / reales.reduce((s, f) => s + f.tot.turnos, 0) : 0;
  const verde = (f, v, m) => (!f.gen && f.tot.turnos >= MIN_TURNOS && v === m ? { color: VERDE, fontWeight: 700 } : undefined);

  const generico = gente.find(g => g.gen);
  const totLocal = gente.reduce((s, g) => s + med(g.tot), 0);

  function Turno({ clave, titulo, horario }) {
    const lista = filas.map(f => ({ nombre: f.nombre, gen: f.gen, turnos: f[clave].turnos, tot: med(f[clave]) }))
      .filter(x => x.turnos > 0)
      .map(x => ({ ...x, pd: x.tot / x.turnos }))
      .sort((a, b) => (b.turnos >= MIN_TURNOS) - (a.turnos >= MIN_TURNOS) || b.pd - a.pd);
    const validos = lista.filter(x => !x.gen && x.turnos >= MIN_TURNOS);
    const prom = validos.length ? validos.reduce((s, x) => s + x.tot, 0) / validos.reduce((s, x) => s + x.turnos, 0) : 0;
    const max = Math.max(...lista.map(x => x.pd), prom, 1);
    const top = validos.reduce((a, b) => (!a || b.pd > a.pd ? b : a), null);
    return (
      <div className="border border-stone-100 rounded-xl p-3.5 space-y-2.5">
        <h4 className="flex flex-wrap justify-between items-baseline gap-2 font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {titulo}
          <span className="text-[11.5px] font-medium text-stone-500" style={{ fontFamily: 'Inter, sans-serif' }}>
            {horario}{validos.length ? ` · promedio ${fmt(prom)} por turno` : ''}
          </span>
        </h4>
        {lista.length === 0 && <p className="text-xs text-stone-400">Nadie de los elegidos trabajó este turno.</p>}
        {lista.map(x => (
          <div key={x.nombre} className={`grid grid-cols-[80px_1fr_72px] gap-2.5 items-center text-[13px] ${x.turnos < MIN_TURNOS && !x.gen ? 'opacity-45' : ''}`}>
            <span className={`font-semibold truncate ${x.gen ? 'text-red-700' : ''}`}>
              {x.nombre}<small className="block font-normal text-[11px] text-stone-500">{x.turnos} turnos</small>
            </span>
            <span className="relative h-4 bg-stone-100 rounded">
              <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${x.pd / max * 100}%`, background: x.gen ? '#e0b4ad' : x === top ? VERDE : color }} />
              {prom > 0 && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-stone-900" style={{ left: `${prom / max * 100}%` }} />}
            </span>
            <span className={`text-right tabular-nums font-semibold ${x.gen ? 'text-red-700' : ''}`}>{fmt(x.pd)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Local</p>
            <div className="flex flex-wrap rounded-lg border border-stone-200 overflow-hidden">
              {locales.map(l => (
                <button key={l.id} aria-pressed={localId === l.id} onClick={() => setLocalId(l.id)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${localId === l.id ? 'bg-ahg-primary text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                  {shortName(l.nombre)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Fechas</p>
            <div className="flex items-center gap-1.5">
              <input id="vend-desde" type="date" className="input text-xs w-36 py-1.5" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} />
              <span className="text-stone-400 text-xs">a</span>
              <input id="vend-hasta" type="date" className="input text-xs w-36 py-1.5" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Vendedores a comparar <span className="normal-case font-normal">· el número chico son los turnos que trabajó en esas fechas</span></p>
          <div className="flex flex-wrap gap-1.5">
            {gente.map(g => {
              const on = sel.includes(g.nombre);
              const base = g.gen ? (on ? 'bg-red-700 border-red-700 text-white' : 'text-red-700 border-stone-200 bg-white') : (on ? 'bg-ahg-primary border-ahg-primary text-white' : 'text-stone-500 border-stone-200 bg-white');
              return (
                <button key={g.nombre} aria-pressed={on} onClick={() => toggle(g.nombre)} className={`border rounded-full px-3 py-1 text-[13px] font-semibold ${base}`}>
                  {g.nombre} <small className="font-medium opacity-70">{g.tot.turnos}</small>
                </button>
              );
            })}
            {data && gente.length === 0 && <span className="text-xs text-stone-400">No hay ventas con vendedor en esas fechas.</span>}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}

      <div className="card p-4 space-y-3" style={{ opacity: loading ? 0.6 : 1 }}>
        <div>
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Comparación{local ? ` · ${shortName(local.nombre)}` : ''}</h3>
          <p className="text-xs text-stone-500">En verde, el mejor de cada columna. "Por turno" divide por los turnos que trabajó. Con menos de {MIN_TURNOS} turnos no compite.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-stone-500 border-b border-stone-100">
                <th className="text-left font-semibold py-1.5 px-2">Vendedor</th>
                <th className="text-right font-semibold py-1.5 px-2">Turnos</th>
                <th className="text-right font-semibold py-1.5 px-2">{cafe ? 'Venta' : 'Docenas'}</th>
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">Por turno</th>
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">vs promedio</th>
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">Venta por ticket</th>
                {!cafe && <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">Docenas por compra</th>}
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">
                  {meses.length > 1 ? `Por turno, ${MESES[Number(meses[0].slice(5)) - 1]}–${MESES[Number(meses[meses.length - 1].slice(5)) - 1]}` : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.nombre} className={`border-b border-stone-50 ${f.gen ? 'text-red-700' : ''}`}>
                  <td className="py-2 px-2 font-semibold whitespace-nowrap">{f.nombre}{f.gen && <span className="ml-1.5 text-[10.5px] font-semibold rounded-full px-1.5 py-0.5 bg-stone-100 text-stone-500">genérico</span>}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{f.tot.turnos}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt(med(f.tot))}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={verde(f, f.porTurno, mPT)}>{fmt(f.porTurno)}</td>
                  <td className="py-2 px-2 text-right">{!f.gen && <Chip a={f.porTurno} b={promLocal} />}</td>
                  <td className="py-2 px-2 text-right tabular-nums" style={verde(f, f.ventaTk, mVT)}>{fmtARS(f.ventaTk)}</td>
                  {!cafe && <td className="py-2 px-2 text-right tabular-nums" style={verde(f, f.docCompra, mDC)}>{fmtDoc(f.docCompra)}</td>}
                  <td className="py-2 px-2"><Curva serie={f.serie} color={color} /></td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={8} className="py-3 px-2 text-xs text-stone-400">Elegí al menos un vendedor arriba.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 space-y-3" style={{ opacity: loading ? 0.6 : 1 }}>
        <div>
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Mañana y tarde</h3>
          <p className="text-xs text-stone-500">
            Lo mismo, separado por turno (mañana es hasta las {data?.corte_turno ?? 15} h). La línea negra es el promedio del turno; en verde, el que más vende. Con menos de {MIN_TURNOS} turnos, en gris claro.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Turno clave="m" titulo="Mañana" horario={`hasta las ${data?.corte_turno ?? 15} h`} />
          <Turno clave="t" titulo="Tarde" horario={`desde las ${data?.corte_turno ?? 15} h`} />
        </div>
        {generico && totLocal > 0 && (
          <p className="text-xs text-red-700">
            Con el usuario "{generico.nombre}" se vendió {fmt(med(generico.tot))}{cafe ? '' : ' docenas'} ({Math.round(med(generico.tot) / totLocal * 100)} % del local en esas fechas): no se puede saber quién fue.
          </p>
        )}
      </div>
    </div>
  );
}
