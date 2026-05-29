import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { shortName } from '../red/redUtils';

const MESES_FULL = {
  '01': 'Enero',   '02': 'Febrero', '03': 'Marzo',    '04': 'Abril',
  '05': 'Mayo',    '06': 'Junio',   '07': 'Julio',    '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};
const MESES_CORTOS = {
  '01':'ene','02':'feb','03':'mar','04':'abr','05':'may','06':'jun',
  '07':'jul','08':'ago','09':'sep','10':'oct','11':'nov','12':'dic',
};

function getMonthOptions() {
  const opts = [];
  const now  = new Date();
  for (let i = 0; i < 18; i++) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    opts.push({ value: `${d.getFullYear()}-${mm}`, label: `${MESES_FULL[mm]} ${d.getFullYear()}` });
  }
  return opts;
}
const MONTH_OPTIONS = getMonthOptions();

const KPI_ORDER = ['margen_bruto', 'margen_ebitda', 'breakeven', 'sueldos_venta', 'dias_caja'];
const KPI_META  = {
  margen_bruto:  { label: 'Margen Bruto',    fmt: 'pct', tooltip: 'Rentabilidad después de descontar el costo del producto (CMV).' },
  margen_ebitda: { label: 'Margen EBITDA',   fmt: 'pct', tooltip: 'Rentabilidad operativa antes de impuestos.' },
  breakeven:     { label: 'Cobertura BE',    fmt: 'pct', tooltip: 'Ventas como % del punto de equilibrio. 100% = breakeven alcanzado.' },
  sueldos_venta: { label: 'Sueldos / Venta', fmt: 'pct', tooltip: 'Cuánto pesan los sueldos sobre la venta neta. KPI invertido: menor es mejor.' },
  dias_caja:     { label: 'Días de Caja',    fmt: 'num', tooltip: 'Saldo de caja dividido por el gasto diario promedio del mes.' },
};

const SEM = {
  verde:     { dot: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', text: '#14532d' },
  ambar:     { dot: '#d97706', bg: '#fffbeb', border: '#fde68a', text: '#78350f' },
  rojo:      { dot: '#dc2626', bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' },
  sin_datos: { dot: '#a8a29e', bg: '#fafaf9', border: '#e7e5e4', text: '#78716c' },
};

const SEM_ICON = { verde: '✓ Verde', ambar: '⚠ Ámbar', rojo: '✗ Rojo', sin_datos: '—' };

function fmtKpi(cod, valor) {
  if (valor == null) return '—';
  if (cod === 'dias_caja') return valor.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' d';
  return valor.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%';
}

function semCliente(cod, valor, kpiInfo) {
  if (valor == null || !kpiInfo) return 'sin_datos';
  const { verde_min, ambar_min, invert } = kpiInfo;
  if (verde_min == null) return 'sin_datos';
  if (!invert) {
    if (valor >= verde_min) return 'verde';
    if (valor >= ambar_min) return 'ambar';
    return 'rojo';
  } else {
    if (valor <= verde_min) return 'verde';
    if (valor <= ambar_min) return 'ambar';
    return 'rojo';
  }
}

function shortMes(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return `${MESES_CORTOS[m] || m}'${y.slice(2)}`;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  const pts = (data || []).filter(d => d.valor != null);
  if (pts.length < 2) return <div style={{ width: 80, height: 24 }} />;
  const vals  = pts.map(d => d.valor);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const range = maxV - minV || 1;
  const W = 80, H = 24;
  const path = pts.map((p, i) => {
    const x = Math.round((i / (pts.length - 1)) * W);
    const y = Math.round(H - ((p.valor - minV) / range) * (H - 6) - 3);
    return `${x},${y}`;
  }).join(' ');
  const lx = W;
  const ly = Math.round(H - ((vals[vals.length - 1] - minV) / range) * (H - 6) - 3);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" style={{ display: 'block' }}>
      <polyline points={path} stroke={color} strokeWidth="1.5" fill="none"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-100 text-stone-400 text-xs cursor-help hover:bg-stone-200 flex-shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={e => e.stopPropagation()}
    >
      ?
      {show && (
        <span
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-52 bg-stone-800 text-white text-xs rounded-xl px-3 py-2 shadow-xl pointer-events-none"
          style={{ lineHeight: 1.5 }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({ cod, kpi, sparkline, onClick }) {
  const meta  = KPI_META[cod];
  const sem   = kpi?.semaforo || 'sin_datos';
  const style = SEM[sem] || SEM.sin_datos;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl p-4 flex flex-col gap-2 border w-full text-left transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer"
      style={{ background: style.bg, borderColor: style.border }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: style.dot }} />
          <span className="text-xs font-semibold truncate" style={{ color: style.text }}>{meta.label}</span>
        </div>
        <Tooltip text={meta.tooltip} />
      </div>

      <div>
        <p className="text-2xl font-bold leading-tight" style={{ color: style.text }}>
          {fmtKpi(cod, kpi?.valor)}
        </p>
        {kpi?.verde_min != null && (
          <p className="text-xs mt-0.5" style={{ color: style.dot, opacity: 0.8 }}>
            meta {kpi.invert ? '≤' : '≥'} {kpi.verde_min}{cod !== 'dias_caja' ? '%' : 'd'}
          </p>
        )}
      </div>

      {sparkline && <Sparkline data={sparkline} color={style.dot} />}
    </button>
  );
}

// ── AlertasPanel ──────────────────────────────────────────────────────────────

function AlertasPanel({ alertas }) {
  if (!alertas?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Alertas del período</p>
      {alertas.map(a => {
        const style = SEM[a.semaforo] || SEM.sin_datos;
        return (
          <div
            key={a.kpi}
            className="flex items-center gap-3 rounded-xl px-4 py-3 border text-sm"
            style={{ background: style.bg, borderColor: style.border }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: style.dot }} />
            <span className="font-semibold flex-1" style={{ color: style.text }}>{a.label}</span>
            <span className="font-bold text-base" style={{ color: style.dot }}>
              {fmtKpi(a.kpi, a.valor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── TablaEvolucion ────────────────────────────────────────────────────────────

function TablaEvolucion({ sparklines, kpis }) {
  const codigos = ['margen_bruto', 'margen_ebitda', 'breakeven', 'sueldos_venta'];
  const meses   = sparklines?.margen_bruto?.map(d => d.mes) || [];
  if (!meses.length) return null;

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">Evolución 6 meses</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-max border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left py-1.5 px-3 text-stone-400 font-semibold border-b border-stone-100 bg-white sticky left-0">KPI</th>
              {meses.map(m => (
                <th key={m} className="py-1.5 px-2 text-center text-stone-400 font-semibold border-b border-stone-100">
                  {shortMes(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codigos.map(cod => (
              <tr key={cod} className="hover:bg-stone-50">
                <td className="py-2 px-3 font-medium text-stone-600 bg-white sticky left-0 border-b border-stone-50">
                  {KPI_META[cod].label}
                </td>
                {meses.map(m => {
                  const entry = sparklines[cod]?.find(d => d.mes === m);
                  const val   = entry?.valor;
                  const sem   = semCliente(cod, val, kpis?.[cod]);
                  const style = SEM[sem] || SEM.sin_datos;
                  return (
                    <td key={m} className="py-2 px-2 text-center border-b border-stone-50">
                      <span
                        className="inline-block px-2 py-0.5 rounded-lg font-semibold"
                        style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
                      >
                        {fmtKpi(cod, val)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TablaComparativa ──────────────────────────────────────────────────────────

function TablaComparativa({ data, kpis, onCellClick }) {
  if (!data?.tabla?.length) return null;
  const { locales, tabla } = data; // locales = [{id, nombre}]

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">Por local</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-max border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left py-1.5 px-3 text-stone-400 font-semibold border-b border-stone-100 bg-white sticky left-0">Local</th>
              {tabla.map(row => (
                <th key={row.kpi} className="py-1.5 px-2 text-center text-stone-400 font-semibold border-b border-stone-100">
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locales.map(loc => (
              <tr key={loc.id} className="hover:bg-stone-50">
                <td className="py-2 px-3 font-medium text-stone-600 bg-white sticky left-0 border-b border-stone-50">
                  {shortName(loc.nombre)}
                </td>
                {tabla.map(row => {
                  const cell  = row.por_local[loc.nombre];
                  const style = SEM[cell?.semaforo || 'sin_datos'] || SEM.sin_datos;
                  return (
                    <td key={row.kpi} className="py-2 px-2 text-center border-b border-stone-50">
                      <button
                        type="button"
                        onClick={() => onCellClick(row.kpi, String(loc.id), loc.nombre)}
                        className="cursor-pointer hover:opacity-75 transition-opacity"
                        title={`Ver detalle: ${row.label} · ${shortName(loc.nombre)}`}
                      >
                        <span
                          className="inline-block px-2 py-0.5 rounded-lg font-semibold"
                          style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
                        >
                          {fmtKpi(row.kpi, cell?.valor)}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-stone-50">
              <td className="py-2 px-3 font-bold text-stone-800 sticky left-0 bg-stone-50">Grupo</td>
              {tabla.map(row => {
                const style = SEM[row.grupo?.semaforo || 'sin_datos'] || SEM.sin_datos;
                return (
                  <td key={row.kpi} className="py-2 px-2 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded-lg font-bold"
                      style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
                    >
                      {fmtKpi(row.kpi, row.grupo?.valor)}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── UmbralesModal ─────────────────────────────────────────────────────────────

function UmbralesModal({ kpis, onClose, onSaved }) {
  const [edit, setEdit] = useState(() => {
    const init = {};
    for (const cod of KPI_ORDER) {
      init[cod] = {
        verde_min: String(kpis[cod]?.verde_min ?? ''),
        ambar_min: String(kpis[cod]?.ambar_min ?? ''),
        invert:    kpis[cod]?.invert ?? false,
      };
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const umbrales = {};
      for (const cod of KPI_ORDER) {
        umbrales[cod] = {
          verde_min: parseFloat(edit[cod].verde_min) || 0,
          ambar_min: parseFloat(edit[cod].ambar_min) || 0,
          invert:    edit[cod].invert,
        };
      }
      await api.post('/red/finanzas/kpi/umbrales', { umbrales });
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Error al guardar umbrales.');
    } finally {
      setSaving(false);
    }
  }

  function upd(cod, field, val) {
    setEdit(p => ({ ...p, [cod]: { ...p[cod], [field]: val } }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Umbrales de semáforo</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 text-sm">
          <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-stone-400 px-1 pb-1">
            <span>KPI</span><span className="text-center">Verde</span><span className="text-center">Ámbar</span><span className="text-center">Inv.</span>
          </div>
          {KPI_ORDER.map(cod => (
            <div key={cod} className="grid grid-cols-4 gap-2 items-center bg-stone-50 rounded-xl px-3 py-2.5">
              <div>
                <p className="font-medium text-stone-700 text-xs leading-tight">{KPI_META[cod].label}</p>
                <p className="text-stone-400 text-xs">{edit[cod].invert ? '≤ mejor' : '≥ mejor'}</p>
              </div>
              <input type="number" step="0.5" value={edit[cod].verde_min}
                onChange={e => upd(cod, 'verde_min', e.target.value)}
                className="w-full text-right rounded-lg border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <input type="number" step="0.5" value={edit[cod].ambar_min}
                onChange={e => upd(cod, 'ambar_min', e.target.value)}
                className="w-full text-right rounded-lg border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <div className="flex justify-center">
                <input type="checkbox" checked={edit[cod].invert}
                  onChange={e => upd(cod, 'invert', e.target.checked)}
                  className="w-4 h-4 accent-violet-600" />
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-xl font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: '#4C1D95' }}>
            {saving ? 'Guardando…' : 'Guardar umbrales'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DetailModal ───────────────────────────────────────────────────────────────

function DetailModal({ kpi, local, mes, onClose, onSwitchTab }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const timerRef              = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(true), 10);
    api.get('/red/finanzas/kpi/detalle', { params: { kpi, local, mes } })
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
    return () => clearTimeout(timerRef.current);
  }, [kpi, local, mes]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function close() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function gotoModulo(linkModulo) {
    close();
    if (onSwitchTab) {
      const tab = linkModulo === 'cashflow' ? 'cashflow' : 'eerr';
      setTimeout(() => onSwitchTab(tab), 220);
    }
  }

  const meta     = KPI_META[kpi] || {};
  const sem      = data?.semaforo || 'sin_datos';
  const semStyle = SEM[sem] || SEM.sin_datos;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: `rgba(0,0,0,${visible ? 0.45 : 0})`, transition: 'background 0.2s ease' }}
      onClick={close}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-[560px] max-h-[90vh] flex flex-col"
        style={{
          transform:  visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          opacity:    visible ? 1 : 0,
          transition: 'transform 0.2s ease, opacity 0.2s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {data && (
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">{data.contexto}</p>
              )}
              <h3 className="text-lg font-bold text-stone-900 leading-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {data?.kpi_label || meta.label || kpi}
              </h3>
            </div>
            <button
              onClick={close}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600 flex-shrink-0"
            >✕</button>
          </div>
        </div>

        {/* Cuerpo scrolleable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-stone-100 rounded-xl animate-pulse" />)}
            </div>
          )}

          {!loading && data && (
            <>
              {/* Qué es */}
              <section>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1.5">Qué es</p>
                <p className="text-sm text-stone-600 leading-relaxed">{data.descripcion}</p>
              </section>

              {/* Fórmula */}
              <section>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1.5">Fórmula</p>
                <div className="bg-stone-50 rounded-xl px-4 py-3 space-y-2">
                  <code className="text-sm font-mono text-stone-700 block">{data.formula_template}</code>
                  {data.formula_aplicada && (
                    <code className="text-xs font-mono text-stone-400 block">{data.formula_aplicada}</code>
                  )}
                </div>
              </section>

              {/* Componentes */}
              <section>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1.5">De dónde salen los datos</p>
                <div className="rounded-xl border border-stone-100 overflow-hidden text-sm">
                  <div className="grid px-4 py-2 bg-stone-50 text-xs font-semibold text-stone-400 border-b border-stone-100"
                    style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <span>Componente</span>
                    <span className="text-right pr-4">Valor</span>
                    <span className="text-center w-20">Fuente</span>
                  </div>

                  {data.componentes.map((c, i) => {
                    const neg = c.signo === -1;
                    const tot = c.es_total;
                    const sub = c.es_sub;
                    const res = c.es_resultado;

                    let valStr;
                    if (c.valor == null) {
                      valStr = '—';
                    } else if (c.formato === 'ars') {
                      const abs = Math.round(Math.abs(c.valor));
                      valStr = (neg ? '−' : '') + '$' + abs.toLocaleString('es-AR');
                    } else if (c.formato === 'pct') {
                      valStr = Number(c.valor).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%';
                    } else {
                      valStr = c.valor != null ? String(Math.round(c.valor)) : '—';
                    }

                    return (
                      <div
                        key={i}
                        className={`grid items-center px-4 py-2.5 border-b border-stone-50 last:border-0 ${tot ? 'bg-stone-50' : 'bg-white'}`}
                        style={{ gridTemplateColumns: '1fr auto auto' }}
                      >
                        <span className={`truncate pr-2 ${res ? 'font-bold text-stone-900' : tot ? 'font-semibold text-stone-700' : sub ? 'text-stone-400 text-xs pl-4' : 'text-stone-600'}`}>
                          {sub && <span className="mr-1 text-stone-300">↳</span>}
                          {c.label}
                        </span>
                        <span className={`text-right text-sm whitespace-nowrap pr-4 ${neg ? 'text-red-500 font-medium' : res ? 'font-bold text-stone-900' : tot ? 'font-semibold text-stone-700' : 'text-stone-600'}`}>
                          {valStr}
                        </span>
                        <span className="text-center w-20 flex-shrink-0">
                          {c.link_modulo ? (
                            <button
                              type="button"
                              onClick={() => gotoModulo(c.link_modulo)}
                              className="text-xs font-semibold text-violet-600 hover:text-violet-800 hover:underline whitespace-nowrap"
                            >
                              {c.link_modulo === 'cashflow' ? 'Cash Flow →' : 'EERR →'}
                            </button>
                          ) : (
                            <span className="text-xs text-stone-200">—</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer resultado */}
        {!loading && data && (
          <div
            className="px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-b-2xl border-t"
            style={{ background: semStyle.bg, borderColor: semStyle.border }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: semStyle.dot }}>{SEM_ICON[sem]}</p>
              <p className="text-xs mt-0.5" style={{ color: semStyle.text, opacity: 0.7 }}>
                meta {data.invert ? '≤' : '≥'} {data.verde_min}{kpi === 'dias_caja' ? ' d' : '%'}
              </p>
            </div>
            <p className="text-3xl font-bold" style={{ color: semStyle.text }}>
              {fmtKpi(kpi, data.valor)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function KpiSection({ onSwitchTab }) {
  const { user }  = useAuth();
  const isAdmin   = user?.rol?.toLowerCase() === 'admin';

  const [selMes,       setSelMes]       = useState(MONTH_OPTIONS[0]?.value || '');
  const [data,         setData]         = useState(null);
  const [comparativa,  setComparativa]  = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [umbralesOpen, setUmbralesOpen] = useState(false);
  const [detalle,      setDetalle]      = useState(null); // { kpi, local }

  useEffect(() => {
    if (!selMes) return;
    setLoading(true);
    setData(null);
    setComparativa(null);
    Promise.all([
      api.get('/red/finanzas/kpi',            { params: { mes: selMes } }),
      api.get('/red/finanzas/kpi/comparativa', { params: { mes: selMes } }),
    ])
      .then(([kpiRes, compRes]) => {
        setData(kpiRes.data.data);
        setComparativa(compRes.data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selMes]);

  function reload() {
    if (!selMes) return;
    setLoading(true);
    Promise.all([
      api.get('/red/finanzas/kpi',            { params: { mes: selMes } }),
      api.get('/red/finanzas/kpi/comparativa', { params: { mes: selMes } }),
    ])
      .then(([kpiRes, compRes]) => { setData(kpiRes.data.data); setComparativa(compRes.data.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-4">

      {/* Selector + umbrales */}
      <div className="flex items-center gap-2">
        <select
          value={selMes}
          onChange={e => setSelMes(e.target.value)}
          className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isAdmin && (
          <button
            onClick={() => setUmbralesOpen(true)}
            className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-medium text-stone-600 hover:bg-stone-50 flex-shrink-0"
          >
            Umbrales
          </button>
        )}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {KPI_ORDER.map(cod => (
              <KpiCard
                key={cod}
                cod={cod}
                kpi={data.kpis[cod]}
                sparkline={cod !== 'dias_caja' ? data.sparklines?.[cod] : null}
                onClick={() => setDetalle({ kpi: cod, local: 'grupo' })}
              />
            ))}
          </div>

          {/* Alertas */}
          {data.alertas?.length > 0 && <AlertasPanel alertas={data.alertas} />}

          {/* Tabla comparativa */}
          <TablaComparativa
            data={comparativa}
            kpis={data.kpis}
            onCellClick={(kpi, localId) => setDetalle({ kpi, local: localId })}
          />

          {/* Tabla evolución */}
          {data.sparklines && <TablaEvolucion sparklines={data.sparklines} kpis={data.kpis} />}
        </>
      )}

      {/* Modal umbrales */}
      {umbralesOpen && data?.kpis && (
        <UmbralesModal
          kpis={data.kpis}
          onClose={() => setUmbralesOpen(false)}
          onSaved={() => { setUmbralesOpen(false); reload(); }}
        />
      )}

      {/* Modal detalle */}
      {detalle && (
        <DetailModal
          kpi={detalle.kpi}
          local={detalle.local}
          mes={selMes}
          onClose={() => setDetalle(null)}
          onSwitchTab={onSwitchTab}
        />
      )}

    </div>
  );
}
