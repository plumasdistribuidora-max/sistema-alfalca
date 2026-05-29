import { useEffect, useState } from 'react';
import api from '../../api';
import { fmtARS, fmtPct } from '../red/redUtils';

const MESES_FULL = {
  '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
  '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
  '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
};

const CATS = [
  { key: 'cafeteria',      label: 'Cafetería'      },
  { key: 'panificados',    label: 'Panificados'    },
  { key: 'promociones',    label: 'Promociones'    },
  { key: 'menu_almuerzos', label: 'Menú Almuerzos' },
  { key: 'principales',    label: 'Principales'    },
  { key: 'bebidas',        label: 'Bebidas'        },
];

const CMV_WARN_THRESHOLD = 45;

const CS = {
  venta:     { bg: '#f0fdf4', border: '#bbf7d0', title: '#14532d', sub: '#166534' },
  cmv:       { bg: '#fffbeb', border: '#fde68a', title: '#78350f', sub: '#b45309' },
  margen:    { bg: '#fafaf9', border: '#e7e5e4', title: '#1c1917', sub: '#78716c' },
  gastos:    { bg: '#f5f3ff', border: '#ddd6fe', title: '#3b0764', sub: '#6d28d9' },
  ebitda:    { bg: '#f0fdf4', border: '#86efac', title: '#14532d', sub: '#166534' },
  impuestos: { bg: '#f5f3ff', border: '#ddd6fe', title: '#3b0764', sub: '#6d28d9' },
  resultado: { bg: '#16a34a', border: '#16a34a', title: '#ffffff', sub: 'rgba(255,255,255,0.7)' },
};

const fmt$ = v => fmtARS(Math.round(Number(v) || 0));
const fmtP = v => fmtPct(Number(v) || 0);
const fmtU = v => v != null ? `U$D ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

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
              style={{ background: '#4C1D95' }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Popup: Venta Neta por categoría ───────────────────────────────────────────

function FiscalDesglose({ df }) {
  if (!df) return null;
  const { bruto_no_fiscal, bruto_fiscal, neto_fiscal, iva_descontado, tipo_iva,
          pct_fiscal_sobre_total, tiene_fiscal, tiene_datos_fiscales } = df;
  return (
    <div className="mt-4 pt-4 border-t border-stone-100">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">Composición fiscal</p>
      <div className="rounded-xl border border-stone-100 overflow-hidden text-sm">
        <div className="grid grid-cols-3 px-4 py-2 bg-stone-50 text-xs text-stone-400 font-semibold">
          <span>Tipo</span>
          <span className="text-right">Bruto</span>
          <span className="text-right">Neto</span>
        </div>
        <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-stone-50">
          <div>
            <span className="font-medium text-stone-700">No fiscal</span>
            <span className="ml-1.5 text-xs text-stone-400">entra completo</span>
          </div>
          <span className="text-right text-stone-600">{fmt$(bruto_no_fiscal)}</span>
          <span className="text-right font-semibold text-stone-900">{fmt$(bruto_no_fiscal)}</span>
        </div>
        {tiene_fiscal ? (
          <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-stone-50">
            <div>
              <span className="font-medium text-stone-700">Fiscal</span>
              {tipo_iva && <span className="ml-1.5 text-xs text-stone-400">{tipo_iva}</span>}
            </div>
            <span className="text-right text-stone-400 line-through">{fmt$(bruto_fiscal)}</span>
            <span className="text-right font-semibold text-stone-900">
              {tiene_datos_fiscales ? fmt$(neto_fiscal) : '—'}
            </span>
          </div>
        ) : (
          <div className="px-4 py-3 text-xs text-stone-400 italic border-b border-stone-50">
            Sin facturación fiscal en este período
          </div>
        )}
      </div>
      {tiene_fiscal && tiene_datos_fiscales && (
        <div className="mt-2.5 space-y-1.5 px-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-500">% fiscal sobre el total</span>
            <span className="font-semibold text-stone-700">{pct_fiscal_sobre_total}%</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-stone-500">IVA descontado</span>
            <span className="font-semibold text-red-500">−{fmt$(iva_descontado)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function VentaModal({ data, onClose }) {
  const vn = data.venta_neta;
  const top = data.venta_categorias
    .filter(c => c.venta > 0)
    .sort((a, b) => b.venta - a.venta)[0];
  return (
    <ModalShell title={`Venta Neta · ${mesLabel(data.mes)}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="text-stone-400 text-xs mb-3">Desglose por categoría de producto</p>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2 bg-stone-50 text-xs text-stone-400 font-semibold border-b border-stone-100">
            <span>Categoría</span><span className="text-right">Venta</span><span className="text-right">%</span>
          </div>
          {CATS.map(cat => {
            const row = data.venta_categorias.find(r => r.categoria === cat.key) || { venta: 0, pct_venta: 0 };
            return (
              <div key={cat.key} className="grid grid-cols-3 items-center px-4 py-3 border-b border-stone-50 last:border-0">
                <span className="font-medium text-stone-700">{cat.label}</span>
                <span className="text-right text-stone-600">{fmt$(row.venta)}</span>
                <span className="text-right text-stone-400">{fmtP(row.pct_venta)}</span>
              </div>
            );
          })}
          {data.sin_categoria > 0 && (
            <div className="grid grid-cols-3 items-center px-4 py-3 bg-amber-50 border-b border-stone-50">
              <span className="font-medium text-amber-700">Sin categoría ⚠</span>
              <span className="text-right text-amber-600">{fmt$(data.sin_categoria)}</span>
              <span className="text-right text-amber-500">{fmtP(vn > 0 ? data.sin_categoria / vn * 100 : 0)}</span>
            </div>
          )}
          <div className="grid grid-cols-3 items-center px-4 py-3 bg-green-50">
            <span className="font-bold text-green-800">Total Venta Neta</span>
            <span className="text-right font-bold text-green-800 text-base">{fmt$(vn)}</span>
            <span className="text-right font-bold text-green-700">100%</span>
          </div>
        </div>
        {top && (
          <p className="text-xs text-stone-400 px-1">
            Categoría dominante: <strong className="text-stone-600">{CATS.find(c => c.key === top.categoria)?.label}</strong> ({fmtP(top.pct_venta)})
          </p>
        )}
        <FiscalDesglose df={data.desglose_fiscal} />
      </div>
    </ModalShell>
  );
}

// ── Popup: CMV editable ────────────────────────────────────────────────────────

function CmvModal({ data, onClose, onSaved, localId }) {
  const [pcts,   setPcts]   = useState(() =>
    Object.fromEntries(CATS.map(c => [c.key, String(data.cmv_categorias_config[c.key] ?? '')]))
  );
  const [saving, setSaving] = useState(false);

  const desglose = CATS.map(c => {
    const pct   = parseFloat(pcts[c.key]) || 0;
    const venta = data.venta_categorias.find(r => r.categoria === c.key)?.venta || 0;
    return { ...c, pct, venta, costo: Math.round(venta * pct / 100) };
  });
  const totalVenta = desglose.reduce((s, r) => s + r.venta, 0);
  const totalCosto = desglose.reduce((s, r) => s + r.costo, 0);
  const ponderado  = totalVenta > 0 ? Math.round(totalCosto / totalVenta * 1000) / 10 : 0;

  async function save() {
    setSaving(true);
    try {
      const categorias = Object.fromEntries(CATS.map(c => [c.key, parseFloat(pcts[c.key]) || 0]));
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
        <p className="text-stone-400 text-xs mb-2">% de costo por categoría (editable)</p>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          <div className="grid grid-cols-4 px-4 py-2 bg-stone-50 text-xs text-stone-400 font-semibold border-b border-stone-100">
            <span>Categoría</span>
            <span className="text-right">Venta</span>
            <span className="text-right">CMV %</span>
            <span className="text-right">Costo</span>
          </div>
          {desglose.map(row => {
            const warn = row.pct > CMV_WARN_THRESHOLD;
            return (
              <div key={row.key} className={`grid grid-cols-4 items-center px-4 py-3 border-b border-stone-50 last:border-0 ${warn ? 'bg-red-50' : ''}`}>
                <span className={`font-medium ${warn ? 'text-red-700' : 'text-stone-700'}`}>{row.label}</span>
                <span className="text-right text-stone-500">{fmt$(row.venta)}</span>
                <div className="flex items-center justify-end gap-1">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={pcts[row.key]}
                    onChange={e => setPcts(p => ({ ...p, [row.key]: e.target.value }))}
                    className={`w-16 text-right rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 ${warn ? 'border-red-300 bg-red-50' : 'border-stone-200'}`}
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

function ImpuestosModal({ ebitda, impuestosData, onClose, onSaved, localId, mes }) {
  const [edit,   setEdit]   = useState({
    iibb_pct:      String(impuestosData?.iibb_pct      ?? 3),
    imp_gen_pct:   String(impuestosData?.imp_gen_pct   ?? 30),
    fee_marca_pct: String(impuestosData?.fee_marca_pct ?? 4),
  });
  const [saving, setSaving] = useState(false);

  const items = [
    { key: 'iibb_pct',      label: 'Ingresos Brutos' },
    { key: 'imp_gen_pct',   label: 'Impuestos generales' },
    { key: 'fee_marca_pct', label: 'Fee Marca' },
  ];
  const ebitda_base = Math.max(ebitda, 0);
  const totalPct    = items.reduce((s, it) => s + (parseFloat(edit[it.key]) || 0), 0);
  const totalMonto  = Math.round(ebitda_base * totalPct / 100);

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
        <p className="text-stone-400 text-xs">Calculados como % del EBITDA ({fmt$(ebitda_base)})</p>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          {items.map((item, i) => {
            const pct   = parseFloat(edit[item.key]) || 0;
            const monto = Math.round(ebitda_base * pct / 100);
            return (
              <div key={item.key} className={`flex items-center justify-between px-4 py-3 border-b border-stone-50 ${i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}`}>
                <span className="font-medium text-stone-700 flex-1">{item.label}</span>
                <span className="text-stone-400 text-xs w-24 text-right mr-3">{fmt$(monto)}</span>
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
            <span className="text-violet-500 text-xs mr-auto ml-3">{fmtP(totalPct)} EBITDA</span>
            <span className="font-bold text-violet-900 text-base">{fmt$(totalMonto)}</span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Popup: Dólar fin de mes ────────────────────────────────────────────────────

function DolarModal({ mes, dolarActual, resultadoNeto, onClose, onSaved, localId }) {
  const [valor,  setValor]  = useState(String(dolarActual ?? ''));
  const [saving, setSaving] = useState(false);

  const dolar = parseFloat(valor) || null;
  const mitad = resultadoNeto / 2;

  async function save() {
    setSaving(true);
    try {
      await api.post('/red/eerr/cafeteria/dolar', { local_id: localId, mes, dolar_fin_mes: dolar });
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Error al guardar tipo de cambio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Dólar fin de mes · ${mesLabel(mes)}`} onClose={onClose} onSave={save} saving={saving}>
      <div className="text-sm space-y-4">
        <div>
          <label className="block text-stone-500 mb-1.5">Tipo de cambio (ARS/USD)</label>
          <div className="flex items-center gap-2">
            <span className="text-stone-400">$</span>
            <input
              type="number" min="0" step="1"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="ej. 1150"
              className="flex-1 rounded-xl border border-stone-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <span className="text-stone-400">por USD</span>
          </div>
        </div>
        {dolar && (
          <div className="rounded-xl bg-stone-50 border border-stone-100 p-4 space-y-2">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Distribución estimada</p>
            <div className="flex justify-between">
              <span className="text-stone-600">Agus (50%)</span>
              <div className="text-right">
                <span className="font-semibold text-stone-800">{fmt$(mitad)}</span>
                <span className="text-stone-400 ml-2 text-xs">{fmtU(mitad / dolar)}</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Plumas (50%)</span>
              <div className="text-right">
                <span className="font-semibold text-stone-800">{fmt$(mitad)}</span>
                <span className="text-stone-400 ml-2 text-xs">{fmtU(mitad / dolar)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Popup: Gestión de categorías de productos ─────────────────────────────────

// Reglas de sugerencia automática por nombre de producto
const REGLAS_SUGERENCIA = [
  { cat: 'promociones',    test: n => n.startsWith('promo') || n.includes('combo') || n.includes('mediatareando') || n.includes('mendo') },
  { cat: 'cafeteria',      words: ['cafe','café','espresso','capuchino','cappuccino','latte','americano','cortado','lagrima','lágrima','submarino','macchiato','chai','té ','te ','infusion','infusión','mocaccino','mocca'] },
  { cat: 'panificados',    words: ['medialuna','tortita','factura','chipa','budin','budín','torta','scon','scone','muffin','criollo','palmera','palmerita','cuernito','vigilante','croissant','medialunas','baguette','pan ','pancito'] },
  { cat: 'menu_almuerzos', words: ['menu','menú','almuerzo','ejecutivo'] },
  { cat: 'principales',    words: ['milanesa','tarta','pizza','empanada','sandwich','sándwich','wrap','ensalada','omelette','tostado','tostada','striploin','bife','pollo ','pesca','focaccia'] },
  { cat: 'bebidas',        words: ['agua ','agua$','gaseosa','jugo','limonada','cerveza','vino','soda','saborizada','yogurt','yogur','fernet','aperol','coke','pepsi','sprite'] },
];

function sugerirCategoria(nombreNorm) {
  const n = nombreNorm.toLowerCase();
  for (const regla of REGLAS_SUGERENCIA) {
    if (regla.test && regla.test(n)) return regla.cat;
    if (regla.words && regla.words.some(w => n.includes(w.replace('$', '')))) return regla.cat;
  }
  return null;
}

function ProductosModal({ localId, onClose }) {
  const [productos, setProductos]   = useState([]);
  const [asignados, setAsignados]   = useState({});
  const [loading,   setLoading]     = useState(true);
  const [saving,    setSaving]      = useState(false);
  const [filtroSin, setFiltroSin]   = useState(true);

  useEffect(() => {
    api.get('/red/eerr/cafeteria/productos-categorias', { params: { local_id: localId } })
      .then(r => setProductos(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [localId]);

  function aplicarSugerencias() {
    const nuevas = {};
    for (const p of productos) {
      if (!p.categoria && !asignados[p.nombre_norm]) {
        const sug = sugerirCategoria(p.nombre_norm);
        if (sug) nuevas[p.nombre_norm] = sug;
      }
    }
    setAsignados(prev => ({ ...prev, ...nuevas }));
  }

  function setCategoria(norm, cat) {
    setAsignados(p => ({ ...p, [norm]: cat || undefined }));
  }

  async function save() {
    setSaving(true);
    try {
      const asignaciones = Object.entries(asignados)
        .filter(([, cat]) => cat)
        .map(([producto_nombre_norm, categoria]) => ({ producto_nombre_norm, categoria }));
      await api.post('/red/eerr/cafeteria/productos-categorias', { asignaciones });
      const r = await api.get('/red/eerr/cafeteria/productos-categorias', { params: { local_id: localId } });
      setProductos(r.data.data || []);
      setAsignados({});
    } catch (err) {
      console.error(err);
      alert('Error al guardar categorías.');
    } finally {
      setSaving(false);
    }
  }

  const display = filtroSin
    ? productos.filter(p => !p.categoria && !asignados[p.nombre_norm])
    : productos;
  const pendientes = productos.filter(p => !p.categoria).length;
  const sugerencias_pendientes = productos.filter(p => !p.categoria && !asignados[p.nombre_norm] && sugerirCategoria(p.nombre_norm)).length;

  return (
    <ModalShell title="Mapeo producto → categoría" onClose={onClose} onSave={Object.keys(asignados).length ? save : null} saving={saving}>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-stone-400">{pendientes} producto{pendientes !== 1 ? 's' : ''} sin categoría</span>
          <button
            onClick={() => setFiltroSin(p => !p)}
            className="text-violet-600 hover:text-violet-800 font-semibold"
          >
            {filtroSin ? 'Ver todos' : 'Solo sin categoría'}
          </button>
        </div>

        {/* Botón sugerencias automáticas */}
        {!loading && sugerencias_pendientes > 0 && (
          <button
            onClick={aplicarSugerencias}
            className="w-full py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
          >
            Aplicar sugerencias automáticas ({sugerencias_pendientes} producto{sugerencias_pendientes !== 1 ? 's' : ''})
          </button>
        )}

        {loading && <div className="h-32 bg-stone-100 rounded-xl animate-pulse" />}
        {!loading && (
          <div className="rounded-xl border border-stone-100 overflow-hidden text-sm">
            {display.map(p => {
              const catActual = asignados[p.nombre_norm] ?? p.categoria ?? '';
              const sug = (!p.categoria && !asignados[p.nombre_norm]) ? sugerirCategoria(p.nombre_norm) : null;
              return (
                <div key={p.nombre_norm} className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-stone-700 font-medium text-xs">{p.nombre_raw}</p>
                    <p className="text-stone-400 text-xs">{fmt$(p.venta_total)} · {p.apariciones}×
                      {sug && <span className="ml-1 text-violet-500">→ {CATS.find(c => c.key === sug)?.label}</span>}
                    </p>
                  </div>
                  <select
                    value={catActual}
                    onChange={e => setCategoria(p.nombre_norm, e.target.value)}
                    className={`rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 flex-shrink-0 ${
                      !catActual ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-stone-200 text-stone-700'
                    }`}
                  >
                    <option value="">Sin categoría</option>
                    {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              );
            })}
            {display.length === 0 && (
              <div className="px-4 py-8 text-center text-stone-400 text-xs">
                {filtroSin ? 'Todos los productos tienen categoría asignada.' : 'No hay productos.'}
              </div>
            )}
          </div>
        )}
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

  // Subtitle helpers
  const ventaTop = [...data.venta_categorias].sort((a, b) => b.venta - a.venta)[0];
  const ventaSubtitle = (() => {
    const parts = data.venta_categorias.filter(c => c.venta > 0).slice(0, 2).map(c => `${CATS.find(x => x.key === c.categoria)?.label} ${Math.round(c.pct_venta)}%`);
    if (data.sin_categoria > 0) parts.push('⚠ sin categoría');
    const df = data.desglose_fiscal;
    if (df?.tiene_fiscal) parts.push('IVA descontado');
    return parts.join(' · ') || '6 categorías';
  })();

  const gastosSubtitle = (() => {
    const items = (data.gastos_bloques || []).flatMap(b => b.conceptos || []).filter(c => c.monto > 0);
    return items.slice(0, 3).map(c => c.nombre).join(' · ') || 'sin gastos';
  })();

  return (
    <>
      {/* Alerta productos sin categoría */}
      {data.productos_sin_categoria > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mt-4">
          <span className="flex-shrink-0">⚠</span>
          <span className="flex-1">
            <strong>{data.productos_sin_categoria} producto{data.productos_sin_categoria !== 1 ? 's' : ''} sin categoría</strong> — su venta no está asignada a ninguna categoría.
          </span>
          <button
            onClick={() => setOpenModal('productos')}
            className="flex-shrink-0 font-semibold text-amber-700 hover:text-amber-900 underline"
          >
            Asignar
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
          subtitle={`IIBB ${data.impuestos.iibb_pct}% + Imp. ${data.impuestos.imp_gen_pct}% + Fee ${data.impuestos.fee_marca_pct}% = ${fmtP(data.impuestos.total_pct)} EBITDA`}
          value={data.impuestos.total} pct={data.pcts.impuestos}
          onClick={() => setOpenModal('impuestos')} sk="impuestos"
        />
        <Connector sign="=" />
        <CascadeCard
          title="Resultado Neto" subtitle="para distribución entre socios"
          value={data.resultado_neto} pct={data.pcts.resultado_neto}
          onClick={() => {}} sk="resultado"
        />
      </div>

      {/* Distribución */}
      <div className="card p-4 mt-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Distribución</p>
          <button
            onClick={() => setOpenModal('dolar')}
            className="text-xs text-violet-600 hover:text-violet-800 font-semibold"
          >
            {data.dolar_fin_mes ? `USD $${data.dolar_fin_mes.toLocaleString('es-AR')}` : '+ Ingresar dólar'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { nombre: 'Agus', ars: data.distribucion.agus_ars, usd: data.distribucion.agus_usd },
            { nombre: 'Plumas', ars: data.distribucion.plumas_ars, usd: data.distribucion.plumas_usd },
          ].map(s => (
            <div key={s.nombre} className="rounded-xl border border-stone-100 px-4 py-3 bg-green-50 border-green-100">
              <p className="text-xs font-semibold text-green-700 mb-1">{s.nombre} — 50%</p>
              <p className="text-lg font-bold text-green-900">{fmt$(s.ars)}</p>
              {s.usd != null && (
                <p className="text-xs text-green-600 mt-0.5">{fmtU(s.usd)}</p>
              )}
            </div>
          ))}
        </div>
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
          ebitda={data.ebitda}
          impuestosData={data.impuestos}
          localId={localId}
          mes={mes}
          onClose={() => setOpenModal(null)}
          onSaved={reload}
        />
      )}
      {openModal === 'dolar' && (
        <DolarModal
          mes={mes}
          dolarActual={data.dolar_fin_mes}
          resultadoNeto={data.resultado_neto}
          localId={localId}
          onClose={() => setOpenModal(null)}
          onSaved={reload}
        />
      )}
      {openModal === 'productos' && (
        <ProductosModal localId={localId} onClose={() => { setOpenModal(null); reload(); }} />
      )}
    </>
  );
}
