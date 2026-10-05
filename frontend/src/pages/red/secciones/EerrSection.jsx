import { useEffect, useState } from 'react';
import api from '../../../api';
import { fmtARS, fmtPct, shortName } from '../redUtils';
import EerrCafeteriaSection from '../../finanzas/EerrCafeteriaSection';
import { AvisoPlanilla, EerrRed, EerrAnio, EstadoResultados, FiscalDesglose, filasHistorico, filasVentaBruta, mesEnCurso } from '../../finanzas/EerrTablas';

// ── Constantes ────────────────────────────────────────────────────────────────

const MESES_FULL = {
  '01': 'Enero',   '02': 'Febrero', '03': 'Marzo',    '04': 'Abril',
  '05': 'Mayo',    '06': 'Junio',   '07': 'Julio',    '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};

// Desde septiembre 2023, el primer mes con estado de resultados (las planillas de Amigorena).
function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; ; i++) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (d < new Date(2023, 8, 1)) break;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    opts.push({ value: `${d.getFullYear()}-${mm}`, label: `${MESES_FULL[mm]} ${d.getFullYear()}` });
  }
  return opts;
}
const MONTH_OPTIONS = getMonthOptions();
const ANIOS = [...new Set(MONTH_OPTIONS.map(o => Number(o.value.slice(0, 4))))];

function mesLabel(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return `${MESES_FULL[m] || m} ${y}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (v) => fmtARS(Math.round(Number(v) || 0));
const fmtP = (v) => fmtPct(Number(v) || 0);

function ModalShell({ title, onClose, onSave, saving, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600"
          >✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {onSave && (
          <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full py-2.5 rounded-xl font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#45484c' }}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormulaRows({ rows }) {
  return (
    <div className="rounded-xl overflow-hidden border border-stone-100 text-sm">
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-4 py-3 border-b border-stone-50 last:border-0"
          style={{ background: r.highlight ? '#f4f4f2' : i % 2 === 0 ? '#fff' : '#fafaf9' }}
        >
          <span style={{ fontWeight: r.highlight ? 700 : 500, color: r.highlight ? '#3b0764' : '#44403c' }}>
            {r.label}
          </span>
          <div className="text-right">
            <span style={{ fontWeight: 700, color: r.highlight ? '#3b0764' : '#1c1917' }}>{fmt$(r.value)}</span>
            <span className="ml-2 text-xs" style={{ color: r.highlight ? '#55585c' : '#a8a29e' }}>{fmtP(r.pct)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CMVContent({ ventaNeta, editCmv, setEditCmv }) {
  const venta_e2   = ventaNeta * 0.90;
  const venta_alim = ventaNeta * 0.10;
  const cmv_e2     = venta_e2   * (parseFloat(editCmv.e2)   || 0) / 100;
  const cmv_alim   = venta_alim * (parseFloat(editCmv.alim) || 0) / 100;
  const cmv_total  = cmv_e2 + cmv_alim;

  return (
    <div className="space-y-4 text-sm">
      {[
        { label: 'Entre Dos', venta: venta_e2,   key: 'e2',   cmv: cmv_e2 },
        { label: 'Alimendos', venta: venta_alim, key: 'alim', cmv: cmv_alim },
      ].map(row => (
        <div key={row.key} className="rounded-xl border border-stone-100 p-4 space-y-2.5">
          <p className="font-semibold text-stone-700">{row.label}</p>
          <div className="flex items-center justify-between text-stone-500">
            <span>Venta</span><span className="font-medium text-stone-900">{fmt$(row.venta)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-stone-500">% CMV</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="0" max="100" step="0.5"
                value={editCmv[row.key]}
                onChange={e => setEditCmv(p => ({ ...p, [row.key]: e.target.value }))}
                className="w-20 text-right rounded-lg border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <span className="text-stone-400">%</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-stone-100">
            <span className="font-medium text-stone-700">CMV resultante</span>
            <span className="font-bold text-amber-700">{fmt$(row.cmv)}</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
        <span className="font-bold text-amber-800">Total CMV</span>
        <div className="text-right">
          <span className="font-bold text-amber-800 text-base">{fmt$(cmv_total)}</span>
          <span className="ml-2 text-xs text-amber-600">
            {fmtP(ventaNeta > 0 ? cmv_total / ventaNeta * 100 : 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

function GastosContent({ ventaNeta, editGastos, setEditGastos }) {
  const totalGeneral = (editGastos.bloques || []).reduce(
    (s, b) => s + (b.conceptos || []).reduce((ss, c) => ss + (parseFloat(c.monto) || 0), 0), 0
  );

  function updMonto(bi, ci, val) {
    setEditGastos(prev => ({
      bloques: prev.bloques.map((b, i) =>
        i !== bi ? b : {
          ...b,
          conceptos: b.conceptos.map((c, j) => j !== ci ? c : { ...c, monto: val }),
        }
      ),
    }));
  }

  function updNombre(bi, ci, val) {
    setEditGastos(prev => ({
      bloques: prev.bloques.map((b, i) =>
        i !== bi ? b : {
          ...b,
          conceptos: b.conceptos.map((c, j) => j !== ci ? c : { ...c, nombre: val }),
        }
      ),
    }));
  }

  function addRow(bi) {
    setEditGastos(prev => ({
      bloques: prev.bloques.map((b, i) =>
        i !== bi ? b : { ...b, conceptos: [...b.conceptos, { nombre: '', monto: 0 }] }
      ),
    }));
  }

  function removeRow(bi, ci) {
    setEditGastos(prev => ({
      bloques: prev.bloques.map((b, i) =>
        i !== bi ? b : { ...b, conceptos: b.conceptos.filter((_, j) => j !== ci) }
      ),
    }));
  }

  return (
    <div className="space-y-5 text-sm">
      {(editGastos.bloques || []).map((bloque, bi) => {
        const subtotal = (bloque.conceptos || []).reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
        return (
          <div key={bi}>
            <p className="font-bold text-stone-700 mb-2">{bloque.nombre}</p>
            <div className="rounded-xl border border-stone-100 overflow-hidden">
              {(bloque.conceptos || []).map((c, ci) => {
                const pctG = ventaNeta > 0 ? (parseFloat(c.monto) || 0) / ventaNeta * 100 : 0;
                return (
                  <div key={ci} className="flex items-center gap-2 px-3 py-2 border-b border-stone-50">
                    <input
                      type="text" value={c.nombre} placeholder="Concepto"
                      onChange={e => updNombre(bi, ci, e.target.value)}
                      className="flex-1 rounded-lg border border-stone-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 bg-stone-50"
                    />
                    <input
                      type="number" value={c.monto} min="0" placeholder="0"
                      onChange={e => updMonto(bi, ci, e.target.value)}
                      className="w-28 text-right rounded-lg border border-stone-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <span className="text-stone-400 text-xs w-10 text-right">{fmtP(pctG)}</span>
                    <button onClick={() => removeRow(bi, ci)} className="text-stone-300 hover:text-red-400 text-sm leading-none flex-shrink-0">✕</button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-3 py-2.5 bg-stone-50">
                <button onClick={() => addRow(bi)} className="text-violet-600 hover:text-violet-800 text-xs font-semibold">
                  + Agregar fila
                </button>
                <span className="text-xs font-bold text-stone-600">Subtotal: {fmt$(subtotal)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-violet-50 border border-violet-200">
        <span className="font-bold text-violet-900">Total Gastos</span>
        <div className="text-right">
          <span className="font-bold text-violet-900 text-base">{fmt$(totalGeneral)}</span>
          <span className="ml-2 text-xs text-violet-500">
            {fmtP(ventaNeta > 0 ? totalGeneral / ventaNeta * 100 : 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImpuestosContent({ ventaNeta, editImp, setEditImp }) {
  const iibb      = parseFloat(editImp.iibb)     || 0;
  const n931      = parseFloat(editImp.n931)      || 0;
  const ganancias = parseFloat(editImp.ganancias) || 0;
  const total     = iibb + n931 + ganancias;

  const items = [
    { label: 'IIBB',      key: 'iibb',      val: iibb },
    { label: '931',       key: 'n931',      val: n931 },
    { label: 'Ganancias', key: 'ganancias', val: ganancias },
  ];

  return (
    <div className="text-sm">
      <div className="rounded-xl border border-stone-100 overflow-hidden">
        {items.map((item, i) => (
          <div key={item.key} className={`flex items-center justify-between px-4 py-3 border-b border-stone-50 ${i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}`}>
            <span className="font-medium text-stone-700">{item.label}</span>
            <div className="flex items-center gap-3">
              <span className="text-stone-400 text-xs w-12 text-right">
                {fmtP(ventaNeta > 0 ? item.val / ventaNeta * 100 : 0)}
              </span>
              <input
                type="number" value={editImp[item.key]} min="0" placeholder="0"
                onChange={e => setEditImp(p => ({ ...p, [item.key]: e.target.value }))}
                className="w-36 text-right rounded-lg border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-violet-50">
          <span className="font-bold text-violet-900">Total</span>
          <div className="text-right">
            <span className="font-bold text-violet-900 text-base">{fmt$(total)}</span>
            <span className="ml-2 text-xs text-violet-500">{fmtP(ventaNeta > 0 ? total / ventaNeta * 100 : 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Las filas del estado de resultados de una tienda en un mes.
function filasTienda(a, abrir) {
  const gastos = (a.gastos_bloques || []).flatMap(bl => bl.conceptos || []);
  const sinGastos = !a.gastos_cargados;
  const sinImp    = !a.impuestos_cargados;
  return [
    ...filasVentaBruta(a.desglose_fiscal),
    { tipo: 'sub', label: 'Venta neta', actual: a.venta_neta, onEditar: () => abrir('venta'), accion: 'Ver detalle' },
    { tipo: 'det', label: 'Entre Dos (90%)', actual: a.venta_e2 },
    { tipo: 'det', label: 'Alimendos (10%)', actual: a.venta_alim },
    { tipo: 'grp', label: 'Costo de mercadería', actual: a.cmv, costo: true, onEditar: () => abrir('cmv') },
    { tipo: 'det', label: `Entre Dos · ${a.cmv_e2_pct}%`, actual: a.venta_e2 * a.cmv_e2_pct / 100, costo: true },
    { tipo: 'det', label: `Alimendos · ${a.cmv_alim_pct}%`, actual: a.venta_alim * a.cmv_alim_pct / 100, costo: true },
    { tipo: 'sub', label: 'Margen bruto', actual: a.margen_bruto },
    { tipo: 'grp', label: 'Gastos operativos', actual: a.total_gastos, costo: true, sinCargar: sinGastos, onEditar: () => abrir('gastos') },
    ...(sinGastos ? [] : gastos.filter(c => Number(c.monto) > 0).map(c => (
      { tipo: 'det', label: c.nombre, actual: Number(c.monto) || 0, costo: true }
    ))),
    { tipo: 'sub', label: 'EBITDA', actual: a.ebitda, incompleto: sinGastos },
    { tipo: 'grp', label: 'Impuestos', actual: a.impuestos.total, costo: true, sinCargar: sinImp, onEditar: () => abrir('impuestos') },
    ...(sinImp ? [] : [
      { tipo: 'det', label: 'Ingresos brutos', actual: a.impuestos.iibb, costo: true },
      { tipo: 'det', label: '931', actual: a.impuestos.novecientos31, costo: true },
      ...(a.impuestos.ganancias ? [{ tipo: 'det', label: 'Ganancias', actual: a.impuestos.ganancias, costo: true }] : []),
    ]),
    { tipo: 'fin', label: 'Resultado neto', actual: a.resultado_neto, incompleto: sinGastos || sinImp },
  ];
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function EerrSection() {
  const [locales,     setLocales]     = useState([]);
  const [selLocal,    setSelLocal]    = useState('');
  const [selMes,      setSelMes]      = useState(MONTH_OPTIONS[0]?.value || '');
  const [vista,       setVista]       = useState('red');
  const [selAnio,     setSelAnio]     = useState(ANIOS[0]);
  const selLocalObj = locales.find(l => String(l.id) === selLocal);
  const esCafeteria = selLocalObj ? !selLocalObj.es_alfajorera : false;
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [openModal, setOpenModal] = useState(null);
  const [saving,    setSaving]    = useState(false);

  const [editCmv, setEditCmv] = useState({ e2: '45', alim: '70' });
  const [editGastos, setEditGastos] = useState({ bloques: [] });
  const [editImp,  setEditImp]  = useState({ iibb: '0', n931: '0', ganancias: '0' });

  // Carga locales al montar
  useEffect(() => {
    api.get('/red/eerr/locales')
      .then(r => {
        const locs = r.data.data || [];
        setLocales(locs);
        if (locs.length > 0 && !selLocal) setSelLocal(String(locs[0].id));
      })
      .catch(console.error);
  }, []);

  // Recarga EERR cuando cambia local o mes (solo para locales alfajoreros)
  useEffect(() => {
    if (vista !== 'local' || !selLocal || !selMes || esCafeteria) return;
    let vigente = true;   // una respuesta de otro local o mes que llega tarde se descarta
    setLoading(true);
    setData(null);
    api.get('/red/eerr', { params: { local_id: selLocal, mes: selMes } })
      .then(r => { if (vigente) setData(r.data.data); })
      .catch(console.error)
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [vista, selLocal, selMes, esCafeteria]);

  function openFor(name) {
    if (!data?.actual) return;
    const a = data.actual;
    if (name === 'cmv') {
      setEditCmv({ e2: String(a.cmv_e2_pct), alim: String(a.cmv_alim_pct) });
    } else if (name === 'gastos') {
      setEditGastos({ bloques: JSON.parse(JSON.stringify(a.gastos_bloques)) });
    } else if (name === 'impuestos') {
      setEditImp({
        iibb:      String(a.impuestos.iibb),
        n931:      String(a.impuestos.novecientos31),
        ganancias: String(a.impuestos.ganancias),
      });
    }
    setOpenModal(name);
  }

  async function saveAndReload(payload) {
    setSaving(true);
    try {
      await api.post('/red/eerr', payload);
      const r = await api.get('/red/eerr', { params: { local_id: selLocal, mes: selMes } });
      setData(r.data.data);
      setOpenModal(null);
    } catch (err) {
      console.error(err);
      alert('Error al guardar. Revisá la consola.');
    } finally {
      setSaving(false);
    }
  }

  function basePayload() {
    const a = data.actual;
    return {
      local_id:     selLocal,
      mes:          selMes,
      cmv_e2_pct:   a.cmv_e2_pct,
      cmv_alim_pct: a.cmv_alim_pct,
      gastos:       { bloques: a.gastos_bloques },
      impuestos:    { iibb: a.impuestos.iibb, novecientos31: a.impuestos.novecientos31, ganancias: a.impuestos.ganancias },
    };
  }

  function handleSaveCmv() {
    saveAndReload({
      ...basePayload(),
      cmv_e2_pct:   parseFloat(editCmv.e2)   || 45,
      cmv_alim_pct: parseFloat(editCmv.alim) || 70,
    });
  }

  function handleSaveGastos() {
    const bloques = editGastos.bloques.map(b => ({
      ...b,
      conceptos: (b.conceptos || []).map(c => ({ ...c, monto: parseFloat(c.monto) || 0 })),
    }));
    saveAndReload({ ...basePayload(), gastos: { bloques } });
  }

  function handleSaveImp() {
    saveAndReload({
      ...basePayload(),
      impuestos: {
        iibb:          parseFloat(editImp.iibb)     || 0,
        novecientos31: parseFloat(editImp.n931)      || 0,
        ganancias:     parseFloat(editImp.ganancias) || 0,
      },
    });
  }

  const a = data?.actual;
  const ml = mesLabel(selMes);

  const curso = mesEnCurso(selMes);

  return (
    <div className="space-y-4">

      {/* ── Selectors ── */}
      <div className="flex flex-wrap gap-3">
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-0.5">
          {[['red', 'Red'], ['local', 'Por local'], ['anio', 'Por año']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setVista(id); setOpenModal(null); }}
              className={`px-3.5 py-1.5 rounded-[10px] text-sm font-semibold transition-colors ${vista === id ? 'text-white' : 'text-stone-500 hover:text-stone-800'}`}
              style={vista === id ? { background: '#45484c' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        {vista !== 'red' && (
          <select
            value={selLocal}
            onChange={e => { setSelLocal(e.target.value); setOpenModal(null); }}
            className="flex-1 min-w-[140px] rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {locales.map(l => (
              <option key={l.id} value={String(l.id)}>{shortName(l.nombre)}</option>
            ))}
          </select>
        )}
        {vista === 'anio' ? (
          <select
            value={selAnio}
            onChange={e => setSelAnio(Number(e.target.value))}
            className="flex-1 min-w-[140px] rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {ANIOS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        ) : (
          <select
            value={selMes}
            onChange={e => { setSelMes(e.target.value); setOpenModal(null); }}
            className="flex-1 min-w-[140px] rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {MONTH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {curso && vista !== 'anio' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <strong>Mes en curso:</strong> lleva {curso.dia} de {curso.dias} días. Los números no son de un mes completo.
        </div>
      )}

      {vista === 'red' && (
        <EerrRed mes={selMes} onAbrirLocal={id => { setSelLocal(String(id)); setVista('local'); }} />
      )}
      {vista === 'anio' && <EerrAnio localId={selLocal} anio={selAnio} />}

      {/* ── Cafetería ── */}
      {vista === 'local' && esCafeteria && selLocal && selMes && (
        <EerrCafeteriaSection localId={selLocal} mes={selMes} />
      )}

      {/* ── Loading (alfajoreras) ── */}
      {vista === 'local' && !esCafeteria && loading && (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-stone-100 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {/* ── Sin datos (alfajoreras) ── */}
      {vista === 'local' && !esCafeteria && !loading && !a && !data?.historico && (
        <div className="card p-8 text-center text-stone-400">Sin datos para el período seleccionado.</div>
      )}

      {/* ── Contenido alfajoreras ── */}
      {vista === 'local' && !esCafeteria && !loading && a && (
        <EstadoResultados filas={filasTienda(a, openFor)} ventaNeta={a.venta_neta} mesLabel={ml} local={shortName(selLocalObj?.nombre || '')} />
      )}
      {vista === 'local' && !esCafeteria && !loading && data?.historico && (
        <>
          <AvisoPlanilla fuente={data.historico.fuente} />
          <EstadoResultados filas={filasHistorico(data.historico)} ventaNeta={filasHistorico(data.historico)[0].actual} mesLabel={ml} local={shortName(selLocalObj?.nombre || '')} aviso={`Tal cual la planilla de Excel. ${data.historico.fuente || ''}`} />
        </>
      )}

      {/* ── Modales ── */}

      {openModal === 'venta' && a && (
        <ModalShell title={`Venta Neta · ${ml}`} onClose={() => setOpenModal(null)}>
          <div className="space-y-1 text-sm">
            <p className="text-stone-400 mb-3">Split fijo por proveedor (no editable)</p>
            <FormulaRows rows={[
              { label: 'Entre Dos (90%)',  value: a.venta_e2,   pct: 90  },
              { label: 'Alimendos (10%)',  value: a.venta_alim, pct: 10  },
              { label: 'Total Venta Neta', value: a.venta_neta, pct: 100, highlight: true },
            ]} />
            <FiscalDesglose df={a.desglose_fiscal} />
          </div>
        </ModalShell>
      )}

      {openModal === 'cmv' && a && (
        <ModalShell title={`CMV · ${ml}`} onClose={() => setOpenModal(null)} onSave={handleSaveCmv} saving={saving}>
          <CMVContent ventaNeta={a.venta_neta} editCmv={editCmv} setEditCmv={setEditCmv} />
        </ModalShell>
      )}


      {openModal === 'gastos' && a && (
        <ModalShell title={`Gastos Operativos · ${ml}`} onClose={() => setOpenModal(null)} onSave={handleSaveGastos} saving={saving}>
          <GastosContent ventaNeta={a.venta_neta} editGastos={editGastos} setEditGastos={setEditGastos} />
        </ModalShell>
      )}


      {openModal === 'impuestos' && a && (
        <ModalShell title={`Impuestos · ${ml}`} onClose={() => setOpenModal(null)} onSave={handleSaveImp} saving={saving}>
          <ImpuestosContent ventaNeta={a.venta_neta} editImp={editImp} setEditImp={setEditImp} />
        </ModalShell>
      )}


    </div>
  );
}
