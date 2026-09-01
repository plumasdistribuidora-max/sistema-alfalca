import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import { soloNumero } from './campos';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function Kpi({ titulo, valor, detalle, tono = 'normal' }) {
  const fondo = {
    normal: 'bg-ahg-bg border-ahg-accent/40',
    bueno:  'bg-green-50 border-green-300',
    alerta: 'bg-red-50 border-red-300',
  }[tono];
  const texto = { normal: 'text-ahg-text', bueno: 'text-green-700', alerta: 'text-red-700' }[tono];

  return (
    <div className={`rounded-xl border p-3 ${fondo}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${texto}`} style={{ fontFamily: 'Nunito, sans-serif' }}>
        {valor}
      </p>
      {detalle && <p className="text-xs text-ahg-text/50">{detalle}</p>}
    </div>
  );
}

function Novedades({ titulo, items, render, tono = 'amber' }) {
  if (!items?.length) return null;
  const estilo = tono === 'red' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50';
  const txt    = tono === 'red' ? 'text-red-800' : 'text-amber-800';
  return (
    <div className={`rounded-xl border p-3 ${estilo}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${txt} mb-1.5`}>
        {titulo} · {items.length}
      </p>
      <ul className="space-y-1 text-sm text-ahg-text/80">
        {items.map((it, i) => (
          <li key={i}>
            <span className="text-ahg-text/40">{it.local} · {it.turno}</span> — {render(it)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CierreDelDia({ fecha, onCambio }) {
  const { user } = useAuth();
  const [d, setD]         = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [faltan, setFaltan] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const [form, setForm] = useState({
    explicaciones: {},
    vencimientos_ok: false, acciones_vencimientos: '',
    mantenimiento: '', control_tienda_ok: false,
  });

  const debounce = useRef(null);

  function cargar() {
    setCargando(true);
    api.get('/consolidado', { params: { fecha } })
      .then(r => {
        const data = r.data.data;
        setD(data);
        const c = data.consolidado;
        setForm({
          explicaciones: c?.explicaciones || {},
          vencimientos_ok:       c?.vencimientos_ok ?? false,
          acciones_vencimientos: c?.acciones_vencimientos || '',
          mantenimiento:         c?.mantenimiento || '',
          control_tienda_ok:     c?.control_tienda_ok ?? false,
        });
        setError(''); setFaltan([]);
      })
      .catch(err => setError(err.response?.data?.error || 'No se pudo armar el consolidado'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fecha]);

  const cerrado = d?.consolidado?.estado === 'cerrado';

  async function guardar(nuevo) {
    setGuardando(true);
    try {
      await api.post('/consolidado', { fecha, ...nuevo });
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  function cambiar(parcial) {
    const nuevo = { ...form, ...parcial };
    setForm(nuevo);
    setFaltan([]);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => guardar(nuevo), 800);
  }

  function explicar(localId, texto) {
    cambiar({ explicaciones: { ...form.explicaciones, [localId]: texto } });
  }

  async function cerrar() {
    setCerrando(true);
    setFaltan([]);
    try {
      clearTimeout(debounce.current);
      await guardar(form);
      await api.post('/consolidado/cerrar', { fecha });
      cargar(); onCambio?.();
    } catch (err) {
      const dd = err.response?.data;
      if (dd?.data?.faltan) setFaltan(dd.data.faltan);
      else setError(dd?.error || 'No se pudo cerrar el día');
    } finally {
      setCerrando(false);
    }
  }

  async function reabrir() {
    if (!confirm('¿Reabrir el día para que el encargado pueda corregirlo?')) return;
    try {
      await api.post('/consolidado/reabrir', { fecha });
      cargar(); onCambio?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo reabrir');
    }
  }

  if (cargando) return <p className="text-sm text-ahg-text/50 py-8">Cargando…</p>;
  if (!d) return <div className="card p-5 text-sm text-red-700 bg-red-50 border-red-300">{error}</div>;

  const t = d.totales;
  const kpiTono = t.horas_sobre_ventas == null ? 'normal'
    : t.horas_sobre_ventas <= 16 ? 'bueno' : 'alerta';

  return (
    <div className="space-y-5">
      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {faltan.length > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800 mb-1.5">Antes de cerrar el día:</p>
          <ul className="text-sm text-amber-700 list-disc pl-5 space-y-0.5">
            {faltan.map(f => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      {/* KPI del día */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Venta del día" valor={`$ ${money.format(t.ventas_sistema)}`}
             detalle={`${t.tickets} tickets`} />
        <Kpi titulo="Ticket promedio"
             valor={t.ticket_promedio ? `$ ${money.format(t.ticket_promedio)}` : '—'} />
        <Kpi titulo="Horas" valor={t.horas.toFixed(1)}
             detalle={t.gasto_personal ? `$ ${money.format(t.gasto_personal)} de personal` : 'sin valor hora'} />
        <Kpi titulo="Horas / ventas"
             valor={t.horas_sobre_ventas != null ? `${t.horas_sobre_ventas.toFixed(1)}%` : '—'}
             detalle={t.horas_sobre_ventas != null ? 'meta: menos de 16%' : 'falta el valor hora'}
             tono={kpiTono} />
      </div>

      {t.horas_sin_valor > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-sm text-amber-800">
          Hay <strong>{t.horas_sin_valor.toFixed(1)} horas</strong> cargadas de puestos que
          todavía no tienen valor hora, así que no están contadas en el gasto de personal.
          Cargalos en <strong>Valor hora</strong>.
        </div>
      )}

      {/* Control: lo que reportó el turno contra lo que trajo el Excel */}
      <div className="card p-5">
        <h2 className="font-bold mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Ventas y KPI por local
        </h2>
        <p className="text-xs text-ahg-text/50 mb-3">
          <strong>Sistema</strong> es el Excel de Fudo que importaste. <strong>Reportado</strong> es
          lo que cargó cada turno mirando la caja. Son dos fuentes distintas: si no coinciden,
          algo pasó y hay que explicarlo.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ahg-accent/30">
                <th className="table-th">Local</th>
                <th className="table-th text-right">Sistema</th>
                <th className="table-th text-right">Reportado</th>
                <th className="table-th text-right">Dif.</th>
                <th className="table-th text-right">Horas</th>
                <th className="table-th text-right">Personal</th>
                <th className="table-th text-right">Hs / vta</th>
              </tr>
            </thead>
            <tbody>
              {d.locales.map(l => (
                <tr key={l.local_id} className="border-b border-ahg-accent/20">
                  <td className="table-td font-medium">
                    {l.nombre}
                    <span className="block text-xs text-ahg-text/40">
                      {l.turnos_esperados > 0
                        ? `${l.turnos_reportados} de ${l.turnos_esperados} turnos`
                        : l.reportes.length
                          ? `${l.reportes.length} reporte${l.reportes.length === 1 ? '' : 's'}`
                          : 'sin reportes'}
                    </span>
                  </td>
                  <td className="table-td text-right tabular-nums">{money.format(l.ventas_sistema)}</td>
                  <td className="table-td text-right tabular-nums">
                    {l.turnos_reportados ? money.format(l.ventas_reportadas) : <span className="text-ahg-text/30">—</span>}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {l.turnos_esperados > 0 && !l.completo
                      ? <span className="text-amber-600 text-xs font-medium">faltan turnos</span>
                      : l.diferencia == null ? <span className="text-ahg-text/30">—</span>
                      : Math.abs(l.diferencia) < 1 ? <span className="text-green-600 font-semibold">✓</span>
                      : <span className="text-red-600 font-bold">
                          {l.diferencia > 0 ? '+' : '−'}{money.format(Math.abs(l.diferencia))}
                        </span>}
                  </td>
                  <td className="table-td text-right tabular-nums">{l.horas ? l.horas.toFixed(1) : '—'}</td>
                  <td className="table-td text-right tabular-nums">
                    {l.gasto_personal ? money.format(l.gasto_personal) : '—'}
                  </td>
                  <td className="table-td text-right tabular-nums font-semibold">
                    {l.horas_sobre_ventas == null ? <span className="text-ahg-text/30 font-normal">—</span>
                      : <span className={l.horas_sobre_ventas <= l.objetivo ? 'text-green-600' : 'text-red-600'}>
                          {l.horas_sobre_ventas.toFixed(1)}%
                        </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Explicación por cada local que no cierra */}
        {d.locales.map(l => {
          if (l.diferencia == null || Math.abs(l.diferencia) < 1) return null;
          return (
            <div key={l.local_id} className="mt-3 pl-3 border-l-2 border-red-400">
              <p className="text-xs font-semibold text-red-700 mb-1">
                {l.nombre}: el turno reportó $ {money.format(l.ventas_reportadas)} y el sistema
                trae $ {money.format(l.ventas_sistema)} — explicá la diferencia
              </p>
              <textarea
                className="input text-sm" rows={2} disabled={cerrado}
                value={form.explicaciones[l.local_id] || ''}
                onChange={e => explicar(l.local_id, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      {/* Lo que llegó de los turnos */}
      {(d.novedades.vencimientos.length || d.novedades.mantenimiento.length ||
        d.novedades.faltantes.length || d.novedades.ausencias.length ||
        d.novedades.quejas.length) > 0 && (
        <div className="space-y-2">
          <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Lo que reportaron los turnos
          </h2>
          <Novedades titulo="Vencimientos" items={d.novedades.vencimientos}
                     render={it => `${it.producto || ''} ${it.dias ? `(${it.dias} días)` : ''}`} />
          <Novedades titulo="Mantenimiento" items={d.novedades.mantenimiento} tono="red"
                     render={it => it.texto} />
          <Novedades titulo="Faltantes de insumos" items={d.novedades.faltantes}
                     render={it => `${it.insumo} — ${it.proveedor || 'sin proveedor'}`} />
          <Novedades titulo="Faltas y tardanzas" items={d.novedades.ausencias} tono="red"
                     render={it => `${it.empleado} — ${it.motivo}`} />
          <Novedades titulo="Quejas" items={d.novedades.quejas} render={it => it.texto} />
        </div>
      )}

      {/* Cierre */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Cierre del día</h2>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5" disabled={cerrado}
                 checked={form.vencimientos_ok}
                 onChange={e => cambiar({ vencimientos_ok: e.target.checked })} />
          Control de vencimientos realizado y chequeado
        </label>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5" disabled={cerrado}
                 checked={form.control_tienda_ok}
                 onChange={e => cambiar({ control_tienda_ok: e.target.checked })} />
          Control de tienda realizado
        </label>

        <div>
          <label className="label">Acciones tomadas sobre los vencimientos</label>
          <textarea className="input" rows={2} disabled={cerrado}
                    value={form.acciones_vencimientos}
                    onChange={e => cambiar({ acciones_vencimientos: e.target.value })} />
        </div>

        <div>
          <label className="label">Mantenimiento</label>
          <textarea className="input" rows={2} disabled={cerrado}
                    value={form.mantenimiento}
                    onChange={e => cambiar({ mantenimiento: e.target.value })} />
        </div>

        {cerrado ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-green-700 flex-1">
              Día cerrado. Ya lo pueden ver los dueños.
            </p>
            {esDueno(user) && (
              <button onClick={reabrir} className="btn-secondary">Reabrir el día</button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-ahg-text/40">{guardando ? 'Guardando…' : 'Guardado'}</span>
            <button onClick={cerrar} disabled={cerrando} className="btn-primary flex-1">
              {cerrando ? 'Cerrando…' : 'Cerrar el día y enviar a los dueños'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
