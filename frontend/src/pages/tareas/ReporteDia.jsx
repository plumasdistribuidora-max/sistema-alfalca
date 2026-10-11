import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api';
import AvisosBoton from '../../components/AvisosBoton';
import {
  pesos, diaLargo, hoyStr, cuando, PuntoLocal, ChipTipo, Chip, EstadoTarea, Cargando, MensajeError, Titulo, Seccion,
} from './comunes';

function correr(f, n) {
  const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const pct = v => (v == null ? 's/d' : `${v.toFixed(1).replace('.', ',')} %`);

// El PDF viene del servidor con el token de sesión, así que no se abre con un link
// común: se baja como archivo. En el celular se comparte con el menú del teléfono
// (WhatsApp lo recibe como adjunto); en la computadora se abre o se baja.
async function bajarPdf(fecha) {
  const r = await api.get('/tareas/dia/pdf', { params: { fecha }, responseType: 'blob' });
  return new File([r.data], `Reporte del día ${fecha}.pdf`, { type: 'application/pdf' });
}

function BotonesPdf({ fecha }) {
  const [estado, setEstado] = useState('');   // '' | 'armando' | 'error'
  const puedeCompartir = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  async function hacer(modo) {
    setEstado('armando');
    try {
      const archivo = await bajarPdf(fecha);
      if (modo === 'compartir' && puedeCompartir && navigator.canShare({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], title: archivo.name }); }
        catch (err) { if (err?.name !== 'AbortError') throw err; }   // cerró el menú: no es error
      } else {
        const url = URL.createObjectURL(archivo);
        if (modo === 'ver') window.open(url, '_blank');
        else { const a = document.createElement('a'); a.href = url; a.download = archivo.name; a.click(); }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setEstado('');
    } catch {
      setEstado('error');
    }
  }

  return (
    <div className="card p-4 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <p className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>El PDF del día</p>
        <p className="text-xs text-ahg-text/55">Ventas y personal por local, tareas del encargado, vencimientos, mantenimiento, café, facturas y gastos.</p>
      </div>
      {estado === 'error' && <p className="w-full text-sm text-red-700 order-last">No se pudo armar el PDF. Probá de nuevo.</p>}
      {puedeCompartir && (
        <button onClick={() => hacer('compartir')} disabled={estado === 'armando'} className="btn-primary">
          {estado === 'armando' ? 'Armando…' : 'Compartir PDF'}
        </button>
      )}
      <button onClick={() => hacer(puedeCompartir ? 'bajar' : 'ver')} disabled={estado === 'armando'} className={puedeCompartir ? 'btn-secondary' : 'btn-primary'}>
        {estado === 'armando' && !puedeCompartir ? 'Armando…' : puedeCompartir ? 'Bajar' : 'Ver PDF'}
      </button>
    </div>
  );
}

// El reporte del día: lo mismo que les llega en el aviso, con el detalle. Pensado
// para leerse en el celular.
export default function ReporteDia() {
  const [params, setParams] = useSearchParams();
  const fecha = params.get('fecha');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setD(null);
    api.get('/tareas/dia', { params: fecha ? { fecha } : {} })
      .then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el reporte del día'));
  }, [fecha]);

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  // Un mantenimiento que venía de antes no es novedad de este día: cuenta solo si nació hoy.
  const problemas = d.tareas_del_dia.filter(t => t.tipo !== 'mantenimiento' || t.detalle?.desde === d.fecha);
  const cosas = problemas.length;
  const ir = n => setParams({ fecha: correr(d.fecha, n) });

  return (
    <div className="space-y-4 max-w-3xl">
      <Titulo eyebrow="Alfalca · Reporte del día" derecha={
        <div className="flex items-center gap-2">
          <button onClick={() => ir(-1)} className="text-white/80 hover:text-white px-2" aria-label="Día anterior">◀</button>
          {d.fecha < correr(hoyStr(), -1) && <button onClick={() => ir(1)} className="text-white/80 hover:text-white px-2" aria-label="Día siguiente">▶</button>}
        </div>
      }>
        {diaLargo(d.fecha)} · {cosas ? `${cosas} cosa${cosas === 1 ? '' : 's'} para mirar` : 'todo en orden'}
      </Titulo>

      <BotonesPdf fecha={d.fecha} />

      <AvisosBoton />

      {!d.completo && (
        <div className="card px-4 py-3 text-sm bg-amber-50 border-amber-300 text-amber-900">
          Todavía falta el Fudo de: {d.locales.filter(l => !l.fudo).map(l => l.nombre).join(', ')}. El día se arma con lo que hay.
        </div>
      )}

      <Seccion titulo={`Venta ${pesos(d.totales.ventas)}`} sub={`Horas sobre ventas ${pct(d.totales.horas_sobre_ventas)} (meta ${pct(d.totales.objetivo)})`}>
        <div className="divide-y divide-ahg-accent/30">
          {d.locales.map(l => (
            <div key={l.local_id} className="flex items-center gap-2 py-2 text-sm">
              <PuntoLocal nombre={l.nombre_completo} />
              <span className="flex-1">{l.nombre}</span>
              {!l.fudo ? <span className="text-ahg-text/45">Fudo sin cargar</span>
                : !l.abrio ? <span className="text-ahg-text/45">No abrió</span>
                : <>
                    <span className={`text-xs ${l.horas_sobre_ventas != null && l.horas_sobre_ventas > l.objetivo ? 'text-red-700' : 'text-ahg-text/50'}`}>{pct(l.horas_sobre_ventas)}</span>
                    <span className="tabular-nums font-medium w-28 text-right">{pesos(l.ventas)}</span>
                  </>}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo={`Reportes ${d.reportes.recibidos} de ${d.reportes.esperados}`}>
        {d.reportes.faltan.length === 0
          ? <p className="text-sm text-emerald-700">Llegaron todos cuando entró el Fudo.</p>
          : d.reportes.faltan.map((f, i) => <p key={i} className="text-sm text-red-700">No cargó: {f.local} · {f.plantilla} {f.turno.toLowerCase()}</p>)}
      </Seccion>

      <Seccion titulo="Lo que levantó el sistema" sub="Cada cosa es una tarea del encargado.">
        {problemas.length === 0 ? <p className="text-sm text-ahg-text/50">Nada.</p> : problemas.map(t => (
          <Link key={t.id} to={`/tareas/${t.id}`} className="flex items-start gap-2 py-2.5 border-t border-ahg-accent/30 first:border-0 hover:bg-ahg-bg/60 -mx-2 px-2 rounded-lg">
            <ChipTipo tipo={t.tipo} label={t.tipo_label} />
            <span className="flex-1 min-w-0 text-sm">{t.local_corto && <b>{t.local_corto}: </b>}{t.titulo}</span>
            <EstadoTarea t={t} />
          </Link>
        ))}
      </Seccion>

      <Seccion titulo="Tareas" sub={`${d.abiertas} abiertas · ${d.vencidas.length} vencidas · ${d.por_aprobar} para aprobar`}
               derecha={<Link to="/tareas" className="text-sm underline text-ahg-text/70">Ir a la bandeja</Link>}>
        {d.vencidas.length === 0 ? <p className="text-sm text-ahg-text/50">Ninguna vencida.</p> : d.vencidas.map(t => (
          <Link key={t.id} to={`/tareas/${t.id}`} className="flex items-center gap-2 py-2 border-t border-ahg-accent/30 first:border-0 text-sm hover:bg-ahg-bg/60">
            <Chip tono="rojo">Vencida {t.dias_vencida} d</Chip><span className="flex-1">{t.local_corto}: {t.titulo}</span>
          </Link>
        ))}
      </Seccion>

      <Seccion titulo="Lo que hizo el encargado ese día">
        {d.avances.length === 0 ? <p className="text-sm text-ahg-text/50">No hay movimientos ese día.</p> : d.avances.map((a, i) => (
          <Link key={i} to={`/tareas/${a.tarea_id}`} className="block py-2 border-t border-ahg-accent/30 first:border-0 text-sm hover:bg-ahg-bg/60">
            <span className="text-xs text-ahg-text/50">{cuando(a.created_at)} · {a.usuario || 'Sistema'}</span><br />
            <b>{a.local_corto}: {a.titulo}</b> — {a.texto}
          </Link>
        ))}
      </Seccion>

      {(d.gastos_tareas.length > 0 || d.gastos_caja.length > 0) && (
        <Seccion titulo="Gastos">
          {d.gastos_tareas.map((g, i) => (
            <p key={`t${i}`} className="text-sm py-1">Tarea · {g.local_corto}: {g.concepto} <b>{pesos(g.monto)}</b>{' '}
              {g.estado === 'pendiente' ? <Chip tono="ambar">esperando aprobación</Chip> : g.estado === 'rechazado' ? <Chip tono="rojo">no aprobado</Chip> : g.con_comprobante ? <Chip tono="verde">con comprobante</Chip> : <Chip tono="rojo">falta comprobante</Chip>}
            </p>
          ))}
          {d.gastos_caja.length > 0 && (
            <p className="text-sm py-1 text-ahg-text/70">Caja de los turnos: {pesos(d.total_gastos_caja)} ({d.gastos_caja.map(g => `${g.local} ${g.detalle || g.tipo || ''} ${pesos(g.monto)}`).join(' · ')})</p>
          )}
        </Seccion>
      )}
    </div>
  );
}
