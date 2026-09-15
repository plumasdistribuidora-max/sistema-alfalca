import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import { soloNumero } from './campos';
import { plata, fechaCorta, fechaLarga, medioLabel } from '../proveedores/comunes';

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

// El texto que el encargado le manda a los dueños al cerrar. Va en texto plano con
// los asteriscos de WhatsApp: lo que importa es que se lea en el celular sin abrir
// nada, y que diga primero lo que hay que saber (venta, personal, qué no cerró).
function armarMensaje({ d, form, fecha, user }) {
  const t = d.totales;
  const n = v => `$ ${money.format(v)}`;
  const pct = v => v == null ? 's/d' : `${v.toFixed(1)}%`;
  const corto = nombre => nombre.replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
  const L = [];

  L.push(`*Cierre del día — ${FECHA_LARGA.format(new Date(`${fecha}T12:00:00`))}*`);
  L.push(`Venta: ${n(t.ventas_sistema)} · ${t.tickets} tickets`);
  L.push(`Ticket prom.: tiendas ${t.ticket_promedio_tiendas ? n(t.ticket_promedio_tiendas) : 's/d'} · café ${t.ticket_promedio_cafe ? n(t.ticket_promedio_cafe) : 's/d'}`);
  L.push(`Personal: ${t.horas.toFixed(1)} h${t.gasto_personal ? ` · ${n(t.gasto_personal)}` : ''}`
    + (t.horas_sobre_ventas != null ? ` · ${pct(t.horas_sobre_ventas)} de la venta ${t.horas_sobre_ventas <= t.objetivo ? '✅' : '🔴'} (meta ${pct(t.objetivo)})` : ''));
  if (t.horas_sin_valor > 0) L.push(`⚠️ ${t.horas_sin_valor.toFixed(1)} h sin valor hora cargado (no cuentan en personal)`);

  L.push('');
  L.push('*Por local*');
  for (const l of d.locales) {
    if (!l.ventas_sistema && !l.reportes.length) continue;
    const cierra = l.diferencia == null ? '' : Math.abs(l.diferencia) < 1 ? ' · cierra ✅' : ` · NO cierra 🔴 (${l.diferencia > 0 ? '+' : '−'}${money.format(Math.abs(l.diferencia))})`;
    const kpi = l.horas_sobre_ventas != null
      ? ` · personal ${pct(l.horas_sobre_ventas)}${l.objetivo != null ? (l.horas_sobre_ventas <= l.objetivo ? ' ✅' : ' 🔴') + ` (meta ${pct(l.objetivo)})` : ''}`
      : '';
    L.push(`• ${corto(l.nombre)}: ${n(l.ventas_sistema)} · ${l.tickets_sistema} tk · ${l.horas ? l.horas.toFixed(1) + ' h' : 'sin horas'}${kpi}${cierra}`);
  }
  for (const l of d.locales) {
    if (l.diferencia == null || Math.abs(l.diferencia) < 1) continue;
    const exp = form.explicaciones?.[l.local_id]?.trim();
    L.push(`  ${corto(l.nombre)} no cerró: reportaron ${n(l.ventas_reportadas)} contra ${n(l.ventas_sistema)} del sistema.${exp ? ` ${exp}` : ''}`);
  }

  const nv = d.novedades;
  const seccion = (titulo, items, f) => {
    if (!items?.length) return;
    L.push('');
    L.push(`*${titulo}*`);
    for (const it of items) L.push(`• ${corto(it.local)} (${it.turno.toLowerCase()}): ${f(it)}`);
  };
  seccion('Vencimientos', nv.vencimientos, it => `${it.producto || ''}${it.dias ? ` — ${it.dias} días` : ''}`);
  if (nv.vencimientos.length && form.acciones_vencimientos?.trim()) L.push(`  Acciones: ${form.acciones_vencimientos.trim()}`);
  seccion('Mantenimiento', nv.mantenimiento, it => it.texto);
  if (form.mantenimiento?.trim()) { if (!nv.mantenimiento.length) { L.push(''); L.push('*Mantenimiento*'); } L.push(`  Encargado: ${form.mantenimiento.trim()}`); }
  seccion('Faltantes de insumos', nv.faltantes, it => `${it.insumo}${it.proveedor ? ` (${it.proveedor})` : ''}`);
  seccion('Faltas y tardanzas', nv.ausencias, it => `${it.empleado} — ${it.motivo}`);
  if (form.faltas_tardanzas?.trim()) { if (!nv.ausencias.length) { L.push(''); L.push('*Faltas y tardanzas*'); } L.push(`  Encargado: ${form.faltas_tardanzas.trim()}`); }
  seccion('Quejas', nv.quejas, it => it.texto);
  if (nv.gastos?.length) {
    L.push('');
    L.push(`*Gastos de caja* · ${n(nv.total_gastos)}`);
    for (const g of nv.gastos) L.push(`• ${corto(g.local)} (${g.turno.toLowerCase()}): ${g.tipo ? `${g.tipo} — ` : ''}${g.detalle || ''} ${n(g.monto)}`);
  }

  // Facturas: las que entraron hoy y las que se pagaron, una por renglón, con el medio.
  const p = d.proveedores;
  if (p && (p.cargadas?.length || p.pagos.length || p.vencidas.length)) {
    L.push('');
    L.push('*Facturas*');
    if (p.cargadas?.length) {
      L.push(`Cargadas hoy: ${p.cargadas.length} por ${n(p.total_cargadas)}`);
      for (const f of p.cargadas) {
        L.push(`• ${f.proveedor}${f.numero ? ` ${f.numero}` : ''} — ${n(f.total)} (${corto(f.local_nombre || '')}${f.vencimiento ? `, vence ${fechaCorta(f.vencimiento)}` : ''})`);
      }
    } else {
      L.push('Cargadas hoy: ninguna');
    }
    if (p.pagos.length) {
      L.push(`Pagadas hoy: ${p.pagos.length} por ${n(p.pagado_hoy)}`);
      for (const pg of p.pagos) {
        L.push(`• ${pg.proveedor}${pg.factura_numero ? ` ${pg.factura_numero}` : ''} — ${n(pg.monto)} por ${medioLabel(pg.medio)}${pg.comprobante ? ` (${pg.comprobante})` : ''}`);
      }
    } else {
      L.push('Pagadas hoy: ninguna');
    }
    if (p.vencidas.length) L.push(`🔴 Vencidas sin pagar: ${p.vencidas.length} por ${n(p.total_vencido)}`);
    L.push(`Deuda total: ${n(p.deuda_total)} en ${p.facturas_abiertas} facturas`);
  }

  L.push('');
  L.push(`Controles: vencimientos ${form.vencimientos_ok ? '✅' : '❌'} · tienda ${form.control_tienda_ok ? '✅' : '❌'}`);
  L.push(`Cerrado por ${user?.nombre || 'el encargado'}`);
  return L.join('\n');
}

function MensajeDuenos({ texto, titulo = 'Mensaje para los dueños', sub = 'Ya está armado. Copialo y pegalo en el grupo, o abrilo directo en WhatsApp.' }) {
  const [copiado, setCopiado] = useState(false);
  const ref = useRef(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso de portapapeles (http, navegador viejo): se selecciona el texto
      // y se copia con el comando clásico.
      ref.current?.select();
      document.execCommand('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="card p-5 space-y-3 border-ahg-primary/40">
      <div>
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</h2>
        <p className="text-xs text-ahg-text/50">{sub}</p>
      </div>
      <textarea ref={ref} readOnly value={texto} rows={Math.min(22, texto.split('\n').length + 1)}
                className="input text-sm font-mono leading-relaxed whitespace-pre" />
      <div className="flex gap-2 flex-wrap">
        <button onClick={copiar} className="btn-primary flex-1">{copiado ? '✓ Copiado' : 'Copiar mensaje'}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"
           className="btn-secondary flex-1 text-center">Abrir en WhatsApp</a>
      </div>
    </div>
  );
}

// Las facturas de proveedores del día. No se llama "vencimientos" a propósito: en
// este informe esa palabra ya es la mercadería vencida en tienda.
function FacturasProveedores({ p }) {
  if (!p) return null;
  const hayAlgo = p.pagos.length || p.vencidas.length || p.semana.length;
  if (!hayAlgo) return null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Facturas de proveedores
        </h2>
        <span className="text-xs text-ahg-text/40">
          se debe {plata(p.deuda_total)} en {p.facturas_abiertas} facturas
        </span>
      </div>

      {p.pagos.length > 0 && (
        <div className="pl-3 border-l-2 border-green-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1.5">
            Se pagó hoy · {plata(p.pagado_hoy)}
          </p>
          <ul className="space-y-1 text-sm">
            {p.pagos.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-1">
                  <strong>{x.proveedor}</strong>
                  <span className="text-ahg-text/50"> · {x.factura_numero || 'sin número'} · {medioLabel(x.medio)}
                    {x.comprobante ? ` · ${x.comprobante}` : ''}</span>
                </span>
                <span className="tabular-nums font-semibold">{plata(x.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.vencidas.length > 0 && (
        <div className="pl-3 border-l-2 border-red-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-1.5">
            Vencidas · {p.vencidas.length} · {plata(p.total_vencido)}
          </p>
          <ul className="space-y-1 text-sm">
            {p.vencidas.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-1">
                  <strong>{f.proveedor}</strong>
                  <span className="text-ahg-text/50"> · {f.numero || 'sin número'} · {f.local_nombre} · venció el {fechaCorta(f.vencimiento)}</span>
                </span>
                <span className="tabular-nums font-semibold text-red-700">{plata(f.saldo)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.semana.length > 0 && (
        <div className="pl-3 border-l-2 border-amber-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
            Vencen esta semana · {p.semana.length} · {plata(p.total_semana)}
          </p>
          <ul className="space-y-1 text-sm">
            {p.semana.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-1">
                  <strong>{f.proveedor}</strong>
                  <span className="text-ahg-text/50"> · {f.numero || 'sin número'} · {fechaLarga(f.vencimiento)}</span>
                </span>
                <span className="tabular-nums font-semibold">{plata(f.saldo)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
    mantenimiento: '', faltas_tardanzas: '', control_tienda_ok: false,
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
          faltas_tardanzas:      c?.faltas_tardanzas || '',
          control_tienda_ok:     c?.control_tienda_ok ?? false,
        });
        setError(''); setFaltan([]);
      })
      .catch(err => setError(err.response?.data?.error || 'No se pudo armar el consolidado'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fecha]);

  const cerrado = d?.consolidado?.estado === 'cerrado';

  // Los viernes, además del diario, va el resumen de la semana (sábado a viernes).
  const esViernes = new Date(`${fecha}T12:00:00`).getDay() === 5;
  const [semana, setSemana] = useState(null);       // { texto } | { error } | null
  useEffect(() => {
    setSemana(null);
    if (!esViernes) return;
    let vivo = true;
    api.get('/consolidado/semana', { params: { hasta: fecha } })
      .then(r => { if (vivo) setSemana({ texto: r.data.data.texto }); })
      .catch(err => { if (vivo) setSemana({ error: err.response?.data?.error || 'No se pudo armar el resumen semanal' }); });
    return () => { vivo = false; };
  }, [fecha, esViernes, cerrado]);


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
    : t.horas_sobre_ventas <= t.objetivo ? 'bueno' : 'alerta';

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
        <Kpi titulo="Ticket promedio tiendas"
             valor={t.ticket_promedio_tiendas ? `$ ${money.format(t.ticket_promedio_tiendas)}` : '—'}
             detalle={`café: ${t.ticket_promedio_cafe ? `$ ${money.format(t.ticket_promedio_cafe)}` : '—'}`} />
        <Kpi titulo="Horas" valor={t.horas.toFixed(1)}
             detalle={t.gasto_personal ? `$ ${money.format(t.gasto_personal)} de personal` : 'sin valor hora'} />
        <Kpi titulo="Horas / ventas"
             valor={t.horas_sobre_ventas != null ? `${t.horas_sobre_ventas.toFixed(1)}%` : '—'}
             detalle={t.horas_sobre_ventas != null ? `meta: menos de ${t.objetivo?.toFixed(1)}% (tiendas y café pesados por venta)` : 'falta el valor hora'}
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
                <th className="table-th text-right">Meta</th>
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
                  <td className="table-td text-right tabular-nums text-ahg-text/50">{l.objetivo != null ? `${l.objetivo.toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
              {/* Total de la red. La diferencia solo vale si todos los locales están completos:
                  si a uno le falta un turno, lo reportado no es comparable. */}
              {(() => {
                const conTurnos = d.locales.filter(l => l.turnos_esperados > 0);
                const todosCompletos = conTurnos.length > 0 && conTurnos.every(l => l.completo);
                const dif = todosCompletos ? t.ventas_reportadas - t.ventas_sistema : null;
                return (
                  <tr className="border-t-2 border-ahg-primary/40 bg-ahg-bg font-semibold">
                    <td className="table-td">
                      Total locales
                      <span className="block text-xs font-normal text-ahg-text/40">{t.tickets} tickets</span>
                    </td>
                    <td className="table-td text-right tabular-nums">{money.format(t.ventas_sistema)}</td>
                    <td className="table-td text-right tabular-nums">
                      {todosCompletos ? money.format(t.ventas_reportadas) : <span className="text-ahg-text/30">—</span>}
                    </td>
                    <td className="table-td text-right tabular-nums">
                      {dif == null ? <span className="text-amber-600 text-xs font-medium">faltan turnos</span>
                        : Math.abs(dif) < 1 ? <span className="text-green-600">✓</span>
                        : <span className="text-red-600 font-bold">{dif > 0 ? '+' : '−'}{money.format(Math.abs(dif))}</span>}
                    </td>
                    <td className="table-td text-right tabular-nums">{t.horas ? t.horas.toFixed(1) : '—'}</td>
                    <td className="table-td text-right tabular-nums">{t.gasto_personal ? money.format(t.gasto_personal) : '—'}</td>
                    <td className="table-td text-right tabular-nums">
                      {t.horas_sobre_ventas == null ? <span className="text-ahg-text/30 font-normal">—</span>
                        : <span className={t.horas_sobre_ventas <= t.objetivo ? 'text-green-600' : 'text-red-600'}>
                            {t.horas_sobre_ventas.toFixed(1)}%
                          </span>}
                    </td>
                    <td className="table-td text-right tabular-nums text-ahg-text/50">{t.objetivo != null ? `${t.objetivo.toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })()}
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
        d.novedades.quejas.length || d.novedades.gastos?.length) > 0 && (
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
          <Novedades titulo={`Gastos de caja · $ ${money.format(d.novedades.total_gastos || 0)}`} items={d.novedades.gastos || []}
                     render={it => `${it.tipo ? `${it.tipo} — ` : ''}${it.detalle || 'sin detalle'} · $ ${money.format(it.monto)}`} />
        </div>
      )}

      <FacturasProveedores p={d.proveedores} />

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

        <div>
          <label className="label">Faltas y tardanzas</label>
          <textarea className="input" rows={2} disabled={cerrado}
                    placeholder="Lo que viste vos, además de lo que reportaron los turnos"
                    value={form.faltas_tardanzas}
                    onChange={e => cambiar({ faltas_tardanzas: e.target.value })} />
        </div>

        {cerrado ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-green-700 flex-1">
              Día cerrado. Ya lo pueden ver los dueños — y abajo tenés el mensaje para mandarles.
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

      {cerrado && <MensajeDuenos texto={armarMensaje({ d, form, fecha, user })} />}

      {esViernes && (
        semana?.texto
          ? <MensajeDuenos texto={semana.texto} titulo="Resumen de la semana"
                           sub={`Sábado a viernes, para mandar a los dueños junto con el diario.${cerrado ? '' : ' Se actualiza cuando cierres el día.'}`} />
          : <div className="card p-5 text-sm text-ahg-text/50">
              {semana?.error || 'Armando el resumen de la semana…'}
            </div>
      )}
    </div>
  );
}
