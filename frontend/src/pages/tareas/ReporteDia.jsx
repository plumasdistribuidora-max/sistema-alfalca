import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api';
import AvisosBoton from '../../components/AvisosBoton';
import { pesos, hoyStr, duracion, PuntoLocal, Chip, Cargando, MensajeError } from './comunes';

// El reporte del día. Es el mismo que el PDF, en el mismo orden: solo cambia dónde se
// ve (Martín, 11/10/2026). Los datos los arma el servidor una sola vez para los dos.

function correr(f, n) {
  const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const n0 = v => num.format(Math.round(Number(v) || 0));
const n1 = v => (v == null ? '—' : Number(v).toFixed(1).replace('.', ','));
const pct = v => (v == null ? 's/d' : `${Number(v).toFixed(1).replace('.', ',')} %`);
const ddmm = f => (f ? f.split('-').reverse().slice(0, 2).join('/') : '');

function Var({ v }) {
  if (v == null) return <span className="text-ahg-text/40">—</span>;
  return <span className={`font-bold ${v >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(1).replace('.', ',')} %</span>;
}

// En qué está una tarea, dicho corto y con color.
function EstadoChip({ t }) {
  if (!t) return null;
  if (t.estado === 'terminada') return <Chip tono="verde">✓ {t.aprobada_sola ? 'Aprobada sola' : 'Aprobada'}</Chip>;
  if (t.estado === 'por_aprobar') return <Chip tono="ambar">Por aprobar</Chip>;
  if (t.estado === 'en_curso') return t.dias_vencida > 0 ? <Chip tono="rojo">Vencida {t.dias_vencida} d</Chip> : <Chip tono="azul">En curso</Chip>;
  return <Chip tono="rojo">Sin tomar</Chip>;
}

async function bajarPdf(fecha) {
  const r = await api.get('/tareas/dia/pdf', { params: { fecha }, responseType: 'blob' });
  return new File([r.data], `Reporte del día ${fecha}.pdf`, { type: 'application/pdf' });
}

// El PDF viene con el token de sesión: se baja como archivo. En el celular se comparte
// con el menú del teléfono (WhatsApp lo recibe como adjunto); en la computadora se abre.
function BotonesPdf({ fecha }) {
  const [estado, setEstado] = useState('');
  const puedeCompartir = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;
  async function hacer(modo) {
    setEstado('armando');
    try {
      const archivo = await bajarPdf(fecha);
      if (modo === 'compartir' && puedeCompartir && navigator.canShare({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], title: archivo.name }); }
        catch (err) { if (err?.name !== 'AbortError') throw err; }
      } else {
        const url = URL.createObjectURL(archivo);
        if (modo === 'ver') window.open(url, '_blank');
        else { const a = document.createElement('a'); a.href = url; a.download = archivo.name; a.click(); }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setEstado('');
    } catch { setEstado('error'); }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {puedeCompartir && <button onClick={() => hacer('compartir')} disabled={estado === 'armando'} className="btn-primary !py-1.5 text-sm">{estado === 'armando' ? 'Armando…' : 'Compartir PDF'}</button>}
      <button onClick={() => hacer(puedeCompartir ? 'bajar' : 'ver')} disabled={estado === 'armando'} className={`${puedeCompartir ? 'btn-secondary' : 'btn-primary'} !py-1.5 text-sm`}>
        {estado === 'armando' && !puedeCompartir ? 'Armando…' : puedeCompartir ? 'Bajar' : 'Ver PDF'}
      </button>
      {estado === 'error' && <span className="text-sm text-red-700">No se pudo armar. Probá de nuevo.</span>}
    </div>
  );
}

function Card({ titulo, sub, children }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <h2 className="font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</h2>
        {sub && <span className="text-xs text-ahg-text/55">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ titulo, valor, children, tono }) {
  const tonos = { verde: 'bg-emerald-50 border-emerald-200 text-emerald-800', rojo: 'bg-red-50 border-red-200 text-red-800' };
  return (
    <div className={`rounded-xl border p-3 ${tonos[tono] || 'bg-white border-ahg-accent/30'}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{titulo}</p>
      <p className="font-bold leading-tight mt-0.5 tabular-nums" style={{ fontFamily: 'Nunito, sans-serif', fontSize: 21 }}>{valor}</p>
      <p className="text-xs mt-0.5 opacity-80">{children}</p>
    </div>
  );
}

function PersonalCelda({ l }) {
  if (l.personal == null) return <span className="text-ahg-text/40 italic">{l.personal_sin_dato ? 'sin dato' : '—'}</span>;
  const malo = l.objetivo != null && l.personal > l.objetivo;
  return <span className={`font-semibold ${malo ? 'text-red-700' : 'text-emerald-700'}`}>{pct(l.personal)}{l.objetivo != null ? ` / ${Math.round(l.objetivo)}` : ''}</span>;
}

function FudoCelda({ l }) {
  if (!l.fudo) return <Chip>Fudo sin cargar</Chip>;
  if (l.diferencia == null) return l.reportes.esperados ? <Chip tono="ambar">faltan turnos</Chip> : <span className="text-ahg-text/40">—</span>;
  if (Math.abs(l.diferencia) < 1) return <Chip tono="verde">cierra</Chip>;
  const t = l.tarea_ventas;
  return <Chip tono={t?.estado === 'terminada' ? 'verde' : 'rojo'}>{l.diferencia > 0 ? '+' : '−'}{n0(Math.abs(l.diferencia))}{t?.estado === 'terminada' ? ' · aprobada' : ''}</Chip>;
}

// La deuda con proveedores, aparte: se abre desde Plata. Una tarjeta por proveedor
// (variante B, elegida por Martín el 11/10/2026) con su total y sus facturas. Sin
// vencimientos: se mira cuánto hace que está sin pagar cada una.
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MEDIO = { santander: 'Santander', mercadopago: 'Mercado Pago', galicia: 'Galicia', efectivo: 'Efectivo', cheque: 'Cheque' };
const colorDias = d => (d > 30 ? 'text-red-700' : d > 15 ? 'text-amber-700' : 'text-ahg-text');

function TarjetaProveedor({ p }) {
  const [todas, setTodas] = useState(false);
  const facturas = todas ? p.lista : p.lista.slice(0, 3);
  const resto = p.deuda - p.mas_15 - p.mas_30;
  return (
    <div className="bg-white border border-ahg-accent/40 rounded-xl p-3 grid gap-2 content-start">
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold" style={{ fontFamily: 'Nunito, sans-serif', fontSize: 15 }}>{p.proveedor}</span>
        <Chip tono={p.mas_vieja > 30 ? 'rojo' : p.mas_vieja > 15 ? 'ambar' : 'gris'}>{p.mas_vieja} días</Chip>
      </div>
      <p className="font-bold tabular-nums leading-none" style={{ fontFamily: 'Nunito, sans-serif', fontSize: 22 }}>{pesos(p.deuda)}</p>
      <p className="text-[11.5px] text-ahg-text/60">
        {p.facturas} factura{p.facturas === 1 ? '' : 's'} · la más vieja {p.mas_vieja} días
        {p.medio ? ` · ${MEDIO[p.medio] || p.medio}` : ''}{p.dias_pago?.length ? ` · cobra ${p.dias_pago.map(d => DIA_CORTO[d]).join(', ')}` : ''}
      </p>
      <span className="flex h-1.5 rounded-full overflow-hidden bg-ahg-bg" title="Gris: hasta 15 días · ámbar: 16 a 30 · rojo: más de 30">
        <i style={{ width: `${resto / p.deuda * 100}%`, background: '#9a9c9e' }} />
        <i style={{ width: `${p.mas_15 / p.deuda * 100}%`, background: '#a45a09' }} />
        <i style={{ width: `${p.mas_30 / p.deuda * 100}%`, background: '#b3261e' }} />
      </span>
      <table className="w-full text-xs">
        <tbody>
          {facturas.map(f => (
            <tr key={f.id} className="border-t border-ahg-accent/25">
              <td className="py-1"><b className={colorDias(f.dias)}>{f.dias} d</b> · {ddmm(f.fecha)} · {f.numero || 'sin número'}{f.local && f.local !== 'Café Peatonal' ? <span className="text-ahg-text/45"> · {f.local}</span> : null}</td>
              <td className="py-1 text-right tabular-nums">{n0(f.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.lista.length > 3 && (
        <button onClick={() => setTodas(x => !x)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ahg-accent/60 hover:bg-ahg-bg justify-self-start">
          {todas ? 'Ver solo las 3 más viejas' : `Ver las ${p.lista.length} facturas`}
        </button>
      )}
    </div>
  );
}

function PanelDeuda({ deuda, fecha, onCerrar }) {
  const max = Math.max(1, ...deuda.tramos.map(t => t.monto));
  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-3" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="bg-ahg-bg rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-auto p-4 sm:p-5" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg" style={{ fontFamily: 'Nunito, sans-serif' }}>Deuda con proveedores</h2>
            <p className="text-xs text-ahg-text/55">Al {ddmm(fecha)} · las facturas no tienen vencimiento: se mira cuánto hace que están sin pagar.</p>
          </div>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full bg-white flex-shrink-0" aria-label="Cerrar">✕</button>
        </div>
        <div className="grid sm:grid-cols-[auto_1fr] gap-3 mt-3 bg-white rounded-xl p-3 items-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ahg-text/55">Deuda total</p>
            <p className="font-bold text-2xl tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>{pesos(deuda.total)}</p>
            <p className="text-xs text-ahg-text/55">{deuda.facturas} facturas · {deuda.por_proveedor.length} proveedores</p>
          </div>
          <div className="grid gap-1">
            {deuda.tramos.map((t, i) => (
              <div key={t.label} className="grid grid-cols-[92px_1fr_auto] gap-2 items-center text-xs">
                <span>{t.label}</span>
                <span className="h-2 rounded-full bg-ahg-bg overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${t.monto / max * 100}%`, background: i === 3 ? '#b3261e' : i === 2 ? '#a45a09' : '#9a9c9e' }} /></span>
                <span className="tabular-nums font-semibold text-right">{pesos(t.monto)} <span className="text-ahg-text/45 font-normal">· {t.facturas}</span></span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {deuda.por_proveedor.map(p => <TarjetaProveedor key={p.proveedor} p={p} />)}
        </div>
        <Link to="/proveedores" className="inline-block mt-3 text-sm underline text-ahg-text/70">Ir a Proveedores para pagar →</Link>
      </div>
    </div>
  );
}

export default function ReporteDia() {
  const [params, setParams] = useSearchParams();
  const fecha = params.get('fecha');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [verDeuda, setVerDeuda] = useState(false);

  useEffect(() => {
    setD(null);
    api.get('/tareas/dia', { params: fecha ? { fecha } : {} })
      .then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el reporte del día'));
  }, [fecha]);

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  const ir = n => setParams({ fecha: correr(d.fecha, n) });
  const k = d.kpis;
  const decidir = d.para_decidir.tareas.length + d.para_decidir.gastos.length;
  const kEnMeta = k.personal != null && k.objetivo != null && k.personal <= k.objetivo;
  const pl = d.plata;
  const refCorta = `${d.ref.larga.split(' ')[0].slice(0, 3)} ${ddmm(d.ref.fecha)}`;

  return (
    <div className="space-y-3 max-w-5xl">
      <header className="rounded-2xl px-4 py-3.5 text-white flex items-center justify-between gap-3 flex-wrap" style={{ background: '#45484c' }}>
        <div>
          <p className="text-white/55 uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>Reporte del día</p>
          <h1 className="text-xl font-bold first-letter:uppercase" style={{ fontFamily: 'Nunito, sans-serif' }}>{d.fecha_larga}</h1>
          <p className="text-xs text-white/70">
            {d.completo ? 'Fudo de los 5 locales' : `Falta el Fudo de ${d.sin_fudo.join(', ')}`} · {d.reportes.recibidos} de {d.reportes.esperados} reportes de turno
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => ir(-1)} className="text-white/80 hover:text-white px-2 text-lg" aria-label="Día anterior">◀</button>
          {d.fecha < correr(hoyStr(), -1) && <button onClick={() => ir(1)} className="text-white/80 hover:text-white px-2 text-lg" aria-label="Día siguiente">▶</button>}
        </div>
      </header>

      <BotonesPdf fecha={d.fecha} />
      <AvisosBoton />

      {decidir > 0 && (
        <section className="card p-4 border-2 border-amber-300 bg-amber-50/40">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h2 className="font-bold text-amber-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Para decidir · {decidir}</h2>
            <span className="text-xs text-ahg-text/55">lo primero que hay que mirar</span>
          </div>
          {d.para_decidir.tareas.map(t => (
            <Link key={t.id} to={`/tareas/${t.id}`} className="flex gap-2 items-start py-2 border-t border-amber-200 first:border-0 hover:bg-amber-50">
              <Chip tono="ambar">Por aprobar</Chip>
              <span className="text-sm flex-1 min-w-0"><b>{t.local}</b> · {t.titulo}
                <span className="block text-xs text-ahg-text/60">{t.cierre_tipo === 'descarte' ? 'Pide descartarla' : 'Dice'}: {t.resultado}{t.resultado_monto ? ` (${pesos(t.resultado_monto)})` : ''} · esperando hace {duracion(t.esperando_ms)}</span>
              </span>
            </Link>
          ))}
          {d.para_decidir.gastos.map(g => (
            <Link key={`g${g.id}`} to={`/tareas/${g.tarea_id}`} className="flex gap-2 items-start py-2 border-t border-amber-200 hover:bg-amber-50">
              <Chip tono="azul">Gasto</Chip>
              <span className="text-sm flex-1 min-w-0"><b>{g.local_corto}</b> · {g.concepto} {pesos(g.monto)}<span className="block text-xs text-ahg-text/60">{g.titulo}</span></span>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi titulo="Venta del día" valor={pesos(k.venta)}><Var v={k.var_venta} /> vs. {d.ref.larga} ({pesos(k.venta_ref)})</Kpi>
        <Kpi titulo="Docenas tiendas" valor={n1(k.docenas)}><Var v={k.var_docenas} /> vs. {d.ref.larga} ({n1(k.docenas_ref)})</Kpi>
        <Kpi titulo="Mes hasta hoy" valor={pesos(k.mes)}><Var v={k.var_mes} /> vs. {ddmm(d.mes.pasado_desde)} al {ddmm(d.mes.pasado_hasta)} ({pesos(k.mes_pasado)})</Kpi>
        <Kpi titulo="Personal / venta neta" valor={pct(k.personal)} tono={k.personal == null ? undefined : kEnMeta ? 'verde' : 'rojo'}>
          {k.personal == null ? 'sin dato: faltan horas de turnos' : `meta ${pct(k.objetivo)} · ${k.locales_con_kpi} de ${k.locales_con_venta} locales`}
        </Kpi>
      </div>

      <Card titulo="Cada local" sub={`comparado con el ${d.ref.larga} · personal sobre venta neta sin IVA`}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ahg-text/55 bg-ahg-bg">
                <th className="text-left px-2 py-1.5">Local</th><th className="text-right px-2">Venta</th><th className="text-right px-2">{refCorta}</th>
                <th className="text-right px-2">Docenas</th><th className="text-right px-2">Ticket</th><th className="text-right px-2">Personal</th><th className="text-right px-2">Reportes</th><th className="text-right px-2">Fudo vs. turnos</th>
              </tr>
            </thead>
            <tbody>
              {d.locales.map(l => (
                <tr key={l.local_id} className="border-t border-ahg-accent/30 align-top">
                  <td className="px-2 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><PuntoLocal nombre={l.nombre_completo} />{l.nombre}</span>{l.personas ? <span className="block text-[11px] text-ahg-text/50">{l.personas} personas atendidas</span> : null}</td>
                  <td className="px-2 text-right tabular-nums">{l.abrio ? n0(l.venta) : <span className="text-ahg-text/40">{l.fudo ? 'no abrió' : '—'}</span>}</td>
                  <td className="px-2 text-right tabular-nums">{n0(l.venta_ref)}<span className="block text-[11px]"><Var v={l.var_venta} /></span></td>
                  <td className="px-2 text-right tabular-nums">{l.docenas == null ? '—' : n1(l.docenas)}{l.docenas_ref != null && <span className="block text-[11px] text-ahg-text/50">{n1(l.docenas_ref)}</span>}</td>
                  <td className="px-2 text-right tabular-nums">{l.ticket ? n0(l.ticket) : '—'}{l.ticket_es === 'por persona' && <span className="block text-[11px] text-ahg-text/50">por persona</span>}</td>
                  <td className="px-2 text-right whitespace-nowrap"><PersonalCelda l={l} /></td>
                  <td className={`px-2 text-right tabular-nums ${l.reportes.recibidos < l.reportes.esperados ? 'text-red-700 font-semibold' : ''}`}>{l.reportes.esperados ? `${l.reportes.recibidos} de ${l.reportes.esperados}` : '—'}</td>
                  <td className="px-2 text-right whitespace-nowrap"><FudoCelda l={l} /></td>
                </tr>
              ))}
              <tr className="border-t border-ahg-accent/40 bg-ahg-bg font-semibold">
                <td className="px-2 py-2">Toda la red</td><td className="px-2 text-right tabular-nums">{n0(k.venta)}</td>
                <td className="px-2 text-right tabular-nums">{n0(k.venta_ref)}<span className="block text-[11px]"><Var v={k.var_venta} /></span></td>
                <td className="px-2 text-right tabular-nums">{n1(k.docenas)}</td><td className="px-2 text-right tabular-nums">{k.ticket_tiendas ? n0(k.ticket_tiendas) : '—'}</td>
                <td className="px-2 text-right">{pct(k.personal)}</td><td className="px-2 text-right">{d.reportes.recibidos} de {d.reportes.esperados}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="md:hidden grid gap-2">
          {d.locales.map(l => (
            <div key={l.local_id} className="rounded-xl border border-ahg-accent/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold"><PuntoLocal nombre={l.nombre_completo} />{l.nombre}</span>
                <span className="font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>{l.abrio ? pesos(l.venta) : (l.fudo ? 'no abrió' : 'Fudo sin cargar')}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2 text-xs">
                <div className="bg-ahg-bg rounded-lg px-2 py-1"><span className="block text-[9px] uppercase text-ahg-text/50">vs. {refCorta}</span><Var v={l.var_venta} /></div>
                <div className="bg-ahg-bg rounded-lg px-2 py-1"><span className="block text-[9px] uppercase text-ahg-text/50">{l.docenas == null ? (l.ticket_es === 'por persona' ? 'Por persona' : 'Ticket') : 'Docenas'}</span>{l.docenas == null ? (l.ticket ? n0(l.ticket) : '—') : n1(l.docenas)}</div>
                <div className="bg-ahg-bg rounded-lg px-2 py-1"><span className="block text-[9px] uppercase text-ahg-text/50">Personal</span><PersonalCelda l={l} /></div>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                {l.reportes.esperados > 0 && <Chip tono={l.reportes.recibidos < l.reportes.esperados ? 'rojo' : 'gris'}>{l.reportes.recibidos} de {l.reportes.esperados} reportes</Chip>}
                <FudoCelda l={l} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card titulo="Lo que salió mal" sub="cada cosa es una tarea del encargado · en qué está">
        {d.salio_mal.length === 0 ? <p className="text-sm text-emerald-700">Nada: todo cerró bien ese día.</p> : d.salio_mal.map(t => (
          <Link key={t.id} to={`/tareas/${t.id}`} className="flex gap-2 items-start py-2 border-t border-ahg-accent/30 first:border-0 hover:bg-ahg-bg/60 -mx-1 px-1 rounded-lg">
            <span className="mt-1.5"><PuntoLocal nombre={t.local_nombre} /></span>
            <span className="text-sm flex-1 min-w-0"><b>{t.local}</b> · {t.titulo}</span>
            <EstadoChip t={t} />
          </Link>
        ))}
      </Card>

      <Card titulo="El encargado" sub="cómo viene con todas sus tareas, no solo las de hoy">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-ahg-bg rounded-lg p-2.5"><p className="font-bold text-lg" style={{ fontFamily: 'Nunito, sans-serif' }}>{d.encargado.abiertas}</p><p className="text-xs text-ahg-text/60">abiertas · {d.encargado.sin_tomar} sin tomar</p></div>
          <div className="bg-ahg-bg rounded-lg p-2.5"><p className={`font-bold text-lg ${d.encargado.vencidas ? 'text-red-700' : 'text-emerald-700'}`} style={{ fontFamily: 'Nunito, sans-serif' }}>{d.encargado.vencidas}</p><p className="text-xs text-ahg-text/60">vencidas{d.encargado.vencidas ? ` · la más vieja ${d.encargado.mas_vieja_vencida} d` : ''}</p></div>
          <div className="bg-ahg-bg rounded-lg p-2.5"><p className={`font-bold text-lg ${d.encargado.arreglos ? 'text-red-700' : ''}`} style={{ fontFamily: 'Nunito, sans-serif' }}>{d.encargado.arreglos}</p><p className="text-xs text-ahg-text/60">arreglos abiertos{d.encargado.arreglos ? ` · el más viejo ${d.encargado.arreglo_mas_viejo} d` : ''}</p></div>
        </div>
        <Link to="/tareas" className="inline-block mt-2 text-xs underline text-ahg-text/60">Ir a la bandeja</Link>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 items-start">
        <Card titulo="Mantenimiento" sub={`${d.mantenimiento.length} abiertos, por días`}>
          {d.mantenimiento.length === 0 ? <p className="text-sm text-ahg-text/50">Nada abierto.</p> : (
            <ul className="grid gap-1.5 text-sm">
              {d.mantenimiento.map(m => (
                <li key={m.id}>
                  <Link to={`/tareas/${m.id}`} className="flex items-baseline gap-2 hover:underline">
                    <span className={`w-8 text-right font-bold ${m.dias >= 7 ? 'text-red-700' : 'text-amber-700'}`} style={{ fontFamily: 'Nunito, sans-serif' }}>{m.dias}</span>
                    <span className="flex-1 min-w-0">{m.local} · {m.rubro ? `${m.rubro}: ` : ''}{m.texto}</span>
                    <EstadoChip t={m} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Vencimientos" sub={d.vencimientos.filas.length ? `${d.vencimientos.filas.length} productos · el más próximo en ${d.vencimientos.mas_proximo} días` : 'nada reportado'}>
          {d.vencimientos.filas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase tracking-wider text-ahg-text/55 bg-ahg-bg"><th className="text-left px-1.5 py-1">Producto</th>{d.vencimientos.tiendas.map(t => <th key={t} className="text-right px-1.5">{t}</th>)}</tr></thead>
                <tbody>
                  {d.vencimientos.filas.map(f => (
                    <tr key={f.producto} className="border-t border-ahg-accent/30">
                      <td className="px-1.5 py-1 font-semibold">{f.producto}</td>
                      {d.vencimientos.tiendas.map(t => {
                        const c = f.celdas[t];
                        return <td key={t} className={`px-1.5 text-right tabular-nums ${c && c.dias <= 7 ? 'text-red-700 font-semibold' : c && c.dias <= 15 ? 'text-amber-700 font-semibold' : ''}`}>{c ? `${c.cantidad} · ${c.dias} d` : <span className="text-ahg-text/25">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-ahg-text/50 mt-1">Unidades · días que faltan. Los que vencen en 10 días o menos son tarea del encargado.</p>
            </div>
          )}
        </Card>

        {d.cafe && (
          <Card titulo="Café en grano" sub={[d.cafe.manana && `${d.cafe.manana.usuario} entró con ${n1(d.cafe.manana.kg)} kg`, d.cafe.tarde && `${d.cafe.tarde.usuario} terminó con ${n1(d.cafe.tarde.kg)} kg`].filter(Boolean).join(' · ')}>
            {d.cafe.consumo == null ? <p className="text-sm text-red-700">Falta un pesaje: sin los dos no se sabe cuánto se usó.</p> : (() => {
              const max = Math.max(d.cafe.consumo, d.cafe.teorico || 0);
              const dif = d.cafe.teorico ? d.cafe.consumo - d.cafe.teorico : null;
              const p = dif != null ? Math.abs(dif) / d.cafe.teorico * 100 : null;
              return (
                <div className="grid gap-1.5 text-sm">
                  <div className="grid grid-cols-[110px_1fr_64px] gap-2 items-center"><span>Se usó</span><span className="h-3 rounded-full bg-ahg-bg overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${d.cafe.consumo / max * 100}%`, background: '#8a5a3c' }} /></span><b className="text-right">{n1(d.cafe.consumo)} kg</b></div>
                  {d.cafe.teorico != null && <div className="grid grid-cols-[110px_1fr_64px] gap-2 items-center"><span>Según lo vendido</span><span className="h-3 rounded-full bg-ahg-bg overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${d.cafe.teorico / max * 100}%`, background: '#c8c7c2' }} /></span><b className="text-right">{n1(d.cafe.teorico)} kg</b></div>}
                  {dif != null && <p className="text-xs"><Chip tono={p <= 10 ? 'verde' : p <= 25 ? 'ambar' : 'rojo'}>{n1(Math.abs(dif))} kg {dif < 0 ? 'menos' : 'más'} · {Math.round(p)} %</Chip> <span className="text-ahg-text/55">quedan {n1(d.cafe.queda)} kg</span></p>}
                </div>
              );
            })()}
          </Card>
        )}

        <Card titulo="Plata del día" sub="proveedores y cajas">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-ahg-bg rounded-lg p-2"><p className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{pesos(pl.facturas_hoy.monto)}</p><p className="text-[11px] text-ahg-text/60">facturas cargadas ({pl.facturas_hoy.cantidad})</p></div>
            <div className="bg-ahg-bg rounded-lg p-2"><p className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{pesos(pl.pagado_hoy.monto)}</p><p className="text-[11px] text-ahg-text/60">pagado ({pl.pagado_hoy.cantidad})</p></div>
            <div className="bg-ahg-bg rounded-lg p-2"><p className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{pesos(pl.gastos_caja.monto)}</p><p className="text-[11px] text-ahg-text/60">gastos de caja de los turnos</p></div>
          </div>
          {pl.gastos_tareas.length > 0 && (
            <div className="mt-2 text-xs grid gap-1">
              {pl.gastos_tareas.map((g, i) => <p key={i}>Caja chica · {g.local_corto}: {g.concepto} <b>{pesos(g.monto)}</b> {g.estado === 'pendiente' ? <Chip tono="ambar">espera aprobación</Chip> : g.estado === 'rechazado' ? <Chip tono="rojo">no aprobado</Chip> : g.con_comprobante ? <Chip tono="verde">con comprobante</Chip> : <Chip tono="rojo">falta comprobante</Chip>}</p>)}
            </div>
          )}
          <p className="text-xs text-ahg-text/60 mt-2">
            Deuda con proveedores: <b className="text-ahg-text">{pesos(pl.deuda.total)}</b> en {pl.deuda.facturas} facturas
            {pl.deuda.mas_vieja && <> · la más vieja, {pl.deuda.mas_vieja.dias} días ({pl.deuda.mas_vieja.proveedor})</>}
          </p>
          <button onClick={() => setVerDeuda(true)} className="mt-1 text-sm font-semibold underline text-sky-800">Ver la deuda con proveedores →</button>
        </Card>
      </div>

      {verDeuda && <PanelDeuda deuda={pl.deuda} fecha={d.fecha} onCerrar={() => setVerDeuda(false)} />}
    </div>
  );
}
