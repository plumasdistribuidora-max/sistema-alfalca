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
  santander: { label: 'Santander',    icon: '🏦' },
  mp:        { label: 'Mercado Pago', icon: '💙' },
  galicia:   { label: 'Galicia',      icon: '🟠' },
  efectivo:  { label: 'Efectivo',     icon: '💵' },
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMesStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

const fmt$ = (v) => fmtARS(Math.round(Number(v) || 0));

function fmtAbrev(v) {
  const num = Number(v) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000).toLocaleString('es-AR')}k`;
  return `${sign}$${Math.round(abs).toLocaleString('es-AR')}`;
}

function fmtFechaLarga(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [yy, mm, dd] = yyyymmdd.split('-');
  return `${dd}/${mm}/${yy}`;
}

function fmtFechaCorta(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [, mm, dd] = yyyymmdd.split('-');
  return `${parseInt(dd, 10)}/${parseInt(mm, 10)}`;
}

function fmtRango7Dias() {
  const ini = new Date();
  ini.setDate(ini.getDate() + 1); // mañana
  const fin = new Date();
  fin.setDate(fin.getDate() + 7); // hoy + 7
  const f = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
  return `${f(ini)} al ${f(fin)}`;
}

function hace(isoStr) {
  if (!isoStr) return 'nunca';
  const diff  = Date.now() - new Date(isoStr).getTime();
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
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < firstDow; i++) days.push(null);
  for (let d = 1; d <= lastDate; d++) days.push(`${yyyymm}-${String(d).padStart(2, '0')}`);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getSemaforo(saldo, piso) {
  if (saldo >= piso) return { bg: '#E1F5EE', headColor: '#0F6E56', saldoColor: '#04342C', barColor: '#1D9E75' };
  if (saldo >= 0)   return { bg: '#FAEEDA', headColor: '#854F0B', saldoColor: '#412402', barColor: '#EF9F27' };
  return                   { bg: '#FCEBEB', headColor: '#A32D2D', saldoColor: '#501313', barColor: '#E24B4A' };
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
  const s   = (estado || '').toLowerCase();
  const map = {
    pagado:     ['bg-emerald-100 text-emerald-800', '✓ Pagado'],
    aceptado:   ['bg-blue-100 text-blue-800', 'Aceptado'],
    activo:     ['bg-blue-100 text-blue-800', 'Activo'],
    depositado: ['bg-violet-100 text-violet-800', 'Depositado'],
    presentado: ['bg-violet-100 text-violet-800', 'Presentado'],
  };
  const [cls, lbl] = map[s] || ['bg-stone-100 text-stone-600', estado || '—'];
  return <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{lbl}</span>;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CashFlowSection() {
  const [saldosData,   setSaldosData]   = useState(null);
  const [calData,      setCalData]      = useState(null);
  const [configData,   setConfigData]   = useState({ piso_seguridad: 3_000_000 });
  const [editPiso,     setEditPiso]     = useState('3000000');
  const [savingConfig, setSavingConfig] = useState(false);
  const [showConfig,   setShowConfig]   = useState(false);
  const [viewMes,      setViewMes]      = useState(currentMesStr);
  const [loadingSal,   setLoadingSal]   = useState(true);
  const [loadingCal,   setLoadingCal]   = useState(true);

  // Modal: saldo
  const [saldoModal,   setSaldoModal]   = useState(null);
  const [saldoVal,     setSaldoVal]     = useState('');
  const [savingSaldo,  setSavingSaldo]  = useState(false);

  // Modal: gasto
  const [gastoModal,   setGastoModal]   = useState(null);
  const [gastoForm,    setGastoForm]    = useState({ concepto: '', monto: '', fecha: '' });
  const [savingGasto,  setSavingGasto]  = useState(false);

  // Modal: detalle día
  const [diaModal,     setDiaModal]     = useState(null);

  // Import cheques Galicia
  const [importando,   setImportando]   = useState(false);
  const [importMsg,    setImportMsg]    = useState(null);
  const fileRef = useRef();

  // Import GetNet
  const [getnetModal,  setGetnetModal]  = useState(false);
  const [importandoGN, setImportandoGN] = useState(false);
  const [importMsgGN,  setImportMsgGN]  = useState(null);
  const getnetFileRef = useRef();

  const todayDateStr = todayIso();
  const piso = configData.piso_seguridad;

  // ── Loaders ──
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

  const loadConfig = () => {
    api.get('/cashflow/config')
      .then(r => {
        setConfigData(r.data.data);
        setEditPiso(String(Math.round(r.data.data.piso_seguridad)));
      })
      .catch(console.error);
  };

  useEffect(() => { loadSaldos(); loadConfig(); }, []);
  useEffect(() => { loadCalendario(viewMes); }, [viewMes]);

  // ── Handlers ──

  function openSaldoModal(cuenta) {
    setSaldoVal(String(Math.round(saldosData?.saldos?.[cuenta]?.monto ?? 0)));
    setSaldoModal(cuenta);
  }
  async function handleSaveSaldo() {
    if (!saldoModal) return;
    setSavingSaldo(true);
    try {
      await api.post('/cashflow/saldos', { cuenta: saldoModal, monto: parseFloat(saldoVal) || 0 });
      setSaldoModal(null);
      loadSaldos(); loadCalendario(viewMes);
    } catch { alert('Error al guardar saldo'); }
    finally { setSavingSaldo(false); }
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const val = parseFloat(editPiso.replace(/\./g, '').replace(',', '.')) || 3_000_000;
      await api.post('/cashflow/config', { piso_seguridad: val });
      loadConfig();
    } catch (err) { console.error(err); }
    finally { setSavingConfig(false); }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true); setImportMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/cashflow/cheques/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = r.data.data;
      setImportMsg(`✓ ${d.importados} importados · ${d.actualizados} actualizados${d.errores ? ` · ${d.errores} errores` : ''}`);
      loadCalendario(viewMes);
    } catch (err) { setImportMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setImportando(false); e.target.value = ''; }
  }

  async function handleImportGetnet(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportandoGN(true); setImportMsgGN(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/cashflow/getnet/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = r.data.data;
      setImportMsgGN(`✓ ${d.importados} importadas · ${d.actualizados} actualizadas${d.errores ? ` · ${d.errores} errores` : ''}`);
      loadCalendario(viewMes);
    } catch (err) { setImportMsgGN('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setImportandoGN(false); e.target.value = ''; }
  }

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
      if (gastoModal.mode === 'add') await api.post('/cashflow/gastos', gastoForm);
      else await api.put(`/cashflow/gastos/${gastoModal.item.id}`, gastoForm);
      setGastoModal(null); loadCalendario(viewMes);
    } catch { alert('Error al guardar'); }
    finally { setSavingGasto(false); }
  }
  async function handleDeleteGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
      await api.delete(`/cashflow/gastos/${id}`);
      loadCalendario(viewMes); setDiaModal(null);
    } catch { alert('Error al eliminar'); }
  }

  // ── Datos calendario ──
  const calDays    = getCalDays(viewMes);
  const egresoMap  = {};
  if (calData?.egresos) {
    for (const e of calData.egresos) {
      if (!egresoMap[e.fecha]) egresoMap[e.fecha] = [];
      egresoMap[e.fecha].push(e);
    }
  }

  const diaEgresos     = diaModal ? (egresoMap[diaModal] || []) : [];
  const getnetDetDia   = diaModal ? (calData?.getnet_detalle_por_dia?.[diaModal] || []) : [];
  const diaProySaldo   = diaModal ? calData?.saldo_proyectado_por_dia?.[diaModal] : undefined;
  const isGetnetConf   = diaModal ? diaModal <= todayDateStr : false;

  const totalEgresos = calData?.egresos?.reduce((s, e) => s + e.importe, 0) ?? 0;
  const [viewY, viewM] = viewMes.split('-');

  const saldoMax = (() => {
    if (!calData?.saldo_por_dia) return 1;
    const vals = calDays
      .filter(d => d && calData.saldo_por_dia[d] !== undefined && calData.saldo_por_dia[d] > 0)
      .map(d => calData.saldo_por_dia[d]);
    return vals.length > 0 ? Math.max(...vals) : 1;
  })();

  return (
    <div className="space-y-4">

      {/* ── Banner 3 tarjetas ── */}
      <div className="grid grid-cols-3 gap-3">

        {/* Caja disponible */}
        <div className="rounded-2xl px-4 py-3 flex flex-col" style={{ background: '#E1F5EE' }}>
          <p className="text-xs font-semibold" style={{ color: '#0F6E56' }}>Caja disponible</p>
          <p className="text-2xl font-bold mt-0.5 leading-none" style={{ color: '#04342C' }}>
            {loadingSal ? '…' : fmt$(saldosData?.total ?? 0)}
          </p>
        </div>

        {/* Proyección GetNet */}
        <div className="rounded-2xl px-4 py-3 flex flex-col" style={{ background: '#EBF3FD' }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#185FA5' }}>Proyección GetNet</p>

          {/* Próximos 7 días */}
          <div>
            <p className="leading-none mb-0.5" style={{ fontSize: 9, color: 'rgba(24,95,165,0.65)' }}>
              Próximos 7 días · {fmtRango7Dias()}
            </p>
            <p className="text-lg font-bold leading-none" style={{ color: '#0D3B6E' }}>
              {loadingCal ? '…' : fmt$(calData?.ingresos_semana ?? 0)}
            </p>
          </div>

          {/* Separador */}
          <div style={{ borderTop: '0.5px solid rgba(24,95,165,0.2)', margin: '5px 0' }} />

          {/* Total por entrar */}
          <div>
            <p className="leading-none mb-0.5" style={{ fontSize: 9, color: 'rgba(24,95,165,0.65)' }}>
              Total por entrar
            </p>
            <p className="text-lg font-bold leading-none" style={{ color: '#0D3B6E' }}>
              {loadingCal ? '…' : fmt$(calData?.ingresos_total_futuro ?? 0)}
            </p>
          </div>
        </div>

        {/* Alcanza hasta — dos fechas */}
        <div className="rounded-2xl px-4 py-3 flex flex-col" style={{ background: '#FAEEDA' }}>
          <p className="text-xs font-semibold" style={{ color: '#854F0B' }}>Alcanza hasta</p>
          {loadingCal ? (
            <p className="text-lg font-bold mt-0.5" style={{ color: '#412402' }}>…</p>
          ) : (
            <div className="mt-0.5 space-y-0.5">
              <p className="text-sm font-bold leading-tight" style={{ color: '#412402' }}>
                {calData?.alcanza_hasta ? fmtFechaCorta(calData.alcanza_hasta) : '∞'}{' '}
                <span style={{ fontSize: 9, fontWeight: 500, color: '#854F0B' }}>sin GetNet</span>
              </p>
              {calData?.alcanza_hasta_proyectado ? (
                <p className="text-sm font-bold leading-tight" style={{ color: '#185FA5' }}>
                  {fmtFechaCorta(calData.alcanza_hasta_proyectado)}{' '}
                  <span style={{ fontSize: 9, fontWeight: 500, color: '#378ADD' }}>con GetNet</span>
                </p>
              ) : calData?.alcanza_hasta ? (
                <p style={{ fontSize: 10, fontWeight: 600, color: '#378ADD' }}>∞ con GetNet</p>
              ) : (
                <p style={{ fontSize: 10, fontWeight: 600, color: '#0F6E56' }}>Sin compromiso</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Alerta efectivo ── */}
      {saldosData?.efectivo_warning && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <span>⚠</span>
          <span>
            Actualizá el efectivo
            {saldosData.efectivo_dias != null
              ? ` (última vez: ${fmtFechaLarga(saldosData.saldos?.efectivo?.fecha?.slice(0, 10))})`
              : ' (nunca registrado)'}
          </span>
        </div>
      )}

      {/* ── Saldos por cuenta ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {['santander', 'mp', 'galicia', 'efectivo'].map(cuenta => {
          const meta = CUENTA_META[cuenta];
          const d    = saldosData?.saldos?.[cuenta];
          return (
            <button key={cuenta} onClick={() => openSaldoModal(cuenta)}
              className="card p-4 text-left hover:shadow-md transition-shadow">
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
        <button onClick={() => fileRef.current?.click()} disabled={importando}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: '#b91c1c' }}>
          <span>↑</span> {importando ? 'Importando…' : 'Importar cheques Galicia'}
        </button>

        <button onClick={() => { setGetnetModal(true); setImportMsgGN(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#185FA5' }}>
          <span>↑</span> Importar GetNet
        </button>

        <button onClick={() => openAddGasto()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#4C1D95' }}>
          <span>+</span> Agregar gasto manual
        </button>

        {importMsg && (
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${importMsg.startsWith('✓') ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
            {importMsg}
          </span>
        )}
      </div>

      {/* ── Semáforo config ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4C1D95" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-sm font-bold text-stone-800">Piso de seguridad de caja</span>
            <span className="text-sm font-semibold text-violet-700">{fmt$(piso)}</span>
          </div>
          <button onClick={() => setShowConfig(v => !v)}
            className="text-xs text-stone-400 hover:text-stone-600 font-medium px-2 py-1 rounded-lg hover:bg-stone-50">
            {showConfig ? 'Ocultar' : 'Configurar'}
          </button>
        </div>

        {showConfig && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold text-stone-600 mb-1 block">Monto mínimo ($)</label>
                <input type="number" min="0" value={editPiso} onChange={e => setEditPiso(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </div>
              <div className="pt-5">
                <button onClick={handleSaveConfig} disabled={savingConfig}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: '#4C1D95' }}>
                  {savingConfig ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-sm text-stone-600">
                <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ background: '#E1F5EE', border: '1px solid #0F6E56' }} />
                Verde — caja por encima del piso de seguridad
              </div>
              <div className="flex items-center gap-2.5 text-sm text-stone-600">
                <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ background: '#FAEEDA', border: '1px solid #854F0B' }} />
                Amarillo — caja entre $0 y el piso de seguridad
              </div>
              <div className="flex items-center gap-2.5 text-sm text-stone-600">
                <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ background: '#FCEBEB', border: '1px solid #A32D2D' }} />
                Rojo — caja proyectada en negativo
              </div>
            </div>
            <p className="text-xs text-stone-400">
              El color de cada día refleja el saldo real acumulado luego de todos los egresos hasta esa fecha.
            </p>
          </div>
        )}
      </div>

      {/* ── Calendario ── */}
      <div className="card p-4">
        {/* Cabecera del mes */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setViewMes(prevMes(viewMes))}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-600 font-bold">‹</button>
          <p className="font-bold text-stone-900">{MESES_FULL[viewM]} {viewY}</p>
          <div className="flex items-center gap-1">
            {viewMes !== currentMesStr() && (
              <button onClick={() => setViewMes(currentMesStr())}
                className="text-xs text-violet-600 hover:text-violet-800 font-semibold px-2 py-1 rounded-lg hover:bg-violet-50">
                Hoy
              </button>
            )}
            <button onClick={() => setViewMes(nextMes(viewMes))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-600 font-bold">›</button>
          </div>
        </div>

        {/* Encabezados día de semana */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-stone-400 py-1">{d}</div>
          ))}
        </div>

        {/* Grid días */}
        {loadingCal ? (
          <div className="h-48 flex items-center justify-center text-stone-400 text-sm">Cargando…</div>
        ) : (
          <div className="grid grid-cols-7 gap-px" style={{ background: '#E7E5E4', borderRadius: 12, overflow: 'hidden' }}>
            {calDays.map((day, i) => {
              if (!day) return <div key={`e-${i}`} style={{ background: 'transparent', minHeight: 130 }} />;

              const isPast   = day < todayDateStr;
              const isToday  = day === todayDateStr;
              const dayEgr   = egresoMap[day] || [];
              const dayTotal = dayEgr.reduce((s, e) => s + e.importe, 0);

              const saldoDia      = calData?.saldo_por_dia?.[day];
              const saldoProyDia  = calData?.saldo_proyectado_por_dia?.[day];
              const ingresoGN     = calData?.ingreso_getnet_por_dia?.[day] ?? 0;
              const sem           = (!isPast && saldoDia !== undefined) ? getSemaforo(saldoDia, piso) : null;
              const cellBg        = isPast ? '#F5F4F2' : (sem?.bg || '#FFFFFF');
              const dd            = parseInt(day.slice(8), 10);

              return (
                <button key={day} onClick={() => setDiaModal(day)}
                  className="text-left flex flex-col"
                  style={{
                    background: cellBg,
                    minHeight: 130,
                    padding: '6px 7px',
                    opacity: isPast ? 0.5 : 1,
                    position: 'relative',
                    ...(isToday ? { boxShadow: 'inset 0 0 0 1.5px #1D9E75', zIndex: 1 } : {}),
                  }}
                >
                  {/* Número del día */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: sem?.headColor || '#78716C', lineHeight: 1, marginBottom: 4 }}>
                    {dd}{isToday ? ' · hoy' : ''}
                  </p>

                  {/* ZONA REAL */}
                  {sem ? (
                    <div>
                      <p style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', lineHeight: 1, marginBottom: 1 }}>Egr.</p>
                      {dayTotal > 0
                        ? <p style={{ fontSize: 10, fontWeight: 600, color: '#A32D2D', lineHeight: 1, marginBottom: 3 }}>−{fmtAbrev(dayTotal)}</p>
                        : <p style={{ fontSize: 10, fontWeight: 500, color: '#C8C5C2', lineHeight: 1, marginBottom: 3 }}>—</p>
                      }
                      <p style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', lineHeight: 1, marginBottom: 1 }}>Saldo</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: sem.saldoColor, lineHeight: 1 }}>{fmtAbrev(saldoDia)}</p>
                    </div>
                  ) : (
                    // Día pasado: solo mostrar total de egresos si hay
                    dayTotal > 0 && (
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#A32D2D', lineHeight: 1 }}>−{fmtAbrev(dayTotal)}</p>
                    )
                  )}

                  {/* SEPARADOR + ZONA PROYECTADA (solo días activos) */}
                  {sem && (
                    <>
                      <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.13)', margin: '4px 0' }} />
                      <div>
                        <p style={{ fontSize: 9, color: 'rgba(55,138,221,0.75)', lineHeight: 1, marginBottom: 1 }}>+ GN</p>
                        {isToday
                          ? <p style={{ fontSize: 9, fontWeight: 500, color: '#A8A29E', lineHeight: 1, marginBottom: 3 }}>ya ingresó</p>
                          : ingresoGN > 0
                            ? <p style={{ fontSize: 10, fontWeight: 600, color: '#378ADD', lineHeight: 1, marginBottom: 3 }}>+{fmtAbrev(ingresoGN)}</p>
                            : <p style={{ fontSize: 10, fontWeight: 500, color: '#C8C5C2', lineHeight: 1, marginBottom: 3 }}>—</p>
                        }
                        {saldoProyDia !== undefined && (
                          <>
                            <p style={{ fontSize: 9, color: 'rgba(24,95,165,0.65)', lineHeight: 1, marginBottom: 1 }}>Proy.</p>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#185FA5', lineHeight: 1 }}>{fmtAbrev(saldoProyDia)}</p>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {/* Barra de nivel */}
                  {sem && saldoDia !== undefined && (
                    <div className="mt-auto w-full" style={{ height: 4, background: 'rgba(0,0,0,0.07)', borderRadius: 3, marginTop: 5 }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: saldoDia <= 0 ? '100%' : `${Math.min(100, Math.round((saldoDia / saldoMax) * 100))}%`,
                        background: sem.barColor,
                      }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 justify-end">
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#E24B4A' }} /> Cheque
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#7F77DD' }} /> Gasto manual
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#378ADD' }} /> GetNet
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: '#E1F5EE', border: '1px solid #0F6E56' }} /> Caja ok
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: '#FAEEDA', border: '1px solid #854F0B' }} /> Bajo piso
          </span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: '#FCEBEB', border: '1px solid #A32D2D' }} /> Negativo
          </span>
        </div>
      </div>

      {/* ── Modal: editar saldo ── */}
      {saldoModal && (
        <ModalShell title={`Actualizar ${CUENTA_META[saldoModal]?.label}`}
          onClose={() => setSaldoModal(null)} onSave={handleSaveSaldo} saving={savingSaldo}>
          <div className="space-y-4">
            <p className="text-sm text-stone-500">
              Saldo actual: <strong>{fmt$(saldosData?.saldos?.[saldoModal]?.monto ?? 0)}</strong>
              <span className="ml-2 text-stone-400">{hace(saldosData?.saldos?.[saldoModal]?.fecha)}</span>
            </p>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Nuevo saldo ($)</label>
              <input type="number" min="0" value={saldoVal} onChange={e => setSaldoVal(e.target.value)}
                placeholder="0" autoFocus
                className="w-full rounded-xl border border-stone-200 px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-violet-400" />
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
        <ModalShell title={gastoModal.mode === 'add' ? 'Agregar gasto manual' : 'Editar gasto'}
          onClose={() => setGastoModal(null)} onSave={handleSaveGasto} saving={savingGasto}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Concepto</label>
              <input type="text" value={gastoForm.concepto} placeholder="Ej: Edemsa, Sueldos…"
                onChange={e => setGastoForm(p => ({ ...p, concepto: e.target.value }))}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Monto ($)</label>
              <input type="number" min="0" value={gastoForm.monto} placeholder="0"
                onChange={e => setGastoForm(p => ({ ...p, monto: e.target.value }))}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Fecha</label>
              <input type="date" value={gastoForm.fecha}
                onChange={e => setGastoForm(p => ({ ...p, fecha: e.target.value }))}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Modal: detalle día ── */}
      {diaModal && (
        <ModalShell title={`${fmtFechaLarga(diaModal)}`} onClose={() => setDiaModal(null)} wide>
          <div className="space-y-3">

            {/* Egresos */}
            {diaEgresos.length > 0 && (
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Egresos</p>
                {diaEgresos.filter(e => e.tipo === 'cheque').map((c, i) => (
                  <div key={i} className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 mb-2">
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
                {diaEgresos.filter(e => e.tipo === 'gasto').map((g, i) => (
                  <div key={i} className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-stone-800 truncate">{g.concepto}</p>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <p className="font-bold text-violet-700">{fmt$(g.importe)}</p>
                        <button onClick={() => { setDiaModal(null); openEditGasto(g); }}
                          className="text-xs text-stone-400 hover:text-violet-600 font-medium">Editar</button>
                        <button onClick={() => handleDeleteGasto(g.id)}
                          className="text-xs text-stone-400 hover:text-red-500 font-medium">Borrar</button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-stone-50 border border-stone-100">
                  <span className="text-sm font-semibold text-stone-700">Total egresos</span>
                  <span className="font-bold text-stone-900">{fmt$(diaEgresos.reduce((s, e) => s + e.importe, 0))}</span>
                </div>
              </div>
            )}
            {diaEgresos.length === 0 && (
              <p className="text-sm text-stone-400 text-center py-2">Sin egresos en este día.</p>
            )}

            {/* GetNet */}
            {getnetDetDia.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#185FA5' }}>
                  {isGetnetConf ? '✓ Ingresos GetNet' : '⟳ Ingresos GetNet proyectados'}
                </p>
                {getnetDetDia.map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-blue-50">
                    <div>
                      <p className="text-sm font-medium text-stone-700">{g.tipo || '—'}</p>
                      <p className="text-xs text-stone-400">{g.cantidad} transacciones</p>
                    </div>
                    <p className="font-bold text-sm" style={{ color: '#378ADD' }}>+{fmt$(g.total)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 pb-1">
                  <span className="text-sm font-semibold" style={{ color: '#185FA5' }}>Total GetNet</span>
                  <span className="font-bold" style={{ color: '#185FA5' }}>
                    +{fmt$(getnetDetDia.reduce((s, g) => s + g.total, 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Saldo proyectado al cierre */}
            {diaProySaldo !== undefined && (
              <div className="rounded-xl px-4 py-2.5 mt-1" style={{ background: '#EBF3FD', border: '1px solid #B3D2F5' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: '#185FA5' }}>Saldo proyectado al cierre</span>
                  <span className="font-bold" style={{ color: '#185FA5' }}>{fmt$(diaProySaldo)}</span>
                </div>
              </div>
            )}

            <button onClick={() => { setDiaModal(null); openAddGasto(diaModal); }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors mt-1">
              + Agregar gasto para este día
            </button>
          </div>
        </ModalShell>
      )}

      {/* ── Modal: importar GetNet ── */}
      {getnetModal && (
        <ModalShell title="Importar informe GetNet" onClose={() => setGetnetModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-stone-600">
              Subí el Excel con las transacciones de los 3 posnet. El sistema lee la columna <strong>"Nombre Establecimiento"</strong> para identificar cada terminal y <strong>"Fecha Estimada de Pago"</strong> para proyectar los ingresos.
            </p>

            <input ref={getnetFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportGetnet} />

            <button onClick={() => getnetFileRef.current?.click()} disabled={importandoGN}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#185FA5' }}>
              {importandoGN ? 'Importando…' : 'Seleccionar archivo...'}
            </button>

            {importMsgGN && (
              <p className={`text-xs font-medium text-center px-3 py-2 rounded-lg ${importMsgGN.startsWith('✓') ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
                {importMsgGN}
              </p>
            )}

            <p className="text-xs text-stone-400">
              Podés re-subir el mismo rango de fechas sin duplicar — el sistema actualiza las transacciones existentes (por ejemplo, de Capturado a Liquidado). Las transacciones Rechazadas se guardan pero no se suman a la proyección.
            </p>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
