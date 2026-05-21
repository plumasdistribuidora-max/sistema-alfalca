import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { fmtDoc } from '../red/redUtils';
import ComoSeCalculaModal from './ComoSeCalculaModal';

const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function Skeleton({ className = '' }) {
  return <div className={`bg-stone-100 rounded-xl animate-pulse ${className}`} />;
}

function AlertaBadge({ alerta }) {
  if (alerta === 'quiebre') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      ✕ Quiebre
    </span>
  );
  if (alerta === 'bajo') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
      ▲ Bajo
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
      ✓ OK
    </span>
  );
}

function localShort(nombre) {
  return (nombre || '').replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
}

export default function StockInteligente() {
  const [locales,     setLocales]     = useState([]);
  const [localId,     setLocalId]     = useState(null);
  const [dias,        setDias]        = useState(7);
  const [situacion,   setSituacion]   = useState('normal');
  const [unidad,      setUnidad]      = useState('bultos');
  const [proyeccion,  setProyeccion]  = useState(null);
  const [loadingProy, setLoadingProy] = useState(false);
  const [conteos,     setConteos]     = useState({});
  const [modalOpen,   setModalOpen]   = useState(false);
  const [conteoId,    setConteoId]    = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitOk,    setSubmitOk]    = useState(false);

  // Fetch locales on mount
  useEffect(() => {
    api.get('/locales').then(r => {
      const all = r.data.data || r.data || [];
      const alfajoreras = all.filter(l => l.es_alfajorera && l.activo !== false);
      setLocales(alfajoreras);
      const peatonal = alfajoreras.find(l => l.nombre?.toLowerCase().includes('peatonal'));
      setLocalId((peatonal || alfajoreras[0])?.id ?? null);
    }).catch(console.error);
  }, []);

  // Clear conteos and conteoId when local changes
  useEffect(() => {
    setConteos({});
    setConteoId(null);
    setSubmitOk(false);
  }, [localId]);

  // Fetch projection when any param changes
  useEffect(() => {
    if (!localId) return;
    setLoadingProy(true);
    setConteoId(null);
    setSubmitOk(false);
    api.get('/stock/proyeccion', { params: { local_id: localId, dias, situacion } })
      .then(r => setProyeccion(r.data.data))
      .catch(console.error)
      .finally(() => setLoadingProy(false));
  }, [localId, dias, situacion]);

  // Live recalculation per variedad
  const calcRows = useMemo(() => {
    if (!proyeccion) return [];
    return proyeccion.variedades.map(v => {
      const contado        = parseFloat(conteos[v.id] ?? '') || 0;
      const dpb            = v.doc_por_bulto;
      const stock_doc      = unidad === 'bultos' ? contado * dpb : contado;
      const a_pedir_doc    = Math.max(0, v.demanda_doc - stock_doc);
      const a_pedir_bultos = dpb > 0 ? Math.ceil(a_pedir_doc / dpb) : 0;
      let alerta = 'ok';
      if (stock_doc < v.demanda_doc * 0.3)      alerta = 'quiebre';
      else if (stock_doc < v.demanda_doc * 0.6) alerta = 'bajo';
      return { ...v, contado, stock_doc, a_pedir_doc, a_pedir_bultos, alerta };
    });
  }, [proyeccion, conteos, unidad]);

  const stockTotalDoc     = calcRows.reduce((s, r) => s + r.stock_doc, 0);
  const aPedirTotalBultos = calcRows.reduce((s, r) => s + r.a_pedir_bultos, 0);

  function handleConteo(variedadId, value) {
    setConteos(prev => ({ ...prev, [variedadId]: value }));
    setSubmitOk(false);
    setConteoId(null);
  }

  function handleUnidad(u) {
    setUnidad(u);
    setConteos({});
    setConteoId(null);
    setSubmitOk(false);
  }

  async function calcularPedido() {
    if (!proyeccion || !localId || submitting) return;
    setSubmitting(true);
    setSubmitOk(false);
    try {
      const res = await api.post('/stock/calcular-pedido', {
        local_id: localId,
        dias,
        situacion,
        unidad,
        conteos: calcRows.map(r => ({ variedad_id: r.id, contado: r.contado })),
      });
      setConteoId(res.data.data.conteo_id);
      setSubmitOk(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function exportarCsv() {
    if (!conteoId) return;
    try {
      const r = await api.get('/stock/export', {
        params: { conteo_id: conteoId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(r.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `pedido_stock_${conteoId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }

  const f = proyeccion?.factores;
  const p = proyeccion?.parametros;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Stock inteligente · Pedido sugerido
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Calculá qué variedades pedir a Entre Dos según tu venta real, estacionalidad y stock actual.
        </p>
      </div>

      {/* Config bar */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        {/* Local */}
        <div className="flex flex-col gap-1.5 min-w-44">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Local</label>
          <select
            value={localId || ''}
            onChange={e => setLocalId(Number(e.target.value))}
            className="border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {locales.map(l => (
              <option key={l.id} value={l.id}>{localShort(l.nombre)}</option>
            ))}
          </select>
        </div>

        {/* Días */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Días a cubrir</label>
          <select
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {[3, 7, 10, 14].map(d => <option key={d} value={d}>{d} días</option>)}
          </select>
        </div>

        {/* Situación */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Situación</label>
          <select
            value={situacion}
            onChange={e => setSituacion(e.target.value)}
            className="border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="normal">Normal ×1.0</option>
            <option value="sube">Sube ×1.2</option>
            <option value="finde_largo">Finde largo ×1.6</option>
          </select>
        </div>

        {/* Unidad toggle */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Cargar en</label>
          <div className="flex rounded-xl border border-stone-200 overflow-hidden">
            {['bultos', 'docenas'].map(u => (
              <button
                key={u}
                onClick={() => handleUnidad(u)}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  unidad === u
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-stone-600 hover:bg-violet-50'
                }`}
              >
                {u.charAt(0).toUpperCase() + u.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Context line */}
      {!loadingProy && proyeccion && f && p && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-500">
          <span>
            Proyección hacia{' '}
            <strong className="text-stone-700">{MESES_NOMBRES[p.mes_objetivo - 1]}</strong>
            {' · '}velocidad base{' '}
            <strong className="text-stone-700">{f.velocidad_base_semanal} doc/sem</strong>
            {' · '}estacional{' '}
            <strong className="text-stone-700">×{f.factor_estacional}</strong>
            {' · '}tendencia{' '}
            <strong className="text-stone-700">×0.97</strong>
          </span>
          {f.fuente_velocidad === 'red' && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
              usando velocidad promedio de la red
            </span>
          )}
          <button
            onClick={() => setModalOpen(true)}
            className="text-violet-600 font-semibold hover:underline flex-shrink-0"
          >
            ¿Cómo se calcula? →
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl p-5 text-white" style={{ background: '#4C1D95' }}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">Demanda proyectada</p>
          <p className="text-3xl font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {loadingProy ? '…' : fmtDoc(proyeccion?.demanda_total_doc ?? 0)}
          </p>
          <p className="text-xs opacity-60 mt-1">docenas totales</p>
        </div>
        <div className="card p-5 border border-stone-100">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Stock actual</p>
          <p className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {fmtDoc(stockTotalDoc)}
          </p>
          <p className="text-xs text-stone-400 mt-1">docenas contadas</p>
        </div>
        <div className="card p-5 border border-stone-100">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">A pedir</p>
          <p className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {aPedirTotalBultos}
          </p>
          <p className="text-xs text-stone-400 mt-1">bultos totales</p>
        </div>
      </div>

      {/* Main table */}
      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Conteo y pedido por sabor
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Ingresá el stock actual en {unidad}. El pedido sugerido se actualiza en tiempo real.
          </p>
        </div>

        {loadingProy ? (
          <div className="px-5 pb-5 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-y border-stone-100">
                <tr>
                  <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Sabor</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Mix %</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Demanda (doc)</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">
                    Stock ({unidad})
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">A pedir (bultos)</th>
                  <th className="text-center py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Alerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {calcRows.map(row => (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      row.alerta === 'quiebre' ? 'bg-red-50/50 hover:bg-red-50'
                      : row.alerta === 'bajo'  ? 'bg-amber-50/50 hover:bg-amber-50'
                      : 'hover:bg-stone-50'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-stone-800 whitespace-nowrap">{row.nombre}</td>
                    <td className="text-right py-2.5 px-4 text-stone-500 tabular-nums">{row.mix_pct}%</td>
                    <td className="text-right py-2.5 px-4 font-semibold text-violet-700 tabular-nums">
                      {fmtDoc(row.demanda_doc)}
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <input
                        type="number"
                        min="0"
                        step={unidad === 'bultos' ? 1 : 0.5}
                        value={conteos[row.id] ?? ''}
                        onChange={e => handleConteo(row.id, e.target.value)}
                        placeholder="0"
                        className="w-20 text-right border border-stone-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                      />
                    </td>
                    <td className="text-right py-2.5 px-4 font-semibold text-stone-800 tabular-nums">
                      {row.a_pedir_bultos > 0 ? row.a_pedir_bultos : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-center py-2.5 px-4">
                      <AlertaBadge alerta={row.alerta} />
                    </td>
                  </tr>
                ))}
              </tbody>
              {calcRows.length > 0 && (
                <tfoot className="bg-violet-50 border-t-2 border-violet-100">
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-violet-900" colSpan={2}>Total</td>
                    <td className="py-2.5 px-4 text-right font-bold text-violet-900 tabular-nums">
                      {fmtDoc(proyeccion?.demanda_total_doc ?? 0)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold text-stone-600 tabular-nums">
                      {fmtDoc(stockTotalDoc)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-violet-900 tabular-nums">
                      {aPedirTotalBultos}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 justify-end">
        {submitOk && (
          <span className="text-xs text-emerald-600 font-semibold">
            ✓ Pedido guardado — ahora podés exportar
          </span>
        )}
        <button
          onClick={calcularPedido}
          disabled={submitting || loadingProy || !proyeccion}
          className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: submitting ? '#7C3AED' : '#4C1D95' }}
          onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#6D28D9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = submitting ? '#7C3AED' : '#4C1D95'; }}
        >
          {submitting ? 'Guardando…' : 'Calcular pedido'}
        </button>
        <button
          onClick={exportarCsv}
          disabled={!conteoId}
          className="px-5 py-2.5 rounded-xl bg-stone-100 text-stone-700 font-semibold text-sm hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ↓ Exportar CSV
        </button>
      </div>

      {/* Modal */}
      {modalOpen && proyeccion && (
        <ComoSeCalculaModal
          proyeccion={proyeccion}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
