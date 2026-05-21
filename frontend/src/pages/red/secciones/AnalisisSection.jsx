import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { fmtM, fmtNum, fmtDoc, fmtARS, fmtPct, colorDeTienda, shortName, yearRange } from '../redUtils';

function Skeleton({ className = '' }) {
  return <div className={`bg-stone-200 rounded-xl animate-pulse ${className}`} />;
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className={`card p-4 border ${accent ? 'border-violet-200 bg-violet-50/50' : 'border-stone-100'}`}>
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
    </div>
  );
}

const MESES_SHORT = {'01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic'};
function mesShort(yyyymm) { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_SHORT[m] || yyyymm; }

function VarCell({ valor, variacion_pct }) {
  if (valor === undefined) return <td className="py-2 px-3 text-center text-stone-200">—</td>;
  const hasVar = variacion_pct !== null && variacion_pct !== undefined;
  const pos    = Number(variacion_pct) >= 0;
  return (
    <td className="py-2 px-3 text-right">
      <div className="font-medium text-stone-800 text-xs">{fmtM(valor)}</div>
      {hasVar && (
        <div className={`text-xs font-semibold ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
          {pos ? '▲' : '▼'} {Math.abs(Number(variacion_pct)).toFixed(1)}%
        </div>
      )}
    </td>
  );
}

export default function AnalisisSection() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [modoTot, setModoTot] = useState('facturacion'); // 'facturacion' | 'docenas'

  useEffect(() => {
    const { desde, hasta } = yearRange();
    api.get('/red/analisis', { params: { desde, hasta } })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
      <Skeleton className="h-80" />
    </div>
  );

  if (!data) return <p className="text-center py-16 text-stone-400">Sin datos.</p>;

  const { kpis = {}, facturacion_mensual_acumulada = {}, docenas_tendencia = {}, totalizador_mensual = {}, conclusiones = [] } = data;

  // LineChart facturación mensual
  const factMeses  = facturacion_mensual_acumulada.meses || [];
  const factSeries = facturacion_mensual_acumulada.series || [];
  const factChartData = factMeses.map(mes => {
    const row = { mes: mesShort(mes) };
    factSeries.forEach(s => { row[shortName(s.tienda)] = s.por_mes[mes] || 0; });
    return row;
  });

  // ComposedChart docenas + precio
  const docMeses    = docenas_tendencia.meses || [];
  const docTotales  = docenas_tendencia.docenas_totales || [];
  const precioDDoc  = docenas_tendencia.precio_por_docena || [];
  const docChartData = docMeses.map((mes, i) => ({
    mes: mesShort(mes),
    docenas: docTotales[i] || 0,
    precio_docena: precioDDoc[i] || null,
  }));

  // Totalizador
  const totData = totalizador_mensual[`modo_${modoTot}`] || {};
  const filasTot = totData.filas || [];
  const totalesTot = totData.totales_tienda || {};
  const totalGeneral = totData.total_general || 0;
  const tiendaNombresTot = filasTot[0] ? Object.keys(filasTot[0].por_tienda) : [];

  const fmtTot = modoTot === 'docenas'
    ? v => fmtDoc(v)
    : v => fmtM(v);

  return (
    <div className="space-y-5">
      {/* 6 KPIs estratégicos */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard accent label="Facturación total red" value={fmtM(kpis.facturacion_total)} sub="Ene–May 2026 · todas las unidades" />
        <KpiCard       label="Docenas acumuladas"    value={fmtDoc(kpis.docenas_acumuladas)} sub="Solo tiendas alfajoreras" />
        <KpiCard       label="Precio implícito/docena" value={kpis.precio_implicito_docena ? fmtARS(kpis.precio_implicito_docena) : '—'} sub="Facturación alfajoreras / docenas" />
        <KpiCard       label="Tickets totales"       value={fmtNum(kpis.tickets_totales)} sub={`Prom ticket ${fmtARS(kpis.ticket_promedio)}`} />
        <KpiCard
          label="Crecimiento prom mensual"
          value={kpis.crecimiento_prom_mensual_pct != null ? fmtPct(kpis.crecimiento_prom_mensual_pct) : '—'}
          sub="Meses completos consecutivos"
        />
        <KpiCard
          label="Tendencia docenas"
          value={kpis.tendencia_docenas_pct != null ? fmtPct(kpis.tendencia_docenas_pct) : '—'}
          sub={`Concentración top 2: ${kpis.concentracion_top2_pct != null ? fmtPct(kpis.concentracion_top2_pct) : '—'}`}
        />
      </div>

      {/* Facturación mensual acumulada · todas las unidades */}
      {factChartData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-4">Facturación mensual · todas las unidades</h2>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={factChartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10 }} width={52} />
                <Tooltip formatter={(v, name) => [fmtM(v), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {factSeries.map((s, idx) => (
                  <Line
                    key={s.tienda}
                    type="monotone"
                    dataKey={shortName(s.tienda)}
                    stroke={colorDeTienda(s.tienda, idx)}
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

      {/* Docenas tendencia · barras + línea precio */}
      {docChartData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-1">Docenas mensuales · tendencia red</h2>
          <p className="text-xs text-stone-400 mb-4">Barras: docenas totales alfajoreras · Línea: precio implícito por docena</p>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={docChartData} margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="doc" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="prec" orientation="right" tickFormatter={v => fmtM(v)} tick={{ fontSize: 10 }} width={52} />
                <Tooltip formatter={(v, name) => [
                  name === 'precio_docena' ? fmtARS(v) : `${Number(v).toFixed(2)} doc`,
                  name === 'precio_docena' ? 'Precio/docena' : 'Docenas'
                ]} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v === 'precio_docena' ? 'Precio/docena' : 'Docenas'} />
                <Bar yAxisId="doc" dataKey="docenas" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                <Line yAxisId="prec" type="monotone" dataKey="precio_docena" stroke="#4C1D95" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Totalizador mensual */}
      {filasTot.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                Totalizador mensual por tienda
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">Valor + variación % vs mes anterior</p>
            </div>
            <div className="flex rounded-xl border border-stone-200 overflow-hidden text-sm">
              <button
                onClick={() => setModoTot('facturacion')}
                className={`px-3 py-1.5 font-medium transition-colors ${modoTot === 'facturacion' ? 'bg-violet-800 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
              >
                Facturación
              </button>
              <button
                onClick={() => setModoTot('docenas')}
                className={`px-3 py-1.5 font-medium transition-colors ${modoTot === 'docenas' ? 'bg-violet-800 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
              >
                Docenas
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-y border-stone-100">
                <tr>
                  <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase sticky left-0 bg-stone-50">Mes</th>
                  {tiendaNombresTot.map(nombre => (
                    <th key={nombre} className="text-right py-2.5 px-3 text-xs text-stone-400 font-semibold uppercase whitespace-nowrap">
                      {shortName(nombre)}
                    </th>
                  ))}
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filasTot.map(fila => (
                  <tr key={fila.mes} className="hover:bg-stone-50">
                    <td className="py-2 px-4 font-medium text-stone-700 sticky left-0 bg-white">{mesShort(fila.mes)}</td>
                    {tiendaNombresTot.map(nombre => (
                      <VarCell
                        key={nombre}
                        valor={fila.por_tienda[nombre]?.valor}
                        variacion_pct={fila.por_tienda[nombre]?.variacion_pct}
                      />
                    ))}
                    <td className="py-2 px-4 text-right font-bold text-stone-900">{fmtTot(fila.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-violet-50 border-t-2 border-violet-100">
                <tr>
                  <td className="py-2.5 px-4 font-bold text-violet-900">Total</td>
                  {tiendaNombresTot.map(nombre => (
                    <td key={nombre} className="py-2.5 px-3 text-right font-bold text-violet-900">
                      {fmtTot(totalesTot[nombre] || 0)}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-right font-bold text-violet-900">
                    {fmtTot(totalGeneral)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Conclusiones */}
      {conclusiones.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-stone-800 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Conclusiones y recomendaciones
          </h2>
          <div className="space-y-0">
            {conclusiones.map((c, i) => (
              <div
                key={i}
                className={`flex gap-4 py-4 ${i < conclusiones.length - 1 ? 'border-b border-stone-100' : ''}`}
              >
                <span className="text-2xl flex-shrink-0 mt-0.5">{c.icono}</span>
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{c.titulo}</p>
                  <p className="text-sm text-stone-500 mt-1 leading-relaxed">{c.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
