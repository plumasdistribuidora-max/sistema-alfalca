import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { fmtDoc } from '../red/redUtils';
import ComoSeCalculaModal from './ComoSeCalculaModal';
import DetalleCalculoModal from './DetalleCalculoModal';

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

function tiendaShort(nombre) {
  return (nombre || '').replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
}

export default function StockInteligente() {
  const [dias,        setDias]        = useState(7);
  const [situacion,   setSituacion]   = useState('normal');
  const [proyeccion,  setProyeccion]  = useState(null);
  const [loadingProy, setLoadingProy] = useState(false);

  // El stock se carga en docenas, siempre. Se puede cargar el total del grupo de una,
  // o tienda por tienda si se cuenta separado: el pedido que sale es el mismo.
  const [modoConteo, setModoConteo] = useState('junto');   // 'junto' | 'por_tienda'
  const [conteos,    setConteos]    = useState({});        // { variedadId: '12.5' }
  const [porTienda,  setPorTienda]  = useState({});        // { variedadId: { localId: '4' } }

  const [modalOpen,  setModalOpen]  = useState(false);
  const [detalle,    setDetalle]    = useState(null);
  const [conteoId,   setConteoId]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitOk,   setSubmitOk]   = useState(false);

  useEffect(() => {
    setLoadingProy(true);
    setConteoId(null);
    setSubmitOk(false);
    api.get('/stock/proyeccion', { params: { dias, situacion } })
      .then(r => setProyeccion(r.data.data))
      .catch(console.error)
      .finally(() => setLoadingProy(false));
  }, [dias, situacion]);

  const tiendas = proyeccion?.grupo?.tiendas || [];

  // El stock de cada variedad: el número que se escribió, o la suma de las tiendas.
  function stockDe(variedadId) {
    if (modoConteo === 'junto') return parseFloat(conteos[variedadId] ?? '') || 0;
    const fila = porTienda[variedadId] || {};
    return tiendas.reduce((s, t) => s + (parseFloat(fila[t.id] ?? '') || 0), 0);
  }

  const calcRows = useMemo(() => {
    if (!proyeccion) return [];
    return proyeccion.variedades.map(v => {
      const stock_doc      = stockDe(v.id);
      const a_pedir_doc    = Math.max(0, v.demanda_doc - stock_doc);
      const a_pedir_bultos = v.doc_por_bulto > 0 ? Math.ceil(a_pedir_doc / v.doc_por_bulto) : 0;
      let alerta = 'ok';
      if (stock_doc < v.demanda_doc * 0.3)      alerta = 'quiebre';
      else if (stock_doc < v.demanda_doc * 0.6) alerta = 'bajo';
      return { ...v, stock_doc, a_pedir_doc, a_pedir_bultos, alerta };
    });
  }, [proyeccion, conteos, porTienda, modoConteo, tiendas]);

  const stockTotalDoc     = calcRows.reduce((s, r) => s + r.stock_doc, 0);
  const aPedirTotalDoc    = calcRows.reduce((s, r) => s + r.a_pedir_doc, 0);
  const aPedirTotalBultos = calcRows.reduce((s, r) => s + r.a_pedir_bultos, 0);

  function tocar() {
    setSubmitOk(false);
    setConteoId(null);
  }

  function handleConteo(variedadId, value) {
    setConteos(prev => ({ ...prev, [variedadId]: value }));
    tocar();
  }

  function handleConteoTienda(variedadId, localId, value) {
    setPorTienda(prev => ({
      ...prev,
      [variedadId]: { ...(prev[variedadId] || {}), [localId]: value },
    }));
    tocar();
  }

  async function calcularPedido() {
    if (!proyeccion || submitting) return;
    setSubmitting(true);
    setSubmitOk(false);
    try {
      const res = await api.post('/stock/calcular-pedido', {
        dias,
        situacion,
        conteos: calcRows.map(r => ({ variedad_id: r.id, docenas: r.stock_doc })),
        stock_por_tienda: modoConteo === 'por_tienda' ? porTienda : null,
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
      a.download = `pedido_grupo_${conteoId}.csv`;
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
          Stock inteligente · Pedido del grupo
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Un solo pedido a Entre Dos para las {proyeccion?.grupo?.cantidad || ''} tiendas juntas,
          según la venta real, la estacionalidad y el stock que tengas hoy.
        </p>
      </div>

      {/* Config */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Días a cubrir</label>
          <select
            value={dias}
            onChange={e => { setDias(Number(e.target.value)); tocar(); }}
            className="border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {[3, 7, 10, 14].map(d => <option key={d} value={d}>{d} días</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Situación</label>
          <select
            value={situacion}
            onChange={e => { setSituacion(e.target.value); tocar(); }}
            className="border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="normal">Normal ×1.0</option>
            <option value="sube">Sube ×1.2</option>
            <option value="finde_largo">Finde largo ×1.6</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Contar el stock</label>
          <div className="flex rounded-xl border border-stone-200 overflow-hidden">
            {[
              { id: 'junto',      label: 'Todo junto' },
              { id: 'por_tienda', label: 'Tienda por tienda' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => { setModoConteo(m.id); tocar(); }}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  modoConteo === m.id ? 'bg-violet-600 text-white' : 'bg-white text-stone-600 hover:bg-violet-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-stone-400 pb-2">
          Todo en docenas. Los bultos aparecen al final, al armar el pedido.
        </p>
      </div>

      {/* Contexto */}
      {!loadingProy && proyeccion && f && p && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-500">
          <span>
            Proyección hacia{' '}
            <strong className="text-stone-700">{MESES_NOMBRES[p.mes_objetivo - 1]}</strong>
            {' · '}las {proyeccion.grupo.cantidad} tiendas venden{' '}
            <strong className="text-stone-700">{f.velocidad_base_semanal} doc/sem</strong>
            {' · '}estacional{' '}
            <strong className="text-stone-700">×{f.factor_estacional}</strong>
            {' · '}tendencia{' '}
            <strong className="text-stone-700">×{f.factor_tendencia}</strong>
          </span>
          {!f.historia_suficiente && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
              solo {f.semanas_historia} semanas de historia
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
          <p className="text-xs opacity-60 mt-1">docenas del grupo</p>
        </div>
        <div className="card p-5 border border-stone-100">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Stock contado</p>
          <p className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {fmtDoc(stockTotalDoc)}
          </p>
          <p className="text-xs text-stone-400 mt-1">docenas en las tiendas</p>
        </div>
        <div className="card p-5 border border-stone-100">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">A pedir</p>
          <p className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {fmtDoc(aPedirTotalDoc)}
          </p>
          <p className="text-xs text-stone-400 mt-1">
            docenas · <strong className="text-stone-600">{aPedirTotalBultos} bultos</strong>
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Conteo y pedido por sabor
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            {modoConteo === 'junto'
              ? 'Ingresá en docenas el stock de todas las tiendas juntas.'
              : 'Ingresá en docenas lo que hay en cada tienda; el sistema las suma.'}
            {' '}Tocá cualquier fila para ver cómo se llegó a ese número.
          </p>
        </div>

        {loadingProy ? (
          <div className="px-5 pb-5 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-y border-stone-100">
                <tr>
                  <th className="text-left py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Sabor</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Mix %</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Demanda (doc)</th>
                  {modoConteo === 'junto' ? (
                    <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Stock (doc)</th>
                  ) : (
                    <>
                      {tiendas.map(t => (
                        <th key={t.id} className="text-right py-2.5 px-2 text-xs text-stone-400 font-semibold uppercase">
                          {tiendaShort(t.nombre)}
                        </th>
                      ))}
                      <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Stock (doc)</th>
                    </>
                  )}
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">A pedir (doc)</th>
                  <th className="text-right py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Equivale a</th>
                  <th className="text-center py-2.5 px-4 text-xs text-stone-400 font-semibold uppercase">Alerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {calcRows.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setDetalle(row)}
                    className={`cursor-pointer transition-colors ${
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

                    {modoConteo === 'junto' ? (
                      <td className="text-right py-2.5 px-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="number" min="0" step="0.5" placeholder="0"
                          value={conteos[row.id] ?? ''}
                          onChange={e => handleConteo(row.id, e.target.value)}
                          className="w-24 text-right border border-stone-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                        />
                      </td>
                    ) : (
                      <>
                        {tiendas.map(t => (
                          <td key={t.id} className="text-right py-2.5 px-2" onClick={e => e.stopPropagation()}>
                            <input
                              type="number" min="0" step="0.5" placeholder="0"
                              value={porTienda[row.id]?.[t.id] ?? ''}
                              onChange={e => handleConteoTienda(row.id, t.id, e.target.value)}
                              className="w-16 text-right border border-stone-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                            />
                          </td>
                        ))}
                        <td className="text-right py-2.5 px-4 font-medium text-stone-600 tabular-nums">
                          {fmtDoc(row.stock_doc)}
                        </td>
                      </>
                    )}

                    <td className="text-right py-2.5 px-4 font-bold text-stone-900 tabular-nums">
                      {row.a_pedir_doc > 0 ? fmtDoc(row.a_pedir_doc) : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-4 text-stone-600 tabular-nums whitespace-nowrap">
                      {row.a_pedir_bultos > 0
                        ? <>{row.a_pedir_bultos} <span className="text-xs text-stone-400">bulto{row.a_pedir_bultos === 1 ? '' : 's'}</span></>
                        : <span className="text-stone-300">—</span>}
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
                    {modoConteo === 'por_tienda' && tiendas.map(t => (
                      <td key={t.id} className="py-2.5 px-2 text-right text-xs text-violet-900 tabular-nums">
                        {fmtDoc(calcRows.reduce((s, r) => s + (parseFloat(porTienda[r.id]?.[t.id] ?? '') || 0), 0))}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-semibold text-stone-600 tabular-nums">
                      {fmtDoc(stockTotalDoc)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-violet-900 tabular-nums">
                      {fmtDoc(aPedirTotalDoc)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-violet-900 tabular-nums whitespace-nowrap">
                      {aPedirTotalBultos} <span className="text-xs font-semibold">bultos</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Acciones */}
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
        >
          {submitting ? 'Guardando…' : 'Guardar el pedido'}
        </button>
        <button
          onClick={exportarCsv}
          disabled={!conteoId}
          className="px-5 py-2.5 rounded-xl bg-stone-100 text-stone-700 font-semibold text-sm hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ↓ Exportar CSV
        </button>
      </div>

      {modalOpen && proyeccion && (
        <ComoSeCalculaModal proyeccion={proyeccion} onClose={() => setModalOpen(false)} />
      )}
      {detalle && proyeccion && (
        <DetalleCalculoModal
          fila={detalle} proyeccion={proyeccion} dias={dias} situacion={situacion}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
