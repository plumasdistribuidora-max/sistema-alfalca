import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import {
  fmtNum, fmtDoc, fmtPct, fmtARS,
  colorDeTienda, shortName, ordenarTiendas, yearRange,
  rangosRapidos, fmtRango,
} from '../redUtils';

// ── Constantes y helpers ────────────────────────────────────────────────────

const MESES_ES   = {'01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic'};
const MESES_FULL = {'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};

function fmtMesLabel(yyyymm)     { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_ES[m] || yyyymm; }
function fmtMesLabelFull(yyyymm) { if (!yyyymm) return ''; const [y, m] = yyyymm.split('-'); return `${MESES_FULL[m] || yyyymm} ${y}`; }

// El fondo de la tarjeta: los apilados llevan un hilo de este color entre
// segmentos para que dos tiendas contiguas nunca se toquen.
const SURFACE = '#ffffff';

// ── Componentes UI ──────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`bg-stone-200 rounded-xl animate-pulse ${className}`} />;
}

function KpiCard({ label, value, sub, primary }) {
  if (primary) {
    return (
      <div className="rounded-2xl p-5 text-white" style={{ background: '#4C1D95' }}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
        <p className="text-3xl font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
        {sub && <p className="text-sm opacity-60 mt-1">{sub}</p>}
      </div>
    );
  }
  return (
    <div className="card p-5 border border-stone-100">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

function VarBadge({ v }) {
  if (v === null || v === undefined) return <span className="text-stone-300 text-xs">—</span>;
  const pos = Number(v) >= 0;
  return (
    <span className={`text-sm font-semibold ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
      {pos ? '▲' : '▼'} {Math.abs(Number(v))}%
    </span>
  );
}

// Variación de tabla. El absoluto contra el que compara va en el title, para
// que la celda quede legible pero el dato duro esté a un hover.
function VarCell({ v, referencia }) {
  if (v === null || v === undefined)
    return <span className="text-stone-300" title={referencia}>—</span>;
  const pos = Number(v) >= 0;
  return (
    <span className={`font-semibold ${pos ? 'text-emerald-600' : 'text-red-500'}`} title={referencia}>
      {pos ? '▲' : '▼'}{Math.abs(Number(v))}%
    </span>
  );
}

function Medalla({ m }) {
  if (m === 1) return <span className="text-lg">🥇</span>;
  if (m === 2) return <span className="text-lg">🥈</span>;
  if (m === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm text-stone-400 w-6 text-center inline-block">{m}</span>;
}

// Tooltip común a los dos apilados: total del mes arriba y el desglose debajo.
function StackTooltip({ active, payload, titulo, formato, unidad }) {
  if (!active || !payload?.length) return null;
  const mesRaw = payload[0]?.payload?.mes_raw;
  const total  = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px', minWidth: 210, boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}>
      <p style={{ fontWeight: 600, marginBottom: 8, color: '#1c1917', fontSize: 13 }}>{fmtMesLabelFull(mesRaw)}</p>
      <div style={{ background: '#EEEDFE', borderRadius: 6, padding: '5px 10px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: '#26215C', fontWeight: 700, fontSize: 13 }}>{titulo}</span>
        <span style={{ color: '#26215C', fontWeight: 700, fontSize: 13 }}>{formato(total)}{unidad}</span>
      </div>
      {[...payload].reverse().map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color || p.fill, flexShrink: 0 }} />
          <span style={{ flex: 1, color: '#44403c', fontSize: 12 }}>{p.dataKey}</span>
          <span style={{ color: '#1c1917', fontWeight: 500, fontSize: 12 }}>{formato(p.value)}{unidad}</span>
        </div>
      ))}
    </div>
  );
}

// El total del mes va en el eje X, debajo del nombre. LabelList dentro de Bar
// no llega a renderizar en esta versión de recharts, y el total por mes es
// demasiado útil como para dejarlo solamente en el tooltip.
//
// Va como componente de módulo y se pasa como elemento, no como función
// generada en el render: si el tipo del tick cambia en cada pasada, recharts
// remonta el eje y reinicia la animación de las barras una y otra vez — quedan
// planas y no se ven.
function TickMesConTotal({ x, y, payload, totales, formato }) {
  const total = totales?.[payload.value];
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" dy={12} style={{ fontSize: 11, fill: '#57534e' }}>{payload.value}</text>
      {total > 0 && (
        <text textAnchor="middle" dy={26} style={{ fontSize: 10, fontWeight: 600, fill: '#a8a29e' }}>
          {formato(total)}
        </text>
      )}
    </g>
  );
}

function totalesPorMes(data, series) {
  return Object.fromEntries(
    data.map(row => [row.mes, series.reduce((s, k) => s + (Number(row[k]) || 0), 0)])
  );
}

// ── Filtro de período del comparativo ───────────────────────────────────────

function FiltroPeriodo({ desde, hasta, onChange }) {
  const rapidos = useMemo(() => rangosRapidos(), []);
  const activo  = rapidos.find(r => r.desde === desde && r.hasta === hasta)?.id;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-stone-200 overflow-hidden text-xs">
        {rapidos.map(r => (
          <button
            key={r.id}
            onClick={() => onChange(r.desde, r.hasta)}
            className={`px-3 py-1.5 transition-colors ${
              activo === r.id
                ? 'bg-violet-600 text-white font-semibold'
                : 'bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" value={desde} max={hasta}
               onChange={e => onChange(e.target.value, hasta)}
               className="input text-xs w-36 py-1.5" />
        <span className="text-stone-400 text-xs">→</span>
        <input type="date" value={hasta} min={desde}
               onChange={e => onChange(desde, e.target.value)}
               className="input text-xs w-36 py-1.5" />
      </div>
    </div>
  );
}

// Las filas de métrica de cada tarjeta, según tipo de tienda
function filasDe(t) {
  const base = [{ key: 'facturacion', label: 'Facturación', fmt: fmtARS, m: t.facturacion }];
  if (t.es_alfajorera) {
    return [...base,
      { key: 'tickets',     label: 'Tickets',     fmt: fmtNum, m: t.tickets     },
      { key: 'prom_ticket', label: 'Ticket prom', fmt: fmtARS, m: t.prom_ticket },
      { key: 'docenas',     label: 'Docenas',     fmt: fmtDoc, m: t.docenas     },
    ];
  }
  return [...base,
    { key: 'personas',    label: 'Personas',    fmt: fmtNum, m: t.personas    },
    { key: 'prom_ticket', label: 'Ticket prom', fmt: fmtARS, m: t.prom_ticket },
  ];
}

// ── Componente principal ────────────────────────────────────────────────────

export default function ResumenSection() {
  const [data,        setData]        = useState(null);
  const [docenas,     setDocenas]     = useState(null);
  const [loading,     setLoading]     = useState(true);

  const [comp,        setComp]        = useState(null);
  const [compLoading, setCompLoading] = useState(true);
  const [compError,   setCompError]   = useState(null);
  const [periodo,     setPeriodo]     = useState(() => rangosRapidos()[0]);

  const [modalVentas, setModalVentas] = useState(null);
  const [modalDoc,    setModalDoc]    = useState(null);
  const [modalLocal,  setModalLocal]  = useState(null);
  const [detalle,     setDetalle]     = useState(null);
  const [loadDetalle, setLoadDetalle] = useState(false);
  const [sinDocColl,  setSinDocColl]  = useState(true);

  useEffect(() => {
    const { desde, hasta } = yearRange();
    setLoading(true);
    Promise.all([
      api.get('/red/resumen',           { params: { desde, hasta } }),
      api.get('/red/docenas-mensuales', { params: { desde, hasta } }),
    ]).then(([rRes, dRes]) => {
      setData(rRes.data.data);
      setDocenas(dRes.data.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!periodo?.desde || !periodo?.hasta) return;
    setCompLoading(true);
    setCompError(null);
    api.get('/red/comparativo', { params: { desde: periodo.desde, hasta: periodo.hasta } })
      .then(r => setComp(r.data.data))
      .catch(err => setCompError(err?.response?.data?.error || err.message))
      .finally(() => setCompLoading(false));
  }, [periodo.desde, periodo.hasta]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      setModalDoc(null);
      setModalVentas(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!modalDoc || !modalLocal) return;
    setLoadDetalle(true);
    setDetalle(null);
    setSinDocColl(true);
    api.get('/red/docenas-detalle', { params: { local_id: modalLocal.local_id, mes: modalDoc.mes } })
      .then(r => setDetalle(r.data.data))
      .catch(console.error)
      .finally(() => setLoadDetalle(false));
  }, [modalDoc, modalLocal]);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    </div>
  );

  if (!data) return <p className="text-center py-16 text-stone-400">Sin datos.</p>;

  // ── Ventas mensuales por tienda (apilado, en millones) ────────────────────
  const nombresVentas = ordenarTiendas(
    data.evolucion_mensual?.length
      ? [...new Set(data.evolucion_mensual.flatMap(r => Object.keys(r.por_tienda)))]
      : []
  );
  const clavesVentas  = nombresVentas.map(shortName);
  const ventasBarData = (data.evolucion_mensual || []).map(row => ({
    mes: fmtMesLabel(row.mes),
    mes_raw: row.mes,
    ...Object.fromEntries(Object.entries(row.por_tienda).map(([k, v]) => [shortName(k), v])),
  }));

  // ── Participación: mismo orden fijo que los apilados ──────────────────────
  const participacion = ordenarTiendas(
    (data.participacion || []).filter(p => Number(p.facturacion) > 0).map(p => p.tienda)
  ).map(nombre => (data.participacion || []).find(p => p.tienda === nombre));

  // ── Docenas mensuales ─────────────────────────────────────────────────────
  const { meses: mesesDoc = [], series: seriesDocRaw = [] } = docenas || {};
  const seriesDoc = ordenarTiendas(seriesDocRaw.map(s => s.tienda))
    .map(nombre => seriesDocRaw.find(s => s.tienda === nombre));
  const clavesDoc = seriesDoc.map(s => shortName(s.tienda));
  const docBarData = mesesDoc.map(mes => {
    const row = { mes: fmtMesLabel(mes), mes_raw: mes };
    seriesDoc.forEach(s => { row[shortName(s.tienda)] = s.por_mes[mes] || 0; });
    return row;
  });

  // Sin useMemo: acá ya pasamos los early returns, y un hook después de un
  // return condicional rompe el orden de hooks. Lo que reiniciaba la animación
  // era el tipo del tick, no la identidad de este objeto.
  const totalesVentas = totalesPorMes(ventasBarData, clavesVentas);
  const totalesDoc    = totalesPorMes(docBarData, clavesDoc);

  // El detalle del mes sale de evolucion_mensual, que ya trae el monto exacto
  // por tienda: no hace falta ir de nuevo al backend.
  function handleVentasClick(payload) {
    const mesRaw = payload?.activePayload?.[0]?.payload?.mes_raw;
    if (!mesRaw) return;
    const fila = (data.evolucion_mensual || []).find(r => r.mes === mesRaw);
    if (!fila) return;
    const total = Object.values(fila.por_tienda).reduce((a, b) => a + Number(b || 0), 0);
    const docsMes = Object.fromEntries(
      seriesDoc.map(sd => [sd.tienda, sd.por_mes?.[mesRaw] || 0])
    );
    setModalVentas({
      mes: mesRaw,
      mesLabel: fmtMesLabelFull(mesRaw),
      total,
      filas: ordenarTiendas(Object.keys(fila.por_tienda)).map(nombre => ({
        nombre,
        facturacion: Number(fila.por_tienda[nombre] || 0),
        porcentaje:  total > 0 ? Math.round(Number(fila.por_tienda[nombre] || 0) / total * 1000) / 10 : 0,
        docenas:     docsMes[nombre] ?? null,
      })),
    });
  }

  function handleBarClick(payload) {
    if (!payload?.activePayload?.length) return;
    const mesRaw = payload.activePayload[0]?.payload?.mes_raw;
    if (!mesRaw) return;
    setModalDoc({ mes: mesRaw, mesLabel: fmtMesLabelFull(mesRaw) });
    if (seriesDoc[0]) setModalLocal({ local_id: seriesDoc[0].local_id, nombre: seriesDoc[0].tienda });
  }

  async function downloadCsv() {
    if (!modalDoc || !modalLocal) return;
    try {
      const r = await api.get('/red/docenas-detalle/export', {
        params: { local_id: modalLocal.local_id, mes: modalDoc.mes },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(r.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `docenas_${modalLocal.nombre.replace(/\s+/g, '_')}_${modalDoc.mes}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }

  const mesesConDato = comp?.tiendas?.[0]?.meses_promedio ?? 0;
  const COLS = [
    { key: 'mes_ant',   varKey: 'var_mes_ant',   head: 'vs mes ant.',  sub: comp && fmtRango(comp.mes_ant.desde, comp.mes_ant.hasta) },
    { key: 'prom_anio', varKey: 'var_prom_anio', head: 'vs prom. año', sub: comp && `promedio de ${mesesConDato} meses de ${comp.prom_anio.anio}` },
    { key: 'anio_ant',  varKey: 'var_anio_ant',  head: 'vs año pas.',  sub: comp && fmtRango(comp.anio_ant.desde, comp.anio_ant.hasta) },
  ];

  return (
    <div className="space-y-5">

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          primary
          label="Facturación total red"
          value={fmtARS(data.facturacion_total)}
          sub={`${data.num_unidades} unidades`}
        />
        <KpiCard
          label="Período analizado"
          value={data.num_meses ? `${data.num_meses} ${data.num_meses === 1 ? 'mes' : 'meses'}` : '—'}
          sub={`Año ${new Date().getFullYear()} · enero a la fecha`}
        />
        <KpiCard
          label="Docenas totales"
          value={fmtDoc(data.docenas_totales)}
          sub={data.precio_implicito_docena ? `${fmtARS(data.precio_implicito_docena)}/docena en tiendas` : ''}
        />
      </div>

      {/* ── Comparativo por tienda ────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                Comparativo por tienda
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                {fmtRango(periodo.desde, periodo.hasta)}
                {comp && ` · ${comp.periodo.n_dias} ${comp.periodo.n_dias === 1 ? 'día' : 'días'}`}
                {' · ranking por facturación'}
              </p>
            </div>
            <FiltroPeriodo
              desde={periodo.desde}
              hasta={periodo.hasta}
              onChange={(desde, hasta) => setPeriodo({ desde, hasta })}
            />
          </div>

          {compError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{compError}</p>
          )}

          {/* Total consolidado */}
          {comp && (
            <div className="rounded-xl px-5 py-4 text-white" style={{ background: '#4C1D95', opacity: compLoading ? 0.6 : 1 }}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-0.5">
                    Total red · {fmtRango(periodo.desde, periodo.hasta)}
                  </p>
                  <p className="text-3xl font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    {fmtARS(comp.total.actual)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-5">
                  {COLS.map(c => (
                    <div key={c.key} className="text-right">
                      <p className="text-xs opacity-50 mb-0.5">{c.head}</p>
                      <p className="text-base font-semibold opacity-80">{fmtARS(comp.total[c.key])}</p>
                      <p className="text-sm font-bold">
                        {comp.total[c.varKey] === null
                          ? <span className="text-white/40">—</span>
                          : <span className={comp.total[c.varKey] >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                              {comp.total[c.varKey] >= 0 ? '▲' : '▼'} {Math.abs(comp.total[c.varKey])}%
                            </span>
                        }
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tarjetas por tienda */}
        {compLoading && !comp ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : comp?.tiendas?.length ? (
          <div className="grid sm:grid-cols-2 gap-3" style={{ opacity: compLoading ? 0.6 : 1 }}>
            {comp.tiendas.map(t => (
              <div
                key={t.nombre}
                className="card p-4 space-y-2.5"
                style={{ borderLeft: `3px solid ${colorDeTienda(t.nombre)}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Medalla m={t.medalla} />
                    <span className="font-semibold text-stone-800 text-sm">{shortName(t.nombre)}</span>
                    {!t.es_alfajorera && (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">café</span>
                    )}
                  </div>
                  <VarBadge v={t.facturacion.var_mes_ant} />
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className="text-left pb-1.5 text-stone-400 font-medium" />
                      <th className="text-right pb-1.5 text-stone-700 font-semibold pr-2">Período</th>
                      {COLS.map(c => (
                        <th key={c.key} className="text-right pb-1.5 text-stone-400 font-medium pr-2 whitespace-nowrap"
                            title={c.sub}>
                          {c.head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasDe(t).map(fila => (
                      <tr key={fila.key} className="border-b border-stone-50 last:border-0">
                        <td className="py-1.5 text-stone-500 pr-2 whitespace-nowrap">{fila.label}</td>
                        <td className="py-1.5 text-right font-semibold text-stone-800 pr-2 whitespace-nowrap">
                          {fila.fmt(fila.m.actual)}
                        </td>
                        {COLS.map(c => (
                          <td key={c.key} className="py-1.5 text-right pr-2 whitespace-nowrap">
                            <VarCell v={fila.m[c.varKey]} referencia={`${c.head} · ${fila.fmt(fila.m[c.key])}`} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Ventas por mes y tienda ───────────────────────────────────────── */}
      {ventasBarData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-1">Ventas por mes y tienda</h2>
          <p className="text-xs text-stone-400 mb-4">
            Escala en millones · click en un mes para ver el monto exacto de cada tienda
          </p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ventasBarData} margin={{ top: 22, right: 10, left: 5, bottom: 5 }}
                        onClick={handleVentasClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: '#e7e5e4' }} height={38}
                       tick={<TickMesConTotal totales={totalesVentas} formato={fmtARS} />} />
                <YAxis
                  tickFormatter={v => (v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} width={38}
                  label={{ value: 'millones $', angle: -90, position: 'insideLeft',
                           style: { fontSize: 10, fill: '#a8a29e' }, offset: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(120,113,108,0.06)' }}
                  content={<StackTooltip titulo="Total red" formato={fmtARS} unidad="" />}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {nombresVentas.map((nombre, idx) => (
                  <Bar
                    key={nombre}
                    dataKey={shortName(nombre)}
                    stackId="v"
                    fill={colorDeTienda(nombre, idx)}
                    stroke={SURFACE}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    radius={idx === nombresVentas.length - 1 ? [4, 4, 0, 0] : 0}
                    cursor="pointer"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Participación acumulada ───────────────────────────────────────── */}
      {participacion.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-4">Participación acumulada</h2>
          <div className="grid sm:grid-cols-2 gap-5 items-center">
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={participacion}
                    dataKey="facturacion"
                    nameKey="tienda"
                    cx="50%" cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke={SURFACE}
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {participacion.map((entry, i) => (
                      <Cell key={i} fill={colorDeTienda(entry.tienda, i)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [fmtARS(v), shortName(name)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* La vista de tabla: tres de estos colores quedan por debajo de 3:1
                contra el blanco, así que la identidad nunca depende solo del color. */}
            <div className="space-y-1.5">
              {participacion.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDeTienda(p.tienda, i) }} />
                  <span className="text-xs text-stone-600 flex-1 truncate">{shortName(p.tienda)}</span>
                  <span className="text-xs text-stone-400">{fmtARS(p.facturacion)}</span>
                  <span className="text-xs font-semibold text-stone-800 w-12 text-right">{fmtPct(p.porcentaje)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Docenas mensuales ─────────────────────────────────────────────── */}
      {docBarData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-1">Docenas mensuales por tienda</h2>
          <p className="text-xs text-stone-400 mb-4">Incluye la cafetería · click en un mes para ver el detalle por producto</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={docBarData} margin={{ top: 22, right: 10, left: 5, bottom: 5 }} onClick={handleBarClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: '#e7e5e4' }} height={38}
                       tick={<TickMesConTotal totales={totalesDoc} formato={fmtDoc} />} />
                <YAxis
                  tickFormatter={v => (Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} width={46}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(120,113,108,0.06)' }}
                  content={<StackTooltip titulo="Total grupo" formato={fmtDoc} unidad=" doc" />}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesDoc.map((s, idx) => (
                  <Bar
                    key={s.tienda}
                    dataKey={shortName(s.tienda)}
                    stackId="d"
                    fill={colorDeTienda(s.tienda, idx)}
                    stroke={SURFACE}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    radius={idx === seriesDoc.length - 1 ? [4, 4, 0, 0] : 0}
                    cursor="pointer"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

            {/* Detalle del mes en ventas */}
      {modalVentas && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalVentas(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Ventas de {modalVentas.mesLabel}
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">Monto exacto por tienda</p>
              </div>
              <button
                onClick={() => setModalVentas(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600"
              >✕</button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="rounded-xl px-4 py-3 mb-4 text-white flex items-baseline justify-between gap-4"
                   style={{ background: '#4C1D95' }}>
                <span className="text-xs font-semibold uppercase tracking-wide opacity-60">Total red</span>
                <span className="text-2xl font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {fmtARS(modalVentas.total)}
                </span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left py-2 text-xs text-stone-400 font-semibold uppercase">Tienda</th>
                    <th className="text-right py-2 text-xs text-stone-400 font-semibold uppercase">Facturación</th>
                    <th className="text-right py-2 text-xs text-stone-400 font-semibold uppercase">%</th>
                    <th className="text-right py-2 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {modalVentas.filas.map(f => (
                    <tr key={f.nombre} className="hover:bg-stone-50">
                      <td className="py-2.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                              style={{ background: colorDeTienda(f.nombre) }} />
                        <span className="text-stone-800">{shortName(f.nombre)}</span>
                      </td>
                      <td className="text-right py-2.5 font-semibold text-stone-900 tabular-nums">
                        {fmtARS(f.facturacion)}
                      </td>
                      <td className="text-right py-2.5 text-stone-500 tabular-nums">{fmtPct(f.porcentaje)}</td>
                      <td className="text-right py-2.5 text-stone-500 tabular-nums">
                        {f.docenas === null || f.docenas === undefined ? '—' : fmtDoc(f.docenas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-stone-100 flex justify-end">
              <button
                onClick={() => setModalVentas(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold hover:bg-stone-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal drill-down docenas */}
      {modalDoc && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModalDoc(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Docenas · {modalDoc.mesLabel}
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">Composición por producto</p>
              </div>
              <button
                onClick={() => setModalDoc(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600"
              >✕</button>
            </div>

            <div className="px-6 pt-3 flex flex-wrap gap-2">
              {seriesDoc.map((s, idx) => {
                const active = modalLocal?.local_id === s.local_id;
                return (
                  <button
                    key={s.local_id}
                    onClick={() => setModalLocal({ local_id: s.local_id, nombre: s.tienda })}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300 hover:bg-violet-50'
                    }`}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5"
                      style={{ background: colorDeTienda(s.tienda, idx) }}
                    />
                    {shortName(s.tienda)}
                  </button>
                );
              })}
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {loadDetalle && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loadDetalle && detalle && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-violet-50 rounded-xl p-3">
                      <p className="text-xs text-violet-600 font-semibold uppercase tracking-wide mb-0.5">Docenas totales</p>
                      <p className="text-2xl font-bold text-violet-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                        {fmtDoc(detalle.docenas_total)}
                      </p>
                    </div>
                    <div className="bg-stone-50 rounded-xl p-3">
                      <p className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-0.5">Facturación</p>
                      <p className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                        {fmtARS(detalle.facturacion_total)}
                      </p>
                    </div>
                  </div>

                  {detalle.productos_que_suman.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-stone-700 mb-2">Productos que suman docenas</h4>
                      <div className="overflow-x-auto rounded-xl border border-stone-100">
                        <table className="w-full text-sm">
                          <thead className="bg-stone-50">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Producto</th>
                              <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Cant.</th>
                              <th className="text-center py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Conv.</th>
                              <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
                              <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50">
                            {detalle.productos_que_suman.map((p, i) => (
                              <tr key={i} className="hover:bg-stone-50">
                                <td className="py-2 px-3">
                                  <span className="font-medium text-stone-800">{p.producto}</span>
                                  {p.categoria && <span className="ml-1.5 text-xs text-stone-400">{p.categoria}</span>}
                                </td>
                                <td className="text-right py-2 px-3 text-stone-600">{fmtNum(p.cantidad)}</td>
                                <td className="text-center py-2 px-3">
                                  <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 font-mono">
                                    {p.operacion}
                                  </span>
                                </td>
                                <td className="text-right py-2 px-3 font-semibold text-violet-900">{fmtDoc(p.docenas)}</td>
                                <td className="text-right py-2 px-3 text-stone-500">
                                  {detalle.docenas_total > 0
                                    ? fmtPct(Math.round(p.docenas / detalle.docenas_total * 1000) / 10)
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {detalle.productos_sin_docenas.length > 0 && (
                    <div>
                      <button
                        onClick={() => setSinDocColl(v => !v)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-700"
                      >
                        <span className="text-xs">{sinDocColl ? '▶' : '▼'}</span>
                        Productos sin docenas ({detalle.productos_sin_docenas.length})
                      </button>
                      {!sinDocColl && (
                        <div className="mt-2 overflow-x-auto rounded-xl border border-stone-100">
                          <table className="w-full text-sm">
                            <thead className="bg-stone-50">
                              <tr>
                                <th className="text-left py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Producto</th>
                                <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Cant.</th>
                                <th className="text-right py-2 px-3 text-xs text-stone-400 font-semibold uppercase">Facturación</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                              {detalle.productos_sin_docenas.map((p, i) => (
                                <tr key={i} className="hover:bg-stone-50">
                                  <td className="py-2 px-3">
                                    <span className="text-stone-700">{p.producto}</span>
                                    {p.categoria && <span className="ml-1.5 text-xs text-stone-400">{p.categoria}</span>}
                                  </td>
                                  <td className="text-right py-2 px-3 text-stone-500">{fmtNum(p.cantidad)}</td>
                                  <td className="text-right py-2 px-3 text-stone-500">{fmtARS(p.facturacion)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-stone-100 flex justify-between items-center">
              <button
                onClick={downloadCsv}
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900 hover:underline"
              >
                ↓ Descargar CSV
              </button>
              <button
                onClick={() => setModalDoc(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-sm font-semibold hover:bg-stone-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
