import { useEffect, useState } from 'react';
import {
  Line, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { fmtNum, fmtDoc, fmtARS, colorDeTienda, shortName, yearRange } from '../redUtils';

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

function VarCell({ valor, variacion_pct, fmt }) {
  if (valor === undefined) return <td className="py-2 px-3 text-center text-stone-200">—</td>;
  const hasVar = variacion_pct !== null && variacion_pct !== undefined;
  const pos    = Number(variacion_pct) >= 0;
  return (
    <td className="py-2 px-3 text-right">
      <div className="font-medium text-stone-800 text-xs whitespace-nowrap">{fmt(valor)}</div>
      {hasVar && (
        <div className={`text-xs font-semibold ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
          {pos ? '▲' : '▼'} {Math.abs(Number(variacion_pct)).toFixed(1)}%
        </div>
      )}
    </td>
  );
}

// "2026-01-05" → "5/1"
function ddmm(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
}

function VarSemana({ v }) {
  if (v === null || v === undefined) return <span className="text-stone-300">—</span>;
  const pos = Number(v) >= 0;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
      pos ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
    }`}>
      {pos ? '+' : '−'}{Math.abs(Number(v)).toFixed(0)}%
    </span>
  );
}

function SemanaTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}>
      <p style={{ fontWeight: 600, marginBottom: 6, color: '#1c1917', fontSize: 13 }}>
        Semana {d.semana} · {ddmm(d.desde)}–{ddmm(d.hasta)}
      </p>
      <p style={{ color: '#44403c', fontSize: 12, margin: 0 }}>Facturación: {fmtARS(d.facturacion)}</p>
      <p style={{ color: '#44403c', fontSize: 12, margin: 0 }}>Docenas: {fmtDoc(d.docenas)}</p>
    </div>
  );
}

function Medalla({ m }) {
  if (m === 1) return <span>🥇</span>;
  if (m === 2) return <span>🥈</span>;
  if (m === 3) return <span>🥉</span>;
  return <span className="text-stone-400 text-sm">{m}</span>;
}

// Un bloque por tienda: combo de barras (facturación) y línea (docenas), más la
// tabla semana a semana. Los dos ejes tienen escalas distintas a propósito —
// pesos y docenas no son comparables entre sí, así que las alturas relativas de
// barra y línea no significan nada: los números exactos están en la tabla.
function BloqueSemanal({ tienda }) {
  const color = colorDeTienda(tienda.tienda);
  const datos = tienda.semanas;
  if (!datos.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Medalla m={tienda.medalla} />
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
          {shortName(tienda.tienda)}
        </h3>
        <span className="flex-1 border-t border-stone-100" />
        <span className="text-xs text-stone-400">
          {fmtARS(tienda.facturacion_total)} · {fmtDoc(tienda.docenas_total)} doc
        </span>
      </div>

      <div className="card overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
        <div className="p-5 pb-2">
          <h2 className="font-semibold text-stone-800 text-sm mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Análisis semana a semana · {shortName(tienda.tienda)}
          </h2>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datos} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" vertical={false} />
                <XAxis dataKey="semana" tickFormatter={v => `S${v}`}
                       tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={{ stroke: '#e7e5e4' }} />
                <YAxis yAxisId="pesos"
                       tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`}
                       tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} width={38} />
                <YAxis yAxisId="doc" orientation="right"
                       tickFormatter={v => `${Math.round(v)}`}
                       tick={{ fontSize: 10, fill: color }} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<SemanaTooltip />} cursor={{ fill: 'rgba(120,113,108,0.06)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="pesos" dataKey="facturacion" name="Facturación"
                     fill={color} fillOpacity={0.75} isAnimationActive={false} maxBarSize={22} />
                <Line yAxisId="doc" type="monotone" dataKey="docenas" name="Docenas"
                      stroke={color} strokeWidth={2} isAnimationActive={false}
                      dot={{ r: 3, fill: '#fff', stroke: color, strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto border-t border-stone-100">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 sticky top-0 z-10">
              <tr>
                <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Semana</th>
                <th className="text-right py-2.5 px-3 text-xs text-stone-400 font-semibold uppercase">Facturación</th>
                <th className="text-right py-2.5 px-3 text-xs text-stone-400 font-semibold uppercase">Var%</th>
                <th className="text-right py-2.5 px-3 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
                <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Var%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {datos.map(w => (
                <tr key={w.semana} className="hover:bg-stone-50">
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className="font-medium text-stone-700">Sem {String(w.semana).padStart(2, '0')}</span>
                    <span className="text-xs text-stone-400 ml-1.5">({ddmm(w.desde)}–{ddmm(w.hasta)})</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-stone-900 tabular-nums whitespace-nowrap">
                    {fmtARS(w.facturacion)}
                  </td>
                  <td className="py-2.5 px-3 text-right"><VarSemana v={w.var_facturacion} /></td>
                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color }}>
                    {fmtDoc(w.docenas)}
                  </td>
                  <td className="py-2.5 px-4 text-right"><VarSemana v={w.var_docenas} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AnalisisSection() {
  const [data,    setData]    = useState(null);
  const [semanal, setSemanal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modoTot, setModoTot] = useState('facturacion'); // 'facturacion' | 'docenas'

  useEffect(() => {
    const { desde, hasta } = yearRange();
    Promise.all([
      api.get('/red/analisis', { params: { desde, hasta } }),
      api.get('/red/semanal',  { params: { desde, hasta } }),
    ]).then(([aRes, sRes]) => {
      setData(aRes.data.data);
      setSemanal(sRes.data.data);
    }).catch(console.error).finally(() => setLoading(false));
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

  const { kpis = {}, totalizador_mensual = {} } = data;

  // Totalizador
  const totData = totalizador_mensual[`modo_${modoTot}`] || {};
  const filasTot = totData.filas || [];
  const totalesTot = totData.totales_tienda || {};
  const totalGeneral = totData.total_general || 0;
  const tiendaNombresTot = filasTot[0] ? Object.keys(filasTot[0].por_tienda) : [];

  const fmtTot = modoTot === 'docenas'
    ? v => fmtDoc(v)
    : v => fmtARS(v);

  return (
    <div className="space-y-5">
      {/* 6 KPIs estratégicos */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard accent label="Facturación total red" value={fmtARS(kpis.facturacion_total)} sub={`Año ${new Date().getFullYear()} · todas las unidades`} />
        <KpiCard       label="Docenas acumuladas"    value={fmtDoc(kpis.docenas_acumuladas)} sub="Tiendas y cafetería" />
        <KpiCard       label="Precio implícito/docena" value={kpis.precio_implicito_docena ? fmtARS(kpis.precio_implicito_docena) : '—'} sub="Facturación y docenas de tiendas" />
        <KpiCard       label="Tickets totales"       value={fmtNum(kpis.tickets_totales)} sub={`Prom ticket ${fmtARS(kpis.ticket_promedio)}`} />
      </div>

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
                        fmt={fmtTot}
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


      {/* Semana a semana, por tienda */}
      {semanal?.tiendas?.length > 0 && (
        <div className="space-y-6 pt-2">
          <div>
            <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Semana a semana
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Semanas de lunes a domingo · se omiten las semanas cortadas por el inicio o el fin del período
            </p>
          </div>
          {semanal.tiendas.map(t => <BloqueSemanal key={t.local_id} tienda={t} />)}
        </div>
      )}

    </div>
  );
}
