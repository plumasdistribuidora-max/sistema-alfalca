import { useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts';

const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const SITUACIONES   = { normal: 'Normal', sube: 'Sube', finde_largo: 'Finde largo' };

function barColor(indice) {
  if (indice >= 1.12) return '#059669';
  if (indice <= 0.88) return '#DC2626';
  return '#7C3AED';
}

function localShort(nombre) {
  return (nombre || '').replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
}

function fmtNum(v) {
  return (Number(v) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ComoSeCalculaModal({ proyeccion, onClose }) {
  const { local, parametros: p, factores: f, demanda_total_doc, grafico_estacionalidad } = proyeccion;

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mesNombre       = MESES_NOMBRES[(p.mes_objetivo - 1) % 12];
  const mesActualNombre = MESES_NOMBRES[(p.mes_actual - 1) % 12];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-stone-900 text-lg" style={{ fontFamily: 'Nunito, sans-serif' }}>
              ¿Cómo se calcula el pedido?
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Para <strong>{localShort(local.nombre)}</strong> · {p.dias} días hacia {mesNombre}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600 flex-shrink-0"
          >✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <p className="text-sm text-stone-600">
            El sistema combina <strong className="text-stone-800">4 factores</strong> sobre tu venta real
            para calcular cuántas docenas necesitás:
          </p>

          {/* 4 Factor cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* 1. Velocidad base */}
            <div className="rounded-xl p-4 border-l-4" style={{ borderColor: '#7C3AED', background: '#F5F3FF' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <p className="text-xs font-bold text-violet-900 uppercase tracking-wide">Velocidad base</p>
              </div>
              <p className="text-2xl font-bold text-violet-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {f.velocidad_base_semanal} <span className="text-sm font-normal opacity-70">doc/sem</span>
              </p>
              <p className="text-xs text-violet-700">
                Promedio ponderado de las últimas {f.semanas_historia} semanas de venta real (POS), con más peso a lo reciente.
                {f.fuente_velocidad === 'red' && <strong> (usando velocidad de la red — historia insuficiente en este local)</strong>}
              </p>
            </div>

            {/* 2. Estacionalidad */}
            <div className="rounded-xl p-4 border-l-4" style={{ borderColor: '#059669', background: '#F0FDF4' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Estacionalidad</p>
              </div>
              <p className="text-2xl font-bold text-emerald-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                ×{f.factor_estacional}
              </p>
              <p className="text-xs text-emerald-700">
                {mesNombre} tiene índice {f.indice_mes_objetivo} vs {mesActualNombre} {f.indice_mes_actual} en el histórico 2025.
              </p>
            </div>

            {/* 3. Tendencia */}
            <div className="rounded-xl p-4 border-l-4" style={{ borderColor: '#D97706', background: '#FFFBEB' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Tendencia mercado</p>
              </div>
              <p className="text-2xl font-bold text-amber-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>×0.97</p>
              <p className="text-xs text-amber-700">
                El consumo de alfajores cayó ~12% en el mercado (datos Entre Dos, últimos 3 años). Ajuste conservador.
              </p>
            </div>

            {/* 4. Ajuste propio */}
            <div className="rounded-xl p-4 border-l-4" style={{ borderColor: '#4C1D95', background: '#EDE9FE' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ background: '#4C1D95' }}>4</span>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#4C1D95' }}>Tu ajuste</p>
              </div>
              <p className="text-2xl font-bold mb-1" style={{ fontFamily: 'Nunito, sans-serif', color: '#4C1D95' }}>
                ×{f.multiplicador}
              </p>
              <p className="text-xs" style={{ color: '#6D28D9' }}>
                Marcaste "{SITUACIONES[p.situacion] || p.situacion}".
              </p>
            </div>
          </div>

          {/* Formula */}
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Fórmula</p>
            <p className="font-mono text-sm text-stone-700 leading-relaxed break-all">
              {f.velocidad_base_semanal}
              <span className="text-stone-400"> × </span>
              ({p.dias}/7)
              <span className="text-stone-400"> × </span>
              {f.factor_estacional}
              <span className="text-stone-400"> × </span>
              0.97
              <span className="text-stone-400"> × </span>
              {f.multiplicador}
              <span className="text-stone-400"> = </span>
              <strong className="text-violet-700">{fmtNum(demanda_total_doc)} doc</strong>
            </p>
            <p className="text-xs text-stone-500 mt-2">
              Luego se reparte por sabor según tu mix de compras y se convierte a bultos, restando lo que contaste.
            </p>
          </div>

          {/* Estacionalidad chart */}
          <div>
            <p className="font-semibold text-stone-800 mb-3 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Estacionalidad de tus ventas (histórico 2025)
            </p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafico_estacionalidad} margin={{ top: 5, right: 8, left: -18, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ef" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                  <YAxis
                    domain={[0.6, 1.4]}
                    tick={{ fontSize: 9 }}
                    tickFormatter={v => `${v}×`}
                  />
                  <Tooltip
                    formatter={(v, _) => [`${v}×`, 'Índice']}
                    labelFormatter={label => label}
                  />
                  <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />
                  <Bar dataKey="indice" radius={[3, 3, 0, 0]}>
                    {grafico_estacionalidad.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={barColor(entry.indice)}
                        fillOpacity={entry.mes === p.mes_objetivo ? 1 : 0.45}
                        stroke={entry.mes === p.mes_objetivo ? barColor(entry.indice) : 'none'}
                        strokeWidth={entry.mes === p.mes_objetivo ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-stone-400 mt-1.5 text-center">
              Barra resaltada = {mesNombre} (mes objetivo) · verde ≥1.12 · rojo ≤0.88 · violeta = normal
            </p>
          </div>

          {/* Footer note */}
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
            <p className="text-xs text-stone-500">
              El mix de sabores y la velocidad se actualizan solos al importar ventas. Vos solo cargás el conteo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
