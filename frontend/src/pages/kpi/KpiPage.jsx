import { useState, useEffect, useRef } from 'react';
import api from '../../api';

const MES_LARGO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const MES_CORTO = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

// Paleta categórica validada para daltonismo, con su versión para modo oscuro.
const COLORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

function mesActual() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}
function correrMes(mes, delta) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const nombreMes = m => MES_CORTO.format(new Date(`${m}-15T12:00:00`)).replace('.', '');

function formatear(v, formato) {
  if (v == null || isNaN(v)) return '—';
  switch (formato) {
    case 'millones':   return `$ ${(v / 1e6).toFixed(1)} M`;
    case 'moneda':     return `$ ${money.format(v)}`;
    case 'porcentaje': return `${v.toFixed(1)}%`;
    default:           return money.format(v);
  }
}
// En las tablas y ejes el signo $ estorba: ya está en el encabezado.
function formatearCorto(v, formato) {
  if (v == null || isNaN(v)) return '—';
  if (formato === 'millones') return (v / 1e6).toFixed(1);
  return formatear(v, formato).replace('$ ', '');
}

function delta(serie, mejorSube) {
  const vals = serie.filter(v => v != null);
  if (vals.length < 2) return null;
  const b = serie[serie.length - 1], a = serie[serie.length - 2];
  if (a == null || b == null || a === 0) return null;
  const pct = ((b - a) / Math.abs(a)) * 100;
  const plano = Math.abs(pct) < 0.5;
  const bueno = mejorSube ? pct > 0 : pct < 0;
  return {
    pct,
    cls: plano ? 'text-ahg-text/40' : bueno ? 'text-green-600' : 'text-red-600',
    txt: `${plano ? '→' : pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`,
  };
}

function Sparkline({ serie }) {
  const vals = serie.map(v => (v == null ? null : v));
  const reales = vals.filter(v => v != null);
  if (reales.length < 2) return <div className="h-[30px]" />;

  const w = 190, h = 30, p = 3;
  const min = Math.min(...reales), max = Math.max(...reales), rango = (max - min) || 1;
  const puntos = vals.map((v, i) => v == null ? null
    : [p + i * (w - 2 * p) / (vals.length - 1), h - p - ((v - min) / rango) * (h - 2 * p)]);
  const d = puntos.filter(Boolean)
    .map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  const fin = puntos.filter(Boolean).pop();

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[30px] mt-2" aria-hidden="true">
      <path d={d} fill="none" stroke="#7C3AED" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={fin[0].toFixed(1)} cy={fin[1].toFixed(1)} r="3" fill="#4C1D95" />
    </svg>
  );
}

function Grafico({ meses, series, nombre, formato, locales, localActivo, objetivo }) {
  const [tip, setTip] = useState(null);
  const ref = useRef(null);

  const W = 640, H = 260, ML = 56, MR = 108, MT = 16, MB = 32;

  const visibles = localActivo === 0
    ? locales.map((l, i) => ({ n: l.nombre.split(' ')[0], color: COLORES[i % 5], v: series.porLocal[l.id] }))
    : (() => {
        const i = locales.findIndex(l => l.id === localActivo);
        return [{ n: locales[i].nombre.split(' ')[0], color: COLORES[i % 5], v: series.porLocal[localActivo] }];
      })();

  const todos = visibles.flatMap(s => s.v).filter(v => v != null);
  if (!todos.length) {
    return (
      <p className="text-sm text-ahg-text/40 py-12 text-center">
        Todavía no hay datos para este indicador.
      </p>
    );
  }

  const max = Math.max(...todos, objetivo || 0);
  const min = Math.min(...todos);
  const lo = Math.max(0, min - (max - min) * 0.25);
  const hi = max + (max - min) * 0.15 || max * 1.1;
  const x = i => ML + i * (W - ML - MR) / Math.max(1, meses.length - 1);
  const y = v => MT + (1 - (v - lo) / ((hi - lo) || 1)) * (H - MT - MB);

  // Los nombres van pegados al final de cada línea, pero se pisan cuando dos
  // locales terminan cerca. Se separan y sale una guía hasta el punto real.
  const SEP = 14;
  const etiquetas = visibles
    .map(s => {
      const ultimo = [...s.v].reverse().find(v => v != null);
      return ultimo == null ? null : { s, real: y(ultimo), pos: y(ultimo) };
    })
    .filter(Boolean)
    .sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < etiquetas.length; i++) {
    const falta = (etiquetas[i - 1].pos + SEP) - etiquetas[i].pos;
    if (falta > 0) etiquetas[i].pos += falta;
  }
  const desborde = etiquetas.length ? etiquetas[etiquetas.length - 1].pos - (H - MB) : 0;
  if (desborde > 0) etiquetas.forEach(e => { e.pos -= desborde; });

  function mostrarTip(i, ev) {
    const caja = ref.current.getBoundingClientRect();
    setTip({
      i,
      left: Math.min(Math.max((x(i) / W) * caja.width - 70, 4), caja.width - 170),
    });
  }

  return (
    <div className="relative" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block min-w-[420px]"
           style={{ overflow: 'visible' }} role="img" aria-label={`${nombre} por mes`}>
        {[0, 1, 2, 3, 4].map(t => {
          const val = lo + (hi - lo) * t / 4;
          return (
            <g key={t}>
              <line x1={ML} x2={W - MR} y1={y(val)} y2={y(val)} className="stroke-ahg-accent/30" strokeWidth="1" />
              <text x={ML - 9} y={y(val) + 4} textAnchor="end" fontSize="10.5"
                    className="fill-ahg-text/40" fontFamily="Inter, sans-serif">
                {formatearCorto(val, formato)}
              </text>
            </g>
          );
        })}

        {objetivo != null && objetivo >= lo && objetivo <= hi && (
          <>
            <line x1={ML} x2={W - MR} y1={y(objetivo)} y2={y(objetivo)}
                  stroke="#7C3AED" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.6" />
            <text x={W - MR - 4} y={y(objetivo) - 5} textAnchor="end" fontSize="10"
                  fill="#7C3AED" fontWeight="600" fontFamily="Inter, sans-serif">
              objetivo {objetivo}%
            </text>
          </>
        )}

        {meses.map((m, i) => (
          <text key={m} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11"
                className="fill-ahg-text/40" fontFamily="Inter, sans-serif">
            {nombreMes(m)}
          </text>
        ))}

        {visibles.map((s, k) => {
          const pts = s.v.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
          if (!pts.length) return null;
          const d = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
          return (
            <g key={k}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((q, i) => (
                <circle key={i} cx={q[0].toFixed(1)} cy={q[1].toFixed(1)} r="4"
                        fill={s.color} className="stroke-white dark:stroke-transparent" strokeWidth="2" />
              ))}
            </g>
          );
        })}

        {etiquetas.map((e, k) => (
          <g key={k}>
            {Math.abs(e.pos - e.real) > 2 && (
              <path d={`M ${W - MR + 2} ${e.real.toFixed(1)} L ${W - MR + 7} ${e.pos.toFixed(1)}`}
                    stroke={e.s.color} strokeWidth="1" fill="none" opacity="0.5" />
            )}
            <text x={W - MR + 10} y={e.pos + 4} fontSize="11.5" fontWeight="600"
                  fill={e.s.color} fontFamily="Inter, sans-serif">{e.s.n}</text>
          </g>
        ))}

        {meses.map((m, i) => {
          const ancho = (W - ML - MR) / Math.max(1, meses.length - 1);
          return (
            <rect key={m} x={x(i) - ancho / 2} y={MT} width={ancho} height={H - MT - MB}
                  fill="transparent" style={{ cursor: 'crosshair' }}
                  onMouseEnter={ev => mostrarTip(i, ev)} onMouseLeave={() => setTip(null)} />
          );
        })}
      </svg>

      {tip && (
        <div className="absolute top-1 pointer-events-none bg-ahg-text text-white text-xs
                        rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-lg"
             style={{ left: tip.left }}>
          <p className="font-semibold mb-0.5">{MES_LARGO.format(new Date(`${meses[tip.i]}-15T12:00:00`))}</p>
          {visibles.map((s, k) => (
            <p key={k}>
              <span style={{ color: s.color }}>■</span> {s.n}:{' '}
              <span className="font-semibold">{formatear(s.v[tip.i], formato)}</span>
            </p>
          ))}
        </div>
      )}

      {visibles.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-ahg-text/60">
          {visibles.map((s, k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className="w-3.5 h-[3px] rounded-sm inline-block" style={{ background: s.color }} />
              {s.n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KpiPage() {
  const [hasta, setHasta] = useState(mesActual());
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [kpiActivo, setKpiActivo] = useState(null);
  const [localActivo, setLocalActivo] = useState(0);
  const [editObj, setEditObj] = useState(null);
  const [obj, setObj] = useState('');

  function cargar() {
    setCargando(true);
    api.get('/kpi', { params: { hasta, meses: 6 } })
      .then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron calcular los indicadores'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [hasta]);

  async function guardarObjetivo(local_id) {
    if (!(Number(obj) > 0)) { setError('El objetivo tiene que ser mayor a cero'); return; }
    try {
      await api.post('/kpi/objetivo', { local_id, objetivo: Number(obj) });
      setEditObj(null); setObj(''); setError('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el objetivo');
    }
  }

  if (cargando) return <p className="text-sm text-ahg-text/50 py-8">Calculando…</p>;
  if (!d) return <div className="card p-5 text-sm text-red-700 bg-red-50 border-red-300">{error}</div>;

  const { meses, locales, series } = d;
  const lista = Object.values(series);
  const activo = kpiActivo ? series[kpiActivo] : null;

  // El objetivo solo aplica al indicador que lo tiene, y depende del local elegido.
  const objetivoActivo = activo?.conObjetivo
    ? (localActivo === 0
        ? Math.round(locales.reduce((s, l) => s + l.objetivo, 0) / Math.max(1, locales.length))
        : locales.find(l => l.id === localActivo)?.objetivo)
    : null;

  function serieDe(s) {
    return localActivo === 0 ? s.red : s.porLocal[localActivo];
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          Alfalca · Indicadores
        </p>
        <h1 className="text-xl font-bold text-white capitalize mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {MES_LARGO.format(new Date(`${hasta}-15T12:00:00`))}
        </h1>
      </div>

      {/* Alcance y período: siempre en el mismo lugar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex bg-ahg-bg border border-ahg-accent/40 rounded-lg p-0.5 gap-0.5 flex-wrap">
          {[{ id: 0, nombre: 'Toda la red' }, ...locales].map(l => (
            <button key={l.id} onClick={() => setLocalActivo(l.id)}
                    aria-pressed={localActivo === l.id}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      localActivo === l.id ? 'bg-ahg-primary text-white' : 'text-ahg-text/60 hover:text-ahg-text'}`}>
              {l.nombre.split(' ')[0]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setHasta(correrMes(hasta, -1))} className="btn-secondary !px-3 !py-1.5 text-sm">◀</button>
          <input type="month" className="input w-auto !py-1.5 text-sm" value={hasta}
                 onChange={e => e.target.value && setHasta(e.target.value)} />
          {hasta < mesActual() && (
            <button onClick={() => setHasta(correrMes(hasta, 1))} className="btn-secondary !px-3 !py-1.5 text-sm">▶</button>
          )}
        </div>
      </div>

      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Resumen: una tarjeta por indicador */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {lista.map(s => {
          const serie = serieDe(s);
          const ultimo = serie[serie.length - 1];
          const dl = delta(serie, s.mejorSube);
          const sinDatos = serie.every(v => v == null);
          const elegido = kpiActivo === s.id;
          return (
            <button key={s.id} onClick={() => setKpiActivo(elegido ? null : s.id)}
                    className={`card p-4 text-left transition-all ${
                      elegido ? 'border-ahg-primary ring-1 ring-ahg-primary' : 'hover:border-ahg-primary'}
                      ${sinDatos ? 'opacity-60' : ''}`}>
              <p className="text-xs font-semibold text-ahg-text/60 leading-tight">{s.nombre}</p>
              <p className="text-2xl font-bold tabular-nums mt-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {formatear(ultimo, s.formato)}
              </p>
              {dl ? (
                <p className={`text-xs font-semibold ${dl.cls}`}>{dl.txt} vs mes anterior</p>
              ) : (
                <p className="text-xs text-ahg-text/40">
                  {sinDatos ? 'Sin datos todavía' : 'Sin mes anterior para comparar'}
                </p>
              )}
              <Sparkline serie={serie} />
            </button>
          );
        })}
      </div>

      {d.horas_sin_valor[d.horas_sin_valor.length - 1] > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-sm text-amber-800">
          Hay <strong>{d.horas_sin_valor[d.horas_sin_valor.length - 1].toFixed(1)} horas</strong> del mes
          de puestos sin valor hora cargado. Los indicadores de personal están subestimados.
        </div>
      )}

      {/* Detalle del indicador elegido */}
      {activo ? (
        <div className="card p-5">
          <div className="flex justify-between items-baseline gap-3 flex-wrap mb-4">
            <div>
              <h2 className="font-bold text-lg" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {activo.nombre}
              </h2>
              <p className="text-xs text-ahg-text/50">
                {meses.length} meses · {localActivo === 0 ? 'una línea por local' : locales.find(l => l.id === localActivo)?.nombre}
              </p>
            </div>
            <button onClick={() => setKpiActivo(null)} className="text-sm text-ahg-primary font-medium hover:underline">
              Cerrar
            </button>
          </div>

          <Grafico
            meses={meses} series={activo} nombre={activo.nombre} formato={activo.formato}
            locales={locales} localActivo={localActivo} objetivo={objetivoActivo}
          />

          <div className="overflow-x-auto mt-5 border border-ahg-accent/40 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ahg-bg border-b border-ahg-accent/30">
                  <th className="table-th">Local</th>
                  {meses.map(m => <th key={m} className="table-th text-right capitalize">{nombreMes(m)}</th>)}
                  <th className="table-th text-right">vs anterior</th>
                  {activo.conObjetivo && <th className="table-th text-right">Objetivo</th>}
                </tr>
              </thead>
              <tbody>
                {locales.map((l, i) => {
                  const serie = activo.porLocal[l.id];
                  const dl = delta(serie, activo.mejorSube);
                  const atenuado = localActivo !== 0 && localActivo !== l.id;
                  return (
                    <tr key={l.id} className={`border-b border-ahg-accent/20 ${atenuado ? 'opacity-40' : ''}`}>
                      <td className="table-td font-medium whitespace-nowrap">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2"
                              style={{ background: COLORES[i % 5] }} />
                        {l.nombre.split(' ').slice(0, 2).join(' ')}
                      </td>
                      {serie.map((v, k) => (
                        <td key={k} className="table-td text-right tabular-nums">
                          {formatearCorto(v, activo.formato)}
                        </td>
                      ))}
                      <td className={`table-td text-right tabular-nums font-semibold ${dl?.cls || ''}`}>
                        {dl ? dl.txt : '—'}
                      </td>
                      {activo.conObjetivo && (
                        <td className="table-td text-right">
                          {editObj === l.id ? (
                            <span className="flex items-center gap-1 justify-end">
                              <input className="input w-16 text-right tabular-nums !py-1" autoFocus value={obj}
                                     onChange={e => setObj(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
                                     onKeyDown={e => e.key === 'Enter' && guardarObjetivo(l.id)} />
                              <button onClick={() => guardarObjetivo(l.id)}
                                      className="text-xs font-medium text-ahg-primary hover:underline">ok</button>
                            </span>
                          ) : (
                            <button onClick={() => { setEditObj(l.id); setObj(String(l.objetivo)); }}
                                    className="tabular-nums text-ahg-text/50 hover:text-ahg-primary hover:underline">
                              {l.objetivo}%
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="bg-ahg-bg">
                  <td className="table-td font-bold">Toda la red</td>
                  {activo.red.map((v, k) => (
                    <td key={k} className="table-td text-right tabular-nums font-semibold">
                      {formatearCorto(v, activo.formato)}
                    </td>
                  ))}
                  <td className={`table-td text-right tabular-nums font-bold ${delta(activo.red, activo.mejorSube)?.cls || ''}`}>
                    {delta(activo.red, activo.mejorSube)?.txt || '—'}
                  </td>
                  {activo.conObjetivo && <td className="table-td" />}
                </tr>
              </tbody>
            </table>
          </div>
          {activo.conObjetivo && (
            <p className="text-xs text-ahg-text/40 mt-3">
              Tocá el objetivo de un local para cambiarlo.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ahg-text/40 text-center py-6">
          Tocá un indicador para ver su detalle mes a mes y local por local.
        </p>
      )}
    </div>
  );
}
