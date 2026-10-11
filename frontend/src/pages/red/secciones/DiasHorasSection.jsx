import { useEffect, useState } from 'react';
import api from '../../../api';
import { fmtARS, fmtNum, colorDeTienda, shortName, ordenarTiendas } from '../redUtils';

// "Días y horas", del 1/1 a hoy: qué día vende cada local (y qué parte de la semana
// hace ese día), las últimas 12 semanas contra la semana típica (mediana), y cuánto
// de la venta del día entra en cada hora.

const COBRE = '#8a5a3c';
const VERDE = '#1f7a4d', ROJO = '#b23a2e';
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MIN_DIAS = 10; // con menos días abiertos, el promedio no dice nada
const pct1 = v => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const millones = v => `${(v / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
const diaMes = iso => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

function mediana(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function paso(max) {
  const bruto = max / 4, pot = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 5, 10].map(k => k * pot).find(x => x >= bruto) || pot;
}

function Semanas({ valores, fechas, color, fmt, fmtEje, titulo }) {
  const ult = valores.slice(-12), keys = fechas.slice(-12);
  const ref = mediana(valores);
  const W = 860, H = 230, L = 56, R = 76, TOP = 26, B = 36, n = ult.length;
  const slot = (W - L - R) / Math.max(n, 1), bw = slot * 0.62;
  const max = Math.max(...ult, ref, 1) * 1.15;
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
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b6e72">{fmtEje(v)}</text>
          </g>
        ))}
        {ult.map((v, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          return (
            <g key={keys[i]}>
              <rect x={x} y={y(v)} width={bw} height={y(0) - y(v)} rx="4" fill={color} opacity={i === n - 1 ? 1 : 0.7}>
                <title>{`Semana del ${diaMes(keys[i])}: ${fmt(v)}`}</title>
              </rect>
              <text x={x + bw / 2} y={y(v) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={v >= ref ? VERDE : ROJO}>{fmt(v)}</text>
              <text x={x + bw / 2} y={H - B + 16} textAnchor="middle" fontSize="11" fill="#1f2022">{diaMes(keys[i])}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(ref)} y2={y(ref)} stroke="#1f2022" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={W - R + 6} y={y(ref) - 3} fontSize="10.5" fontWeight="700" fill="#1f2022">mediana</text>
        <text x={W - R + 6} y={y(ref) + 10} fontSize="10.5" fill="#1f2022">{fmt(ref)}</text>
      </svg>
    </div>
  );
}

function HoraPorHora({ local }) {
  const H = local.horas;
  const total = Object.values(H).reduce((a, b) => a + b, 0);
  if (!total) return null;
  // Se muestra de 9 a 21; lo poco que entra antes o después va a la primera y a la última hora
  const horas = Array.from({ length: 13 }, (_, i) => 9 + i);
  const p = horas.map(h => {
    let v = H[h] || 0;
    if (h === 9) Object.keys(H).forEach(k => { if (+k < 9) v += H[k]; });
    if (h === 21) Object.keys(H).forEach(k => { if (+k > 21) v += H[k]; });
    return v / total * 100;
  });
  const max = Math.max(...p);
  const min = Math.min(...p.slice(0, -1)); // sin contar el cierre
  const iMax = p.indexOf(max), iMin = p.indexOf(min);
  return (
    <div className="border border-stone-100 rounded-xl p-3.5 space-y-2">
      <h4 className="font-bold flex items-center gap-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorDeTienda(local.nombre) }} />{shortName(local.nombre)}
      </h4>
      <div className="grid grid-flow-col auto-cols-fr gap-[3px] items-end h-32">
        {p.map((v, i) => (
          <div key={horas[i]} className="flex flex-col justify-end h-full gap-0.5" title={`De ${horas[i]} a ${horas[i] + 1} h: ${pct1(v)} %`}>
            <span className="text-[11px] font-semibold text-center tabular-nums" style={{ color: i === iMax ? VERDE : i === iMin ? ROJO : '#1f2022' }}>{Math.round(v)}</span>
            <i className="block rounded-t" style={{ height: `${Math.max(v / max * 100, 2)}%`, background: i === iMax ? VERDE : i === iMin ? ROJO : '#b9b8b3' }} />
          </div>
        ))}
      </div>
      <div className="grid grid-flow-col auto-cols-fr gap-[3px] text-[10px] text-stone-500 text-center">
        {horas.map(h => <span key={h}>{h}</span>)}
      </div>
      <p className="text-xs text-stone-500">
        La hora más fuerte es de {horas[iMax]} a {horas[iMax] + 1} h ({pct1(max)} %). La más floja, sin contar el cierre, de {horas[iMin]} a {horas[iMin] + 1} h ({pct1(min)} %).
      </p>
    </div>
  );
}

export default function DiasHorasSection({ selId = null }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.get('/red/dias-horas')
      .then(r => setData(r.data.data))
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-72 bg-stone-200 rounded-2xl animate-pulse" />;
  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!data) return <p className="text-center py-16 text-stone-400">Todavía no hay ventas cargadas.</p>;

  const orden = ordenarTiendas(data.locales.map(l => l.nombre));
  const todos = [...data.locales].sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre));
  const sel = todos.find(l => l.local_id === selId) || null;
  const lista = sel ? [sel] : todos;
  const tiendas = sel && !sel.es_cafe ? [sel] : todos.filter(l => !l.es_cafe);
  const cafe = todos.find(l => l.es_cafe);
  const docSem = data.semanas.map((_, i) => tiendas.reduce((s, l) => s + l.semanas[i].d, 0));
  const [, mh, dh] = data.hasta.split('-').map(Number);

  return (
    <div className="space-y-4">
      <p className="px-1">
        <b className="text-[15px]" style={{ fontFamily: 'Nunito, sans-serif' }}>Del 1 de enero al {dh} de {MESES[mh - 1]}</b>
      </p>

      <div className="card p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Qué día vende cada local</h3>
          <p className="text-xs text-stone-500">Facturación de un día promedio y, debajo, qué parte de la venta de la semana hace ese día (cada fila suma 100 %).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-stone-500">
                <th className="text-left font-semibold py-1.5 px-2">Local</th>
                {DIAS.map(d => <th key={d} className="font-semibold py-1.5 px-1 text-center">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {lista.map(l => {
                const validos = l.dias.map(x => (x && x.dias >= MIN_DIAS ? x.prom : 0));
                const semana = validos.reduce((a, b) => a + b, 0);
                const max = Math.max(...validos);
                const base = l.es_cafe ? '138,90,60' : '69,72,76';
                return (
                  <tr key={l.local_id}>
                    <td className="py-1.5 px-2 font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: colorDeTienda(l.nombre) }} />{shortName(l.nombre)}</span>
                    </td>
                    {l.dias.map((x, i) => {
                      if (!x) return <td key={i} className="text-center text-xs text-stone-400 px-1">cerrado</td>;
                      if (x.dias < MIN_DIAS) return <td key={i} className="text-center text-xs text-stone-400 px-1">abrió {x.dias} {x.dias === 1 ? 'vez' : 'veces'}</td>;
                      return (
                        <td key={i} className="text-center px-1.5 py-1.5 min-w-[84px] tabular-nums" style={{ background: `rgba(${base},${(0.05 + x.prom / max * 0.4).toFixed(2)})`, border: '2px solid #fff', borderRadius: 8 }}>
                          {fmtARS(x.prom)}
                          <span className="block text-[11px] font-bold">{Math.round(x.prom / semana * 100)} %</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(!sel || !sel.es_cafe) && data.semanas.length > 0 && (
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>{sel ? shortName(sel.nombre) : 'Tiendas'} · docenas de las últimas 12 semanas</h3>
          <p className="text-xs text-stone-500">Cada barra es una semana de lunes a domingo; abajo, la fecha del lunes. La línea punteada es la mediana de las semanas del año (la semana típica): en verde las semanas arriba, en rojo las de abajo.</p>
          <Semanas valores={docSem} fechas={data.semanas} color="#45484c" titulo="Docenas por semana"
                   fmt={v => fmtNum(Math.round(v))} fmtEje={v => fmtNum(Math.round(v))} />
        </div>
      )}
      {cafe && (!sel || sel.es_cafe) && data.semanas.length > 0 && (
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold" style={{ fontFamily: 'Nunito, sans-serif', color: COBRE }}>Café · facturación de las últimas 12 semanas</h3>
          <p className="text-xs text-stone-500">Mismo criterio: semanas de lunes a domingo contra la mediana del año.</p>
          <Semanas valores={cafe.semanas.map(s => s.f)} fechas={data.semanas} color={COBRE} titulo="Facturación del Café por semana"
                   fmt={millones} fmtEje={millones} />
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Hora por hora</h3>
          <p className="text-xs text-stone-500">De cada $ 100 que vende el local en el día, cuántos entran en cada hora. Cada local suma 100. En verde la hora más fuerte, en rojo la más floja. La hora 21 incluye lo que se vende después.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {lista.map(l => <HoraPorHora key={l.local_id} local={l} />)}
        </div>
      </div>
    </div>
  );
}
