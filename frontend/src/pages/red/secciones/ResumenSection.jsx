import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { fmtM, fmtNum, fmtDoc, fmtPct, fmtARS, colorDeTienda, shortName, yearRange } from '../redUtils';

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

function Medalla({ m }) {
  if (m === 1) return <span className="text-lg">🥇</span>;
  if (m === 2) return <span className="text-lg">🥈</span>;
  if (m === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm text-stone-400 w-6 text-center inline-block">{m}</span>;
}

const MESES_ES = { '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic' };
function fmtMesLabel(yyyymm) { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_ES[m] || yyyymm; }

export default function ResumenSection() {
  const [data,    setData]    = useState(null);
  const [docenas, setDocenas] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    </div>
  );

  if (!data) return <p className="text-center py-16 text-stone-400">Sin datos.</p>;

  // Evolución mensual: pivot para LineChart
  const mesesEvol  = (data.evolucion_mensual || []).map(row => ({
    mes: fmtMesLabel(row.mes),
    ...Object.fromEntries(Object.entries(row.por_tienda).map(([k, v]) => [shortName(k), v])),
  }));
  const nombresEvol = data.evolucion_mensual?.length
    ? [...new Set(data.evolucion_mensual.flatMap(r => Object.keys(r.por_tienda)))]
    : [];

  // Participación para PieChart
  const participacion = (data.participacion || []).filter(p => Number(p.facturacion) > 0);

  // Docenas mensuales para stacked BarChart
  const { meses: mesesDoc = [], series: seriesDoc = [] } = docenas || {};
  const docBarData = mesesDoc.map(mes => {
    const row = { mes: fmtMesLabel(mes) };
    seriesDoc.forEach(s => { row[shortName(s.tienda)] = s.por_mes[mes] || 0; });
    return row;
  });

  const quincenal = data.comparativo_quincenal || {};
  const tiendas_q = quincenal.tiendas || [];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          primary
          label="Facturación total red"
          value={fmtM(data.facturacion_total)}
          sub={`${data.num_unidades} unidades · ${data.num_meses} meses`}
        />
        <KpiCard
          label="Docenas alfajoreras"
          value={fmtDoc(data.docenas_totales)}
          sub={data.precio_implicito_docena ? `equiv. ${fmtARS(data.precio_implicito_docena)}/docena` : ''}
        />
        <KpiCard
          label="Unidad líder"
          value={shortName(data.unidad_lider?.nombre) || '—'}
          sub={data.unidad_lider ? `${fmtM(data.unidad_lider.facturacion)} · ${fmtPct(data.unidad_lider.porcentaje)} del total` : ''}
        />
        <KpiCard
          label="Mejor mes"
          value={fmtMesLabel(data.mejor_mes?.mes) || '—'}
          sub={data.mejor_mes ? `${fmtM(data.mejor_mes.facturacion)} total red` : ''}
        />
      </div>

      {/* Comparativo quincenal */}
      <div className="card p-5">
        <h2 className="font-semibold text-stone-800 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {quincenal.titulo || 'Comparativo quincenal'}
        </h2>
        <p className="text-xs text-stone-400 mb-4">Facturación · variación vs mismos días del mes anterior</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tiendas_q.map((t, i) => (
            <div
              key={t.nombre}
              className="rounded-xl p-4 border"
              style={{
                borderColor: colorDeTienda(t.nombre, i) + '55',
                background: colorDeTienda(t.nombre, i) + '10',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Medalla m={t.medalla} />
                  <p className="font-semibold text-stone-800 text-sm">{shortName(t.nombre)}</p>
                </div>
                <VarBadge v={t.variacion_pct} />
              </div>
              <p className="text-xl font-bold text-stone-900">{fmtM(t.facturacion_actual)}</p>
              <p className="text-xs text-stone-400 mt-0.5">
                ant: {fmtM(t.facturacion_anterior)} · {fmtNum(t.tickets)} {t.unidad_medida}
              </p>
              {t.es_alfajorera && (
                <p className="text-xs text-stone-400">{fmtDoc(t.docenas)} doc · ${fmtNum(t.prom_ticket)}/tkt</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Gráficos: líneas + dona */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Evolución facturación */}
        {mesesEvol.length > 0 && (
          <div className="card p-5 md:col-span-2">
            <h2 className="font-semibold text-stone-800 mb-4">Evolución de facturación</h2>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mesesEvol} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `$${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10 }} width={52} />
                  <Tooltip formatter={(v, name) => [fmtM(v), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {nombresEvol.map((nombre, idx) => (
                    <Line
                      key={nombre}
                      type="monotone"
                      dataKey={shortName(nombre)}
                      stroke={colorDeTienda(nombre, idx)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Participación acumulada (dona) */}
        {participacion.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-stone-800 mb-4">Participación acumulada</h2>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={participacion}
                    dataKey="facturacion"
                    nameKey="tienda"
                    cx="50%" cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {participacion.map((entry, i) => (
                      <Cell key={i} fill={colorDeTienda(entry.tienda, i)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [fmtM(v), shortName(name)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-2">
              {participacion.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDeTienda(p.tienda, i) }} />
                  <span className="text-xs text-stone-600 flex-1 truncate">{shortName(p.tienda)}</span>
                  <span className="text-xs font-semibold text-stone-800">{fmtPct(p.porcentaje)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Docenas mensuales (stacked bar) */}
      {docBarData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-1">Docenas mensuales · tiendas alfajoreras</h2>
          <p className="text-xs text-stone-400 mb-4">Café Peatonal excluido</p>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={docBarData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [fmtDoc(v) + ' doc', name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesDoc.map((s, idx) => (
                  <Bar
                    key={s.tienda}
                    dataKey={shortName(s.tienda)}
                    stackId="a"
                    fill={colorDeTienda(s.tienda, idx)}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
