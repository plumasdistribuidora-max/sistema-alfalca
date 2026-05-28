import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import { fmtARS } from '../red/redUtils';

// ── Constantes ────────────────────────────────────────────────────────────────

const MESES_FULL = {
  '01': 'Enero',   '02': 'Febrero', '03': 'Marzo',    '04': 'Abril',
  '05': 'Mayo',    '06': 'Junio',   '07': 'Julio',    '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const CUENTA_META = {
  santander: { label: 'Santander',    icon: '🏦', color: '#e83e3e' },
  mp:        { label: 'Mercado Pago', icon: '💙', color: '#009ee3' },
  galicia:   { label: 'Galicia',      icon: '🟠', color: '#f97316' },
  efectivo:  { label: 'Efectivo',     icon: '💵', color: '#16a34a' },
};

function currentMesStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (v) => fmtARS(Math.round(Number(v) || 0));

function fmtFecha(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [, mm, dd] = yyyymmdd.split('-');
  return `${dd}/${mm}`;
}

function fmtFechaLarga(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [yy, mm, dd] = yyyymmdd.split('-');
  return `${dd}/${mm}/${yy}`;
}

function hace(isoStr) {
  if (!isoStr) return 'nunca';
  const diff = Date.now() - new Date(isoStr).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'hace menos de 1h';
  if (hours < 24) return `hace ${hours}h`;
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

function prevMes(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMes(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCalDays(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const lastDate = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Mon-based
  const days = [];
  for (let i = 0; i < firstDow; i++) days.push(null);
  for (let d = 1; d <= lastDate; d++) {
    days.push(`${yyyymm}-${String(d).padStart(2, '0')}`);
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ModalShell({ title, onClose, onSave, saving, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-stone-900 text-base" style={{ fontFamily: 'Nunito, sans-serif' }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {onSave && (
          <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
            <button onClick={onSave} disabled={saving}
              className="w-full py-2.5 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ background: '#4C1D95' }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoBadge({ estado, arrastrado }) {
  if (arrastrado) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
        ⚠ vencido
      </span>
    );
  }
  const s = (estado || '').toLowerCase();
  const map = {
    pagado:    ['bg-emerald-100 text-emerald-800', '✓ Pagado'],
    aceptado:  ['bg-blue-100 text-blue-800', 'Aceptado'],
    activo:    ['bg-blue-100 text-blue-800', 'Activo'],
    depositado:['bg-violet-100 text-violet-800', 'Depositado'],
    presentado:['bg-violet-100 text-violet-800', 'Presentado'],
  };
  const [cls, lbl] = map[s] || ['bg-stone-100 text-stone-600', estado || '—'];
  return <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{lbl}</span>;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CashFlowSection() {
  const [saldosData,  setSaldosData]  = useState(null);
  const [calData,     setCalData]     = useState(null);
  const [viewMes,     setViewMes]     = useState(currentMesStr);
  const [loadingSal,  setLoadingSal]  = useState(true);
  const [loadingCal,  setLoadingCal]  = useState(true);

  // Modal: editar saldo
  const [saldoModal,  setSaldoModal]  = useState(null); // cuenta key
  const [saldoVal,    setSaldoVal]    = useState('');
  const [savingSaldo, setSavingSaldo] = useState(false);

  // Modal: gasto
  const [gastoModal,  setGastoModal]  = useState(null); // null | {mode:'add',fecha?} | {mode:'edit',item}
  const [gastoForm,   setGastoForm]   = useState({ concepto: '', monto: '', fecha: '' });
  const [savingGasto, setSavingGasto] = useState(false);

  // Modal: detalle día
  const [diaModal,    setDiaModal]    = useState(null); // date string YYYY-MM-DD

  // Import
  const [importando,  setImportando]  = useState(false);
  const [importMsg,   setImportMsg]   = useState(null);
  const fileRef = useRef();

  const today = currentMesStr().split('-')[1]
    ? (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })()
    : '';
  const todayDateStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();

  const loadSaldos = () => {
    setLoadingSal(true);
    api.get('/cashflow/saldos')
      .then(r => setSaldosData(r.data.data))
      .catch(console.error)
      .finally(() => setLoadingSal(false));
  };

  const loadCalendario = (mes) => {
    setLoadingCal(true);
    api.get('/cashflow/calendario', { params: { mes } })
      .then(r => setCalData(r.data.data))
      .catch(console.error)
      .finally(() => setLoadingCal(false));
  };

  useEffect(() => { loadSaldos(); }, []);
  useEffect(() => { loadCalendario(viewMes); }, [viewMes]);

  // ── Saldo modal ──
  function openSaldoModal(cuenta) {
    const cur = saldosData?.saldos?.[cuenta]?.monto ?? 0;
    setSaldoVal(String(Math.round(cur)));
    setSaldoModal(cuenta);
  }
  async function handleSaveSaldo() {
    if (!saldoModal) return;
    setSavingSaldo(true);
    try {
      await api.post('/cashflow/saldos', { cuenta: saldoModal, monto: parseFloat(saldoVal) || 0 });
      setSaldoModal(null);
      loadSaldos();
      loadCalendario(viewMes);
    } catch (err) { console.error(err); alert('Error al guardar saldo'); }
    finally { setSavingSaldo(false); }
  }

  // ── Import cheques ──
  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    setImportMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/cashflow/cheques/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = r.data.data;
      setImportMsg(`✓ ${d.importados} importados · ${d.actualizados} actualizados${d.errores ? ` · ${d.errores} errores` : ''}`);
      loadCalendario(viewMes);
    } catch (err) { setImportMsg('Error al importar: ' + (err.response?.data?.error || err.message)); }
    finally { setImportando(false); e.target.value = ''; }
  }

  // ── Gasto modal ──
  function openAddGasto(fecha) {
    setGastoForm({ concepto: '', monto: '', fecha: fecha || todayDateStr });
    setGastoModal({ mode: 'add' });
  }
  function openEditGasto(item) {
    setGastoForm({ concepto: item.concepto, monto: String(item.importe), fecha: item.fecha });
    setGastoModal({ mode: 'edit', item });
  }
  async function handleSaveGasto() {
    if (!gastoForm.concepto || !gastoForm.monto || !gastoForm.fecha) return;
    setSavingGasto(true);
    try {
      if (gastoModal.mode === 'add') {
        await api.post('/cashflow/gastos', gastoForm);
      } else {
        await api.put(`/cashflow/gastos/${gastoModal.item.id}`, gastoForm);
      }
      setGastoModal(null);
      loadCalendario(viewMes);
    } catch (err) { console.error(err); alert('Error al guardar'); }
    finally { setSavingGasto(false); }
  }
  async function handleDeleteGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
      await api.delete(`/cashflow/gastos/${id}`);
      loadCalendario(viewMes);
      setDiaModal(null);
    } catch (err) { console.error(err); alert('Error al eliminar'); }
  }

  // ── Datos calendario ──
  const calDays   = getCalDays(viewMes);
  const egresoMap = {}; // date string → array
  if (calData?.egresos) {
    for (const e of calData.egresos) {
      if (!egresoMap[e.fecha]) egresoMap[e.fecha] = [];
      egresoMap[e.fecha].push(e);
    }
  }
  const diaEgresos = diaModal ? (egresoMap[diaModal] || []) : [];
  const [viewY, viewM] = viewMes.split('-');

  return (
    <div className="space-y-4">

      {/* ── Banner resumen ── */}
      <div className="card px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500 mb-0.5">Caja disponible hoy</p>
          <p className="text-2xl font-bold text-stone-900">
            {loadingSal ? '…' : fmt$(saldosData?.total ?? 0)}
          </p>
        </div>
        {calData && (
          <div className="text-right">
            {calData.alcanza_hasta ? (
              <>
                <p className="text-xs text-stone-500 mb-0.5">La caja alcanza hasta</p>
                <p className="text-lg font-bold text-emerald-700">{fmtFechaLarga(calData.alcanza_hasta)}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-emerald-600">Sin vencimientos que comprometan la caja</p>
            )}
          </div>
        )}
      </div>

      {/* ── Saldos ── */}
      {saldosData?.efectivo_warning && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <span>⚠</span>
          <span>
            Actualizá el efectivo
            {saldosData.efectivo_dias != null
              ? ` (última vez: ${fmtFechaLarga(saldosData.saldos?.efectivo?.fecha?.slice(0,10))})`
              : ' (nunca registrado)'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {['santander','mp','galicia','efectivo'].map(cuenta => {
          const meta = CUENTA_META[cuenta];
          const d    = saldosData?.saldos?.[cuenta];
          return (
            <button
              key={cuenta}
              onClick={() => openSaldoModal(cuenta)}
              className="card p-4 text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{meta.icon}</span>
                <span className="text-xs font-semibold text-stone-500 truncate">{meta.label}</span>
              </div>
              <p className="text-lg font-bold text-stone-900 truncate">{fmt$(d?.monto ?? 0)}</p>
              <p className="text-xs text-stone-400 mt-0.5 truncate">{d?.fecha ? hace(d.fecha) : 'sin datos'}</p>
            </button>
          );
        })}
      </div>

      {/* ── Acciones ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importando}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          style={{ background: '#b91c1c' }}
        >
          <span>↑</span> {importando ? 'Importando…' : 'Importar cheques Galicia'}
        </button>
        <button
          onClick={() => openAddGasto()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: '#4C1D95' }}
        >
          <span>+</span> Agregar gasto manual
        </button>
        {importMsg && (
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${importMsg.startsWith('✓') ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
            {importMsg}
          </span>
        )}
      </div>

      {/* ── Calendario ── */}
      <div className="card p-4">
        {/* Cabecera del mes */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMes(prevMes(viewMes))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-600 font-bold"
          >‹</button>
          <div className="text-center">
            <p className="font-bold text-stone-900">
              {MESES_FULL[viewM]} {viewY}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {viewMes !== currentMesStr() && (
              <button
                onClick={() => setViewMes(currentMesStr())}
                className="text-xs text-violet-600 hover:text-violet-800 font-semibold px-2 py-1 rounded-lg hover:bg-violet-50"
              >
                Hoy
              </button>
            )}
            <button
              onClick={() => setViewMes(nextMes(viewMes))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-600 font-bold"
            >›</button>
          </div>
        </div>

        {/* Días de semana */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-stone-400 py-1">{d}</div>
          ))}
        </div>

        {/* Grid días */}
        {loadingCal ? (
          <div className="h-48 flex items-center justify-center text-stone-400 text-sm">Cargando…</div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-stone-100 rounded-xl overflow-hidden">
            {calDays.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="bg-white min-h-[80px]" />;
              const isPast   = day < todayDateStr;
              const isToday  = day === todayDateStr;
              const dayEgr   = egresoMap[day] || [];
              const dayTotal = dayEgr.reduce((s, e) => s + e.importe, 0);
              const dd       = day.slice(8);

              return (
                <button
                  key={day}
                  onClick={() => setDiaModal(day)}
                  className={`bg-white min-h-[80px] p-1.5 text-left flex flex-col transition-colors hover:bg-stone-50 ${isPast ? 'opacity-45' : ''}`}
                  style={isToday ? { outline: '2px solid #16a34a', outlineOffset: '-2px', zIndex: 1 } : {}}
                >
                  <span className={`text-xs font-bold mb-1 ${isToday ? 'text-emerald-700' : 'text-stone-600'}`}>
                    {parseInt(dd, 10)}
                  </span>
                  <div className="space-y-0.5 flex-1 min-h-0 overflow-hidden">
                    {dayEgr.slice(0, 3).map((e, ei) => (
                      <EgresoChip key={ei} egreso={e} />
                    ))}
                    {dayEgr.length > 3 && (
                      <span className="text-xs text-stone-400">+{dayEgr.length - 3} más</span>
                    )}
                  </div>
                  {dayTotal > 0 && (
                    <p className="text-xs font-bold text-stone-700 mt-1 border-t border-stone-100 pt-0.5">
                      −{fmt$(dayTotal)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Leyenda */}
        <div className="flex items-center gap-4 mt-3 justify-end">
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" /> Cheque Galicia
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500 flex-shrink-0" /> Gasto manual
          </span>
        </div>
      </div>

      {/* ── Modal: editar saldo ── */}
      {saldoModal && (
        <ModalShell
          title={`Actualizar ${CUENTA_META[saldoModal]?.label}`}
          onClose={() => setSaldoModal(null)}
          onSave={handleSaveSaldo}
          saving={savingSaldo}
        >
          <div className="space-y-4">
            <p className="text-sm text-stone-500">
              Saldo actual: <strong>{fmt$(saldosData?.saldos?.[saldoModal]?.monto ?? 0)}</strong>
              <span className="ml-2 text-stone-400">{hace(saldosData?.saldos?.[saldoModal]?.fecha)}</span>
            </p>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Nuevo saldo ($)</label>
              <input
                type="number" min="0" value={saldoVal}
                onChange={e => setSaldoVal(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full rounded-xl border border-stone-200 px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            {saldoModal === 'efectivo' && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                💡 El efectivo se cuenta los lunes y viernes.
              </p>
            )}
          </div>
        </ModalShell>
      )}

      {/* ── Modal: gasto manual ── */}
      {gastoModal && (
        <ModalShell
          title={gastoModal.mode === 'add' ? 'Agregar gasto manual' : 'Editar gasto'}
          onClose={() => setGastoModal(null)}
          onSave={handleSaveGasto}
          saving={savingGasto}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Concepto</label>
              <input
                type="text" value={gastoForm.concepto} placeholder="Ej: Edemsa, Sueldos…"
                onChange={e => setGastoForm(p => ({ ...p, concepto: e.target.value }))}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Monto ($)</label>
              <input
                type="number" min="0" value={gastoForm.monto} placeholder="0"
                onChange={e => setGastoForm(p => ({ ...p, monto: e.target.value }))}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Fecha</label>
              <input
                type="date" value={gastoForm.fecha}
                onChange={e => setGastoForm(p => ({ ...p, fecha: e.target.value }))}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Modal: detalle día ── */}
      {diaModal && (
        <ModalShell
          title={`Egresos · ${fmtFechaLarga(diaModal)}`}
          onClose={() => setDiaModal(null)}
          wide
        >
          <div className="space-y-3">
            {diaEgresos.length === 0 && (
              <p className="text-sm text-stone-400 text-center py-4">Sin egresos en este día.</p>
            )}

            {/* Cheques */}
            {diaEgresos.filter(e => e.tipo === 'cheque').map((c, i) => (
              <div key={i} className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-800 truncate">{c.emitido_a || '—'}</p>
                    <p className="text-xs text-stone-500">Nº {c.nro_cheque}</p>
                    {c.arrastrado && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        Vencía {fmtFechaLarga(c.fecha_pago_original)} · pendiente de cobro
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-red-700">{fmt$(c.importe)}</p>
                    <div className="mt-1"><EstadoBadge estado={c.estado} arrastrado={c.arrastrado} /></div>
                  </div>
                </div>
              </div>
            ))}

            {/* Gastos */}
            {diaEgresos.filter(e => e.tipo === 'gasto').map((g, i) => (
              <div key={i} className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-800 truncate">{g.concepto}</p>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-bold text-violet-700">{fmt$(g.importe)}</p>
                    <button
                      onClick={() => { setDiaModal(null); openEditGasto(g); }}
                      className="text-xs text-stone-400 hover:text-violet-600 font-medium"
                    >Editar</button>
                    <button
                      onClick={() => handleDeleteGasto(g.id)}
                      className="text-xs text-stone-400 hover:text-red-500 font-medium"
                    >Borrar</button>
                  </div>
                </div>
              </div>
            ))}

            {/* Total del día */}
            {diaEgresos.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-100 mt-2">
                <span className="text-sm font-semibold text-stone-700">Total del día</span>
                <span className="font-bold text-stone-900">{fmt$(diaEgresos.reduce((s,e) => s+e.importe, 0))}</span>
              </div>
            )}

            {/* Agregar gasto para este día */}
            <button
              onClick={() => { setDiaModal(null); openAddGasto(diaModal); }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors mt-2"
            >
              + Agregar gasto para este día
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ── EgresoChip ────────────────────────────────────────────────────────────────

function EgresoChip({ egreso }) {
  if (egreso.tipo === 'cheque') {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${egreso.arrastrado ? 'bg-amber-500' : 'bg-red-400'}`} />
        <span className="truncate text-stone-600 flex-1 min-w-0">
          {egreso.emitido_a?.split(' ')[0] || `Ch.${egreso.nro_cheque?.slice(-4)}`}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-violet-500" />
      <span className="truncate text-stone-600 flex-1 min-w-0">{egreso.concepto}</span>
    </div>
  );
}
