import { useEffect, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../../api';
import { fmtM, fmtNum, fmtDoc, fmtARS, colorDeTienda, shortName } from '../redUtils';

function Skeleton({ className = '' }) {
  return <div className={`bg-stone-200 rounded-xl animate-pulse ${className}`} />;
}

function Medalla({ m }) {
  if (m === 1) return <span>🥇</span>;
  if (m === 2) return <span>🥈</span>;
  if (m === 3) return <span>🥉</span>;
  return <span className="text-stone-400 text-sm">{m}</span>;
}

const MESES_ES = {
  '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo',
  '06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre',
  '11':'Noviembre','12':'Diciembre',
};
const MESES_SHORT = { '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic' };

function mesNombre(yyyymm) { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_ES[m] || yyyymm; }
function mesShort(yyyymm)  { if (!yyyymm) return ''; const [,m] = yyyymm.split('-'); return MESES_SHORT[m] || yyyymm; }

export default function MesesSection() {
  const [meses,     setMeses]     = useState([]);
  const [detalle,   setDetalle]   = useState(null);
  const [selMes,    setSelMes]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [loadDet,   setLoadDet]   = useState(false);

  useEffect(() => {
    api.get('/red/meses-resumen', { params: { anio: new Date().getFullYear() } })
      .then(r => {
        const ms = r.data.data.meses || [];
        setMeses(ms);
        if (ms.length) {
          const ultimo = ms[ms.length - 1].mes;
          setSelMes(ultimo);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selMes) return;
    setLoadDet(true);
    api.get('/red/mes-detalle', { params: { mes: selMes } })
      .then(r => setDetalle(r.data.data))
      .catch(console.error)
      .finally(() => setLoadDet(false));
  }, [selMes]);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );

  // Barras docenas acumuladas
  const docAcum = (detalle?.docenas_acumuladas_alfajoreras || []).map(r => ({
    mes: mesShort(r.mes),
    docenas: r.docenas,
  }));

  // Barras facturación comparativa
  const factComp = (detalle?.facturacion_comparativa || []).map(r => ({
    tienda: shortName(r.tienda),
    facturacion: r.facturacion,
  }));

  return (
    <div className="space-y-5">
      {/* Selector de meses */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {meses.map((m, idx) => {
          const isSelected = selMes === m.mes;
          return (
            <button
              key={m.mes}
              onClick={() => setSelMes(m.mes)}
              className={`rounded-xl p-4 text-left transition-all border ${
                isSelected
                  ? 'border-violet-600 text-white'
                  : 'border-stone-200 bg-white hover:border-violet-300 hover:bg-violet-50'
              }`}
              style={isSelected ? { background: '#4C1D95' } : {}}
            >
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isSelected ? 'text-white/60' : 'text-stone-400'}`}>
                {mesShort(m.mes)}
              </p>
              <p className={`text-base font-bold ${isSelected ? 'text-white' : 'text-stone-800'}`}>
                {fmtM(m.facturacion)}
              </p>
              <p className={`text-xs mt-0.5 ${isSelected ? 'text-white/50' : 'text-stone-400'}`}>
                {fmtNum(m.tickets)} tkt
              </p>
            </button>
          );
        })}
      </div>

      {loadDet && <Skeleton className="h-64" />}

      {!loadDet && detalle && (
        <>
          {/* Ranking tiendas del mes */}
          <div className="card p-5">
            <h2 className="font-semibold text-stone-800 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {mesNombre(selMes)} · tiendas
            </h2>
            <p className="text-xs text-stone-400 mb-4">
              Total: {fmtM(detalle.facturacion_total)}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-100">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Tienda</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Facturación</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">{detalle.tiendas?.[0]?.unidad_medida || 'Tickets'}</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Prom/ticket</th>
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Docenas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {(detalle.tiendas || []).map((t, i) => (
                    <tr key={t.nombre} className="hover:bg-stone-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Medalla m={t.medalla} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorDeTienda(t.nombre, i) }} />
                          <span className="font-medium text-stone-800">{shortName(t.nombre)}</span>
                          {!t.es_alfajorera && (
                            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">café</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 font-semibold text-violet-900">{fmtM(t.facturacion)}</td>
                      <td className="text-right py-3 px-4 text-stone-600">{fmtNum(t.tickets)}</td>
                      <td className="text-right py-3 px-4 text-stone-600">{fmtARS(t.prom_ticket)}</td>
                      <td className="text-right py-3 px-4 text-stone-600">
                        {t.es_alfajorera ? fmtDoc(t.docenas) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráficos en 2 columnas */}
          <div className="grid md:grid-cols-2 gap-5">
            {/* Barras docenas acumuladas del año */}
            {docAcum.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-stone-800 mb-1">Docenas acumuladas en el año</h2>
                <p className="text-xs text-stone-400 mb-4">Solo alfajoreras · todos los meses</p>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={docAcum} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={v => [`${Number(v).toFixed(2)} doc`, 'Docenas']} />
                      <Bar dataKey="docenas" fill="#7C3AED" radius={[4, 4, 0, 0]}>
                        {docAcum.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.mes === mesShort(selMes) ? '#4C1D95' : '#A78BFA'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Barras facturación comparativa del mes */}
            {factComp.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-stone-800 mb-1">Facturación por tienda</h2>
                <p className="text-xs text-stone-400 mb-4">{mesNombre(selMes)}</p>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={factComp} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmtM(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="tienda" tick={{ fontSize: 11 }} width={70} />
                      <Tooltip formatter={v => [fmtARS(v), 'Facturación']} />
                      <Bar dataKey="facturacion" radius={[0, 4, 4, 0]}>
                        {factComp.map((entry, i) => (
                          <Cell key={i} fill={colorDeTienda(
                            (detalle.tiendas || []).find(t => shortName(t.nombre) === entry.tienda)?.nombre || '',
                            i
                          )} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
