import { useEffect, useState } from 'react';
import api from '../../api';
import { fmtARS, fmtPct } from '../red/redUtils';
import { AvisoPlanilla, EstadoResultados, FiscalDesglose, filasHistorico, filasVentaBruta } from './EerrTablas';

const MESES_FULL = {
  '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
  '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
  '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
};

const CMV_WARN_THRESHOLD = 60;

const fmt$ = v => fmtARS(Math.round(Number(v) || 0));
const fmtP = v => fmtPct(Number(v) || 0);

function mesLabel(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return `${MESES_FULL[m] || m} ${y}`;
}

function ModalShell({ title, onClose, onSave, saving, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">{children}</div>
        {onSave && (
          <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
            <button onClick={onSave} disabled={saving}
              className="w-full py-2.5 rounded-xl font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#45484c' }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Popup: Venta Neta por rubro ────────────────────────────────────────────────

function VentaModal({ data, onClose }) {
  return (
    <ModalShell title={`Venta Neta · ${mesLabel(data.mes)}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="text-stone-400 text-xs mb-3">Por rubro de Fudo, en proporción a lo que vendió cada uno</p>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2 bg-stone-50 text-xs text-stone-400 font-semibold border-b border-stone-100">
            <span>Rubro</span><span className="text-right">Venta</span><span className="text-right">%</span>
          </div>
          {data.rubros.map(r => (
            <div key={r.rubro} className="grid grid-cols-3 items-center px-4 py-3 border-b border-stone-50 last:border-0">
              <span className="font-medium text-stone-700">{r.rubro}</span>
              <span className="text-right text-stone-600">{fmt$(r.venta)}</span>
              <span className="text-right text-stone-400">{fmtP(r.pct_venta)}</span>
            </div>
          ))}
          <div className="grid grid-cols-3 items-center px-4 py-3 bg-green-50">
            <span className="font-bold text-green-800">Total Venta Neta</span>
            <span className="text-right font-bold text-green-800 text-base">{fmt$(data.venta_neta)}</span>
            <span className="text-right font-bold text-green-700">100%</span>
          </div>
        </div>
        <FiscalDesglose df={data.desglose_fiscal} />
      </div>
    </ModalShell>
  );
}

// ── Popup: CMV editable ────────────────────────────────────────────────────────

function CmvModal({ data, onClose, onSaved, localId }) {
  const [pcts,   setPcts]   = useState(() =>
    Object.fromEntries(data.rubros.map(r => [r.rubro, r.cmv_pct == null ? '' : String(r.cmv_pct)]))
  );
  const [saving, setSaving] = useState(false);

  const desglose = data.rubros.map(r => {
    const vacio = pcts[r.rubro] === '';
    const pct   = parseFloat(pcts[r.rubro]) || 0;
    return { ...r, vacio, pct, costo: Math.round(r.venta * pct / 100) };
  });
  const totalVenta = desglose.reduce((s, r) => s + r.venta, 0);
  const totalCosto = desglose.reduce((s, r) => s + r.costo, 0);
  const ponderado  = totalVenta > 0 ? Math.round(totalCosto / totalVenta * 1000) / 10 : 0;

  async function save() {
    setSaving(true);
    try {
      const categorias = Object.fromEntries(
        Object.entries(pcts).filter(([, v]) => v !== '').map(([k, v]) => [k, parseFloat(v) || 0])
      );
      await api.post('/red/eerr/cafeteria/cmv', { local_id: localId, mes: data.mes, categorias });
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Error al guardar CMV.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`CMV · ${mesLabel(data.mes)}`} onClose={onClose} onSave={save} saving={saving}>
      <div className="space-y-3 text-sm">
        <p className="text-stone-400 text-xs mb-2">% de costo de cada rubro. Lo que guardes acá sigue valiendo los meses siguientes hasta que lo cambies.</p>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          <div className="grid grid-cols-4 px-4 py-2 bg-stone-50 text-xs text-stone-400 font-semibold border-b border-stone-100">
            <span>Rubro</span>
            <span className="text-right">Venta</span>
            <span className="text-right">CMV %</span>
            <span className="text-right">Costo</span>
          </div>
          {desglose.map(row => {
            const warn = row.pct > CMV_WARN_THRESHOLD;
            return (
              <div key={row.rubro} className={`grid grid-cols-4 items-center px-4 py-3 border-b border-stone-50 last:border-0 ${row.vacio ? 'bg-amber-50' : warn ? 'bg-red-50' : ''}`}>
                <span className={`font-medium ${row.vacio ? 'text-amber-700' : warn ? 'text-red-700' : 'text-stone-700'}`}>{row.rubro}</span>
                <span className="text-right text-stone-500">{fmt$(row.venta)}</span>
                <div className="flex items-center justify-end gap-1">
                  <input
                    type="number" min="0" max="100" step="0.5" placeholder="—"
                    value={pcts[row.rubro]}
                    onChange={e => setPcts(p => ({ ...p, [row.rubro]: e.target.value }))}
                    className={`w-16 text-right rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 ${row.vacio ? 'border-amber-300 bg-white' : warn ? 'border-red-300 bg-red-50' : 'border-stone-200'}`}
                  />
                  <span className="text-stone-400 text-xs">%</span>
                </div>
                <span className={`text-right font-medium ${warn ? 'text-red-600' : 'text-amber-700'}`}>{fmt$(row.costo)}</span>
              </div>
            );
          })}
          <div className="grid grid-cols-4 items-center px-4 py-3 bg-amber-50">
            <span className="font-bold text-amber-800">TOTAL</span>
            <span className="text-right font-semibold text-amber-700">{fmt$(totalVenta)}</span>
            <span className="text-right font-bold text-amber-800">{fmtP(ponderado)} pond.</span>
            <span className="text-right font-bold text-amber-800">{fmt$(totalCosto)}</span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Popup: Gastos operativos ───────────────────────────────────────────────────

function GastosModal({ ventaNeta, editGastos, setEditGastos, onClose, onSave, saving }) {
  const totalGeneral = (editGastos.bloques || []).reduce(
    (s, b) => s + (b.conceptos || []).reduce((ss, c) => ss + (parseFloat(c.monto) || 0), 0), 0
  );

  function updMonto(bi, ci, val) {
    setEditGastos(prev => ({
      bloques: prev.bloques.map((b, i) =>
        i !== bi ? b : { ...b, conceptos: b.conceptos.map((c, j) => j !== ci ? c : { ...c, monto: val }) }
      ),
    }));
  }
  function updNombre(bi, ci, val) {
    setEditGastos(prev => ({
      bloques: prev.bloques.map((b, i) =>
        i !== bi ? b : { ...b, conceptos: b.conceptos.map((c, j) => j !== ci ? c : { ...c, nombre: val }) }
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
    <ModalShell title="Gastos Operativos" onClose={onClose} onSave={onSave} saving={saving}>
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
                  <button onClick={() => addRow(bi)} className="text-violet-600 hover:text-violet-800 text-xs font-semibold">+ Agregar fila</button>
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
            <span className="ml-2 text-xs text-violet-500">{fmtP(ventaNeta > 0 ? totalGeneral / ventaNeta * 100 : 0)}</span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Popup: Impuestos y fee marca ───────────────────────────────────────────────

function ImpuestosModal({ ventaNeta, ebitda, impuestosData, onClose, onSaved, localId, mes }) {
  const [edit,   setEdit]   = useState({
    iibb_pct:      String(impuestosData?.iibb_pct      ?? 3),
    imp_gen_pct:   String(impuestosData?.imp_gen_pct   ?? 0),
    fee_marca_pct: String(impuestosData?.fee_marca_pct ?? 0),
  });
  const [saving, setSaving] = useState(false);

  const ebitda_base = Math.max(ebitda, 0);
  // IIBB se paga sobre la venta; el resto, sobre el EBITDA.
  const items = [
    { key: 'iibb_pct',      label: 'Ingresos Brutos',     base: ventaNeta,   sobre: 'de la venta' },
    { key: 'imp_gen_pct',   label: 'Impuestos generales', base: ebitda_base, sobre: 'del EBITDA' },
    { key: 'fee_marca_pct', label: 'Fee Marca',           base: ebitda_base, sobre: 'del EBITDA' },
  ];
  const monto      = it => Math.round(it.base * (parseFloat(edit[it.key]) || 0) / 100);
  const totalMonto = items.reduce((s, it) => s + monto(it), 0);

  async function save() {
    setSaving(true);
    try {
      await api.post('/red/eerr/cafeteria/impuestos', {
        local_id: localId, mes,
        iibb_pct:      parseFloat(edit.iibb_pct)      || 0,
        imp_gen_pct:   parseFloat(edit.imp_gen_pct)   || 0,
        fee_marca_pct: parseFloat(edit.fee_marca_pct) || 0,
      });
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Error al guardar impuestos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Impuestos y Fee · ${mesLabel(mes)}`} onClose={onClose} onSave={save} saving={saving}>
      <div className="text-sm space-y-3">
        <p className="text-stone-400 text-xs">Venta neta {fmt$(ventaNeta)} · EBITDA {fmt$(ebitda_base)}</p>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          {items.map((item, i) => {
            return (
              <div key={item.key} className={`flex items-center justify-between px-4 py-3 border-b border-stone-50 ${i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}`}>
                <span className="flex-1">
                  <span className="font-medium text-stone-700">{item.label}</span>
                  <span className="block text-xs text-stone-400">% {item.sobre}</span>
                </span>
                <span className="text-stone-400 text-xs w-24 text-right mr-3">{fmt$(monto(item))}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={edit[item.key]}
                    onChange={e => setEdit(p => ({ ...p, [item.key]: e.target.value }))}
                    className="w-16 text-right rounded-lg border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <span className="text-stone-400 text-xs">%</span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-50">
            <span className="font-bold text-violet-900">Total</span>

            <span className="font-bold text-violet-900 text-base">{fmt$(totalMonto)}</span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// Las filas del estado de resultados del Café en un mes.
function filasCafe(d, abrir, abrirGastos) {
  const gastos = (d.gastos_bloques || []).flatMap(bl => bl.conceptos || []);
  const sinGastos = !d.gastos_cargados;
  const imp = d.impuestos;
  return [
    ...filasVentaBruta(d.desglose_fiscal),
    { tipo: 'sub', label: 'Venta neta', actual: d.venta_neta, onEditar: () => abrir('venta'), accion: 'Ver detalle' },
    ...d.rubros.map(r => ({ tipo: 'det', label: r.rubro, actual: r.venta })),
    { tipo: 'grp', label: 'Costo de mercadería', actual: d.cmv_total, costo: true, onEditar: () => abrir('cmv') },
    ...d.rubros.map(r => ({
      tipo: 'det',
      label: r.cmv_pct == null ? <>{r.rubro} · <span className="text-amber-600 font-semibold">sin %</span></> : `${r.rubro} · ${r.cmv_pct}%`,
      texto: r.cmv_pct == null ? `${r.rubro} · sin %` : undefined,
      actual: r.costo, costo: true,
    })),
    { tipo: 'sub', label: 'Margen bruto', actual: d.margen_bruto },
    { tipo: 'grp', label: 'Gastos operativos', actual: d.total_gastos, costo: true, sinCargar: sinGastos, onEditar: abrirGastos },
    ...(sinGastos ? [] : gastos.filter(c => Number(c.monto) > 0).map(c => (
      { tipo: 'det', label: c.nombre, actual: Number(c.monto) || 0, costo: true }
    ))),
    { tipo: 'sub', label: 'EBITDA', actual: d.ebitda, incompleto: sinGastos },
    { tipo: 'grp', label: 'Impuestos', actual: imp.total, costo: true, onEditar: () => abrir('impuestos') },
    { tipo: 'det', label: `Ingresos brutos · ${imp.iibb_pct}% de la venta`, actual: imp.iibb, costo: true },
    ...(imp.imp_gen_pct ? [{ tipo: 'det', label: `Impuestos generales · ${imp.imp_gen_pct}% del EBITDA`, actual: imp.imp_gen, costo: true }] : []),
    ...(imp.fee_marca_pct ? [{ tipo: 'det', label: `Fee de marca · ${imp.fee_marca_pct}% del EBITDA`, actual: imp.fee_marca, costo: true }] : []),
    { tipo: 'fin', label: 'Resultado neto', actual: d.resultado_neto, incompleto: sinGastos },
  ];
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function EerrCafeteriaSection({ localId, mes }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [openModal,  setOpenModal]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [editGastos, setEditGastos] = useState({ bloques: [] });

  useEffect(() => {
    if (!localId || !mes) return;
    // Si cambian el mes mientras carga, la respuesta vieja se descarta: si no, podía
    // llegar después y mostrar otro mes con el título del elegido.
    let vigente = true;
    setLoading(true);
    setData(null);
    api.get('/red/eerr/cafeteria', { params: { local_id: localId, mes } })
      .then(r => { if (vigente) setData(r.data.data); })
      .catch(console.error)
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [localId, mes]);

  async function reload() {
    const r = await api.get('/red/eerr/cafeteria', { params: { local_id: localId, mes } });
    setData(r.data.data);
    setOpenModal(null);
  }

  function openGastos() {
    if (!data) return;
    setEditGastos({ bloques: JSON.parse(JSON.stringify(data.gastos_bloques || [])) });
    setOpenModal('gastos');
  }

  async function handleSaveGastos() {
    setSaving(true);
    try {
      const bloques = editGastos.bloques.map(b => ({
        ...b, conceptos: (b.conceptos || []).map(c => ({ ...c, monto: parseFloat(c.monto) || 0 })),
      }));
      await api.post('/red/eerr/cafeteria/gastos', { local_id: localId, mes, gastos: { bloques } });
      await reload();
    } catch (err) {
      console.error(err);
      alert('Error al guardar gastos.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-stone-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (!data) {
    return <div className="card p-8 text-center text-stone-400 mt-4">Sin datos para el período seleccionado.</div>;
  }

  if (data.historico) {
    const filas = filasHistorico(data.historico);
    return (
      <div className="space-y-4">
        <AvisoPlanilla fuente={data.historico.fuente} />
        <EstadoResultados filas={filas} ventaNeta={filas[0].actual} mesLabel={mesLabel(mes)} local="Café Peatonal" aviso={`Tal cual la planilla de Excel. ${data.historico.fuente || ''}`} />
      </div>
    );
  }

  return (
    <>
      {data.rubros_sin_pct.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mt-4">
          <span className="flex-1">
            <strong>Rubros sin % de CMV:</strong> {data.rubros_sin_pct.join(', ')}. Cuentan $ 0 de costo.
          </span>
          <button onClick={() => setOpenModal('cmv')} className="flex-shrink-0 font-semibold text-amber-700 hover:text-amber-900 underline">
            Cargar %
          </button>
        </div>
      )}

      <div className="mt-4">
        <EstadoResultados filas={filasCafe(data, setOpenModal, openGastos)} ventaNeta={data.venta_neta} mesLabel={mesLabel(mes)} local="Café Peatonal" />
      </div>

      {/* Modales */}
      {openModal === 'venta' && (
        <VentaModal data={{ ...data, mes }} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'cmv' && (
        <CmvModal data={{ ...data, mes }} localId={localId} onClose={() => setOpenModal(null)} onSaved={reload} />
      )}
      {openModal === 'gastos' && (
        <GastosModal
          ventaNeta={data.venta_neta}
          editGastos={editGastos}
          setEditGastos={setEditGastos}
          onClose={() => setOpenModal(null)}
          onSave={handleSaveGastos}
          saving={saving}
        />
      )}
      {openModal === 'impuestos' && (
        <ImpuestosModal
          ventaNeta={data.venta_neta}
          ebitda={data.ebitda}
          impuestosData={data.impuestos}
          localId={localId}
          mes={mes}
          onClose={() => setOpenModal(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
