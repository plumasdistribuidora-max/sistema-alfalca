import { useEffect, useState } from 'react';
import api from '../../../api';
import { fmtARS, fmtDoc, fmtNum, colorDeTienda, shortName, ordenarTiendas } from '../redUtils';

// "Mes a mes": cómo vino cada mes del año. Tiendas y Café separados, cada uno con su
// medida. La línea punteada es la mediana de los meses completos: el mes típico (un
// mes fuera de lo normal, como julio por las vacaciones, no la mueve). El mes en curso
// se muestra a medias y con su proyección.

const COBRE = '#8a5a3c';      // cobre mate del Café: barras y gráficos
const COBRE_TXT = '#7a4c33';  // el mismo cobre más hondo, para texto o fondo con letra blanca
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const VERDE = '#1f7a4d', ROJO = '#b23a2e';
const pct1 = v => Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const millones = v => `${(v / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;

function mediana(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Escala "linda" para el eje: 1, 2 o 5 por una potencia de 10
function paso(max) {
  const bruto = max / 5, pot = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 5, 10].map(k => k * pot).find(x => x >= bruto) || pot;
}

function Segmento({ opciones, valor, onChange }) {
  return (
    <div className="flex rounded-lg border border-stone-200 overflow-hidden">
      {opciones.map(([id, label]) => (
        <button key={id} aria-pressed={valor === id} onClick={() => onChange(id)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${valor === id ? 'bg-ahg-primary text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Barras apiladas por mes, con la mediana y la proyección del mes en curso
function Barras({ series, valor, mesActual, formatoCorto, formatoLargo, titulo }) {
  const n = mesActual.mes;
  const W = 860, H = 280, L = 56, R = 76, TOP = 22, B = 46;
  const slot = (W - L - R) / n, bw = slot * 0.58;
  const tot = Array.from({ length: n }, (_, i) => series.reduce((s, x) => s + valor(x, i), 0));
  const completos = mesActual.completo ? tot : tot.slice(0, n - 1);
  const ref = mediana(completos);
  const proy = mesActual.completo ? null : tot[n - 1] * mesActual.dias_total / mesActual.n_dias;
  const max = Math.max(...tot, proy || 0, 1) * 1.1;
  const step = paso(max);
  const y = v => TOP + (H - TOP - B) * (1 - v / max);
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: 560 }} role="img" aria-label={titulo}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#efeee9" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b6e72">{formatoCorto(v)}</text>
          </g>
        ))}
        {tot.map((t, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          const parcial = i === n - 1 && !mesActual.completo;
          let acc = 0;
          const color = parcial ? '#6b6e72' : (t >= ref ? VERDE : ROJO);
          return (
            <g key={i}>
              {parcial && proy != null && (
                <>
                  <rect x={x} y={y(proy)} width={bw} height={y(0) - y(proy)} fill="none" stroke="#a3a5a8" strokeDasharray="4 3" rx="3" />
                  <text x={x + bw / 2} y={y(proy) - 6} textAnchor="middle" fontSize="10.5" fill="#6b6e72">proy. {formatoCorto(proy)}</text>
                </>
              )}
              {series.map(sx => {
                const v = valor(sx, i), h = y(0) - y(v);
                const r = (
                  <rect key={sx.local_id} x={x} y={y(0) - acc - h} width={bw} height={Math.max(h, 0)}
                        fill={sx.color} stroke="#fff" strokeWidth="1.2" opacity={parcial ? 0.55 : 1}>
                    <title>{`${MESES_L[i]} · ${sx.corto}: ${formatoLargo(v)}`}</title>
                  </rect>
                );
                acc += h;
                return r;
              })}
              <text x={x + bw / 2} y={H - B + 16} textAnchor="middle" fontSize="11.5" fill="#1f2022">
                {MESES[i]}{parcial ? ` (1–${mesActual.n_dias})` : ''}
              </text>
              <text x={x + bw / 2} y={H - B + 31} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={color}>{formatoCorto(t)}</text>
            </g>
          );
        })}
        {completos.length > 0 && (
          <>
            <line x1={L} x2={W - R} y1={y(ref)} y2={y(ref)} stroke="#1f2022" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={W - R + 6} y={y(ref) - 3} fontSize="10.5" fontWeight="700" fill="#1f2022">mediana</text>
            <text x={W - R + 6} y={y(ref) + 10} fontSize="10.5" fill="#1f2022">{formatoCorto(ref)}</text>
          </>
        )}
      </svg>
    </div>
  );
}

// Una celda del totalizador: el valor y, debajo, el cambio contra el mes anterior
function Celda({ v, prev, fmt, parcial, total }) {
  let fondo = '#f5f4f1', texto = ' ', color = '#6b6e72';
  if (parcial) texto = 'a medias';
  else if (prev) {
    const p = (v / prev - 1) * 100;
    const a = Math.min(Math.abs(p) / 25, 1);
    fondo = p >= 0 ? `rgba(31,122,77,${(0.06 + a * 0.3).toFixed(2)})` : `rgba(178,58,46,${(0.06 + a * 0.3).toFixed(2)})`;
    color = p >= 0 ? VERDE : ROJO;
    texto = `${p >= 0 ? '▲' : '▼'} ${pct1(p)} %`;
  }
  return (
    <td className="text-center px-1.5 py-1.5 min-w-[80px]" style={{ background: fondo, border: '2px solid #fff', borderRadius: 8 }}>
      <span className={`block text-[12.5px] tabular-nums ${total ? 'font-extrabold' : 'font-semibold'} text-stone-900`}>{fmt(v)}</span>
      <span className="block text-[10.5px] font-semibold" style={{ color }}>{texto}</span>
    </td>
  );
}

function Totalizador({ filas, fmt, mesActual }) {
  const n = mesActual.mes;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-stone-500">
            <th className="text-left font-semibold py-1.5 px-2 sticky left-0 bg-white" />
            {Array.from({ length: n }, (_, i) => (
              <th key={i} className="font-semibold py-1.5 px-1 text-center whitespace-nowrap">
                {MESES[i]}{i === n - 1 && !mesActual.completo ? <span className="normal-case font-normal"> 1–{mesActual.n_dias}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.key}>
              <td className={`py-1.5 px-2 whitespace-nowrap sticky left-0 bg-white ${f.total ? 'font-extrabold' : 'font-semibold'}`}>
                <span className="inline-flex items-center gap-2">
                  {f.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />}
                  {f.nombre}
                </span>
              </td>
              {f.vals.map((v, i) => (
                <Celda key={i} v={v} prev={i ? f.vals[i - 1] : null} fmt={fmt} total={f.total}
                       parcial={f.sinComparar !== false && i === n - 1 && !mesActual.completo} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MesAMesSection({ selId = null }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [modoT, setModoT]     = useState('d');
  const [modoC, setModoC]     = useState('p');
  const [totT, setTotT]       = useState('d');
  const [totC, setTotC]       = useState('f');

  useEffect(() => {
    api.get('/red/mes-a-mes')
      .then(r => setData(r.data.data))
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-72 bg-stone-200 rounded-2xl animate-pulse" />;
  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!data) return <p className="text-center py-16 text-stone-400">Todavía no hay ventas cargadas.</p>;

  const ma = data.mes_actual;
  const orden = ordenarTiendas(data.locales.map(l => l.nombre));
  const locales = [...data.locales]
    .sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre))
    .map(l => ({ ...l, color: colorDeTienda(l.nombre), corto: shortName(l.nombre) }));
  const sel = locales.find(l => l.local_id === selId) || null;
  const tiendas = sel && !sel.es_cafe ? [sel] : locales.filter(l => !l.es_cafe);
  const cafe = locales.find(l => l.es_cafe);
  const verTiendas = !sel || !sel.es_cafe;
  const verCafe = cafe && (!sel || sel.es_cafe);

  const nombreGrupo = sel && !sel.es_cafe ? sel.corto : 'Tiendas';
  const docOPesos = (k, fmtDocs) => (k === 'd' ? fmtDocs : fmtARS);

  // Filas del totalizador de tiendas
  const valorT = (l, i) => (totT === 'pd' ? (l.meses[i].d ? l.meses[i].f / l.meses[i].d : 0) : l.meses[i][totT]);
  const filasT = tiendas.map(l => ({ key: l.local_id, nombre: l.corto, color: l.color, vals: l.meses.map((_, i) => valorT(l, i)) }));
  if (tiendas.length > 1) {
    filasT.push({
      key: 'total', nombre: 'Total tiendas', total: true,
      vals: Array.from({ length: ma.mes }, (_, i) => {
        const f = tiendas.reduce((s, l) => s + l.meses[i].f, 0), d = tiendas.reduce((s, l) => s + l.meses[i].d, 0);
        return totT === 'pd' ? (d ? f / d : 0) : tiendas.reduce((s, l) => s + l.meses[i][totT], 0);
      }),
    });
  }
  // $ por docena es un precio: el mes a medias sí se puede comparar
  filasT.forEach(f => { f.sinComparar = totT !== 'pd'; });

  const valorC = (i) => {
    const m = cafe.meses[i];
    return totC === 'g' ? (m.p ? m.f / m.p : 0) : m[totC];
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 px-1">
        Del 1 de enero al {data.hasta.slice(8, 10).replace(/^0/, '')} de {MESES_L[ma.mes - 1].toLowerCase()} de {data.anio}.
        La línea punteada es la <strong>mediana</strong> de los meses completos: el mes típico. El total de cada mes sale en verde si quedó arriba y en rojo si quedó abajo.
      </p>

      {verTiendas && (
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {nombreGrupo} · {modoT === 'd' ? 'docenas' : 'facturación'} por mes
              </h3>
              {!ma.completo && <p className="text-xs text-stone-500">El último mes en claro es lo vendido hasta hoy; el borde punteado, la proyección.</p>}
            </div>
            <Segmento opciones={[['d', 'Docenas'], ['f', 'Facturación']]} valor={modoT} onChange={setModoT} />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-stone-500">
            {tiendas.map(l => <span key={l.local_id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.corto}</span>)}
          </div>
          <Barras series={tiendas} valor={(l, i) => l.meses[i][modoT]} mesActual={ma} titulo={`${nombreGrupo} por mes`}
                  formatoCorto={modoT === 'd' ? v => fmtNum(Math.round(v)) : millones}
                  formatoLargo={modoT === 'd' ? v => `${fmtDoc(v)} docenas` : fmtARS} />
        </div>
      )}

      {verCafe && (
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold" style={{ fontFamily: 'Nunito, sans-serif', color: COBRE_TXT }}>
                Café · {modoC === 'p' ? 'personas' : 'facturación'} por mes
              </h3>
              <p className="text-xs text-stone-500">Personas según los comensales que cargan los mozos en Fudo.</p>
            </div>
            <Segmento opciones={[['p', 'Personas'], ['f', 'Facturación']]} valor={modoC} onChange={setModoC} />
          </div>
          <Barras series={[cafe]} valor={(l, i) => l.meses[i][modoC]} mesActual={ma} titulo="Café por mes"
                  formatoCorto={modoC === 'p' ? v => fmtNum(Math.round(v)) : millones}
                  formatoLargo={modoC === 'p' ? v => `${fmtNum(v)} personas` : fmtARS} />
        </div>
      )}

      <div className="card p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Totalizador mensual</h3>
          <p className="text-xs text-stone-500">
            Cada casillero: el valor del mes y, debajo, cuánto cambió contra el mes anterior. Verde subió, rojo bajó; más fuerte el color, más grande el cambio.
          </p>
        </div>
        {verTiendas && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-sm text-stone-700">{nombreGrupo}</h4>
              <Segmento opciones={[['d', 'Docenas'], ['f', 'Facturación'], ['pd', '$ / docena']]} valor={totT} onChange={setTotT} />
            </div>
            <Totalizador filas={filasT} fmt={docOPesos(totT, fmtDoc)} mesActual={ma} />
          </div>
        )}
        {verCafe && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-sm" style={{ color: COBRE_TXT }}>Café</h4>
              <Segmento opciones={[['f', 'Facturación'], ['p', 'Personas'], ['g', 'Gasto por persona']]} valor={totC} onChange={setTotC} />
            </div>
            <Totalizador
              filas={[{ key: 'cafe', nombre: 'Café', color: COBRE, sinComparar: totC !== 'g', vals: cafe.meses.map((_, i) => valorC(i)) }]}
              fmt={totC === 'p' ? fmtNum : fmtARS} mesActual={ma} />
          </div>
        )}
      </div>
    </div>
  );
}
