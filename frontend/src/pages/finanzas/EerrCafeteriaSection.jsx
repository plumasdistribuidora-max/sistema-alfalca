import { useEffect, useState } from 'react';
import api from '../../api';
import { fmtARS, fmtPct } from '../red/redUtils';
import { FiscalDesglose } from './EerrTablas';

const MESES_FULL = {
  '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
  '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
  '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
};

const CMV_WARN_THRESHOLD = 60;

const CS = {
  venta:     { bg: '#f0fdf4', border: '#bbf7d0', title: '#14532d', sub: '#166534' },
  cmv:       { bg: '#fffbeb', border: '#fde68a', title: '#78350f', sub: '#b45309' },
  margen:    { bg: '#fafaf9', border: '#e7e5e4', title: '#1c1917', sub: '#78716c' },
  gastos:    { bg: '#f4f4f2', border: '#dcdbd6', title: '#3b0764', sub: '#55585c' },
  ebitda:    { bg: '#f0fdf4', border: '#86efac', title: '#14532d', sub: '#166534' },
  impuestos: { bg: '#f4f4f2', border: '#dcdbd6', title: '#3b0764', sub: '#55585c' },
  resultado: { bg: '#16a34a', border: '#16a34a', title: '#ffffff', sub: 'rgba(255,255,255,0.7)' },
};

const fmt$ = v => fmtARS(Math.round(Number(v) || 0));
const fmtP = v => fmtPct(Number(v) || 0);

function mesLabel(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return `${MESES_FULL[m] || m} ${y}`;
}

function CascadeCard({ title, subtitle, value, pct, onClick, sk }) {
  const s = CS[sk];
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl px-5 py-4 flex items-center justify-between gap-4 transition-opacity hover:opacity-90 active:opacity-80"
      style={{ background: s.bg, border: `1.5px solid ${s.border}` }}
    >
      <div className="min-w-0">
        <p className="font-semibold text-sm" style={{ color: s.title }}>{title}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: s.sub }}>{subtitle}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xl font-bold" style={{ color: s.title }}>{fmt$(value)}</p>
        <p className="text-xs" style={{ color: s.sub }}>{fmtP(pct)} de ventas</p>
      </div>
    </button>
  );
}

function Connector({ sign }) {
  return (
    <div className="flex flex-col items-center my-0.5" style={{ pointerEvents: 'none' }}>
      <div style={{ width: 1, height: 10, background: '#d4d4d0' }} />
      <span style={{ fontSize: 16, fontWeight: 700, color: '#a8a29e', lineHeight: 1, padding: '2px 0' }}>{sign}</span>
      <div style={{ width: 1, height: 10, background: '#d4d4d0' }} />
    </div>
  );
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

// ── Componente principal ───────────────────────────────────────────────────────

export default function EerrCafeteriaSection({ localId, mes }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [openModal,  setOpenModal]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [editGastos, setEditGastos] = useState({ bloques: [] });

  useEffect(() => {
    if (!localId || !mes) return;
    setLoading(true);
    setData(null);
    api.get('/red/eerr/cafeteria', { params: { local_id: localId, mes } })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
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

  const ventaSubtitle = [
    ...data.rubros.slice(0, 2).map(r => `${r.rubro} ${Math.round(r.pct_venta)}%`),
    ...(data.desglose_fiscal?.tiene_fiscal ? ['facturado sin IVA'] : []),
  ].join(' · ');

  const gastosSubtitle = data.gastos_cargados
    ? (data.gastos_bloques || []).flatMap(b => b.conceptos || []).filter(c => c.monto > 0).slice(0, 3).map(c => c.nombre).join(' · ')
    : 'Sin cargar · tocá para cargarlos';

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

      {/* Cascada */}
      <div className="card p-4 mt-4">
        <CascadeCard
          title="Venta Neta" subtitle={ventaSubtitle}
          value={data.venta_neta} pct={100}
          onClick={() => setOpenModal('venta')} sk="venta"
        />
        <Connector sign="−" />
        <CascadeCard
          title="CMV"
          subtitle={`CMV pond. ${fmtP(data.cmv_ponderado_pct)} · click para editar %`}
          value={data.cmv_total} pct={data.pcts.cmv}
          onClick={() => setOpenModal('cmv')} sk="cmv"
        />
        <Connector sign="=" />
        <CascadeCard
          title="Margen Bruto" subtitle="Venta Neta − CMV"
          value={data.margen_bruto} pct={data.pcts.margen_bruto}
          onClick={() => {}} sk="margen"
        />
        <Connector sign="−" />
        <CascadeCard
          title="Gastos Operativos" subtitle={gastosSubtitle}
          value={data.total_gastos} pct={data.pcts.gastos}
          onClick={openGastos} sk="gastos"
        />
        <Connector sign="=" />
        <CascadeCard
          title="EBITDA" subtitle="Margen Bruto − Gastos"
          value={data.ebitda} pct={data.pcts.ebitda}
          onClick={() => {}} sk="ebitda"
        />
        <Connector sign="−" />
        <CascadeCard
          title="Impuestos y Fee Marca"
          subtitle={`IIBB ${data.impuestos.iibb_pct}% de la venta · Imp. ${data.impuestos.imp_gen_pct}% y Fee ${data.impuestos.fee_marca_pct}% del EBITDA`}
          value={data.impuestos.total} pct={data.pcts.impuestos}
          onClick={() => setOpenModal('impuestos')} sk="impuestos"
        />
        <Connector sign="=" />
        <CascadeCard
          title="Resultado Neto" subtitle="EBITDA − Impuestos"
          value={data.resultado_neto} pct={data.pcts.resultado_neto}
          onClick={() => {}} sk="resultado"
        />
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
