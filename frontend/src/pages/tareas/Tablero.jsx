import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import AvisosBoton from '../../components/AvisosBoton';
import {
  pesos, diaCorto, duracion, PuntoLocal, ChipTipo, Chip, EstadoTarea, Cargando, MensajeError, Titulo, Seccion,
} from './comunes';

function Kpi({ titulo, valor, sub, tono }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ahg-text/55">{titulo}</p>
      <p className={`text-2xl font-bold leading-tight mt-0.5 ${tono || 'text-ahg-text'}`} style={{ fontFamily: 'Nunito, sans-serif' }}>{valor}</p>
      {sub && <p className="text-xs text-ahg-text/50 mt-0.5">{sub}</p>}
    </div>
  );
}

const th = 'text-left text-[11px] uppercase tracking-wider text-ahg-text/50 font-semibold py-2 px-2';
const td = 'py-2 px-2 border-t border-ahg-accent/30';

export default function Tablero() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  function cargar() {
    api.get('/tareas/tablero').then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el tablero'));
  }
  useEffect(cargar, []);

  async function bajaCausa(id) {
    try { await api.post(`/tareas/causas/${id}/baja`); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo dar de baja'); }
  }

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;
  const k = d.kpis;
  const totalGastos = d.gastos.filter(g => g.estado !== 'rechazado' && g.estado !== 'pendiente').reduce((s, g) => s + g.monto, 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <Titulo eyebrow="Alfalca · Dueños">
        Tablero de tareas
      </Titulo>

      <AvisosBoton />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi titulo="Abiertas" valor={k.abiertas} sub={k.por_aprobar ? `${k.por_aprobar} esperan su aprobación` : 'ninguna espera aprobación'} />
        <Kpi titulo="Vencidas" valor={k.vencidas} tono={k.vencidas ? 'text-red-700' : undefined} sub={k.vencidas ? `la más vieja, ${k.mas_vieja_vencida} día${k.mas_vieja_vencida === 1 ? '' : 's'}` : 'ninguna'} />
        <Kpi titulo="Tiempo del encargado" valor={duracion(k.ms_encargado)} sub="hasta pedir el cierre · 30 días" />
        <Kpi titulo="Tiempo de los dueños" valor={duracion(k.ms_duenos)} sub="hasta responder · 30 días" />
        <Kpi titulo="Pidió el cierre en fecha" valor={k.con_plazo ? `${Math.round(k.en_plazo / k.con_plazo * 100)}%` : '—'} sub={`${k.en_plazo} de ${k.con_plazo}`} />
        <Kpi titulo="Descartadas" valor={k.descartadas} sub={`de ${k.terminadas} terminadas · 30 días`} />
      </div>

      <Seccion titulo="Abiertas, de la más vieja a la más nueva">
        {d.abiertas.length === 0 ? <p className="text-sm text-ahg-text/50">No hay tareas abiertas.</p> : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr><th className={th}>Tarea</th><th className={th}>Local</th><th className={th}>Va a hacer</th><th className={`${th} text-right`}>Abierta</th><th className={th}>Estado</th><th className={`${th} text-right`}>Cambios de fecha</th></tr></thead>
              <tbody>
                {d.abiertas.map(t => (
                  <tr key={t.id} className="hover:bg-ahg-bg/60">
                    <td className={td}><Link to={`/tareas/${t.id}`} className="hover:underline">{t.titulo}</Link><div className="mt-0.5"><ChipTipo tipo={t.tipo} label={t.tipo_label} /></div></td>
                    <td className={`${td} whitespace-nowrap`}>{t.local_corto && <span className="inline-flex items-center gap-1.5"><PuntoLocal nombre={t.local_nombre} />{t.local_corto}</span>}</td>
                    <td className={td}>{t.accion || <span className="text-ahg-text/40">sin tomar</span>}</td>
                    <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{duracion(Date.now() - new Date(t.created_at))}</td>
                    <td className={td}><EstadoTarea t={t} /></td>
                    <td className={`${td} text-right tabular-nums`}>{t.cambios_plazo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Seccion titulo="Lo que se repite" sub="El mismo problema en el mismo local, 3 días o más de los últimos 10.">
          {d.repetidas.length === 0 ? <p className="text-sm text-ahg-text/50">Nada se repite.</p> : d.repetidas.map((r, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-t border-ahg-accent/30 first:border-0 text-sm">
              <PuntoLocal nombre={r.local_nombre} /><span className="flex-1">{r.local_corto}: {r.label}</span>
              <Chip tono="rojo">{r.dias} días</Chip>
            </div>
          ))}
        </Seccion>

        <Seccion titulo="Causas conocidas" sub="Lo que aprobaron como normal. Se aprueba solo mientras el monto que declara el encargado coincida con la diferencia.">
          {d.causas.length === 0 ? <p className="text-sm text-ahg-text/50">Todavía no hay ninguna. Se crean al aprobar una diferencia de ventas tildando "causa conocida".</p> : d.causas.map(c => (
            <div key={c.id} className="py-2 border-t border-ahg-accent/30 first:border-0 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <PuntoLocal nombre={c.local_nombre} /><b>{c.local_corto}</b><span className="flex-1">{c.resultado}</span>
                <button onClick={() => bajaCausa(c.id)} className="text-xs underline text-ahg-text/60 hover:text-red-700">Dar de baja</button>
              </div>
              <p className="text-xs text-ahg-text/55 mt-0.5">
                Aprobó {c.aprobada_por_nombre || '—'} · este mes: {c.usos} vez{c.usos === 1 ? '' : 'es'}, {pesos(c.monto)}
                {c.no_coincidio > 0 && <span className="text-red-700"> · no coincidió {c.no_coincidio} vez{c.no_coincidio === 1 ? '' : 'es'}</span>}
              </p>
            </div>
          ))}
        </Seccion>
      </div>

      <Seccion titulo={`Gastos de las tareas · este mes · ${pesos(totalGastos)}`} sub="Salen de la caja chica. Lo que importa es que quede el comprobante.">
        {d.gastos.length === 0 ? <p className="text-sm text-ahg-text/50">No hubo gastos este mes.</p> : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><th className={th}>Tarea</th><th className={th}>Gasto</th><th className={`${th} text-right`}>Monto</th><th className={th}>Aprobación</th><th className={th}>Comprobante</th></tr></thead>
              <tbody>
                {d.gastos.map(g => (
                  <tr key={g.id}>
                    <td className={td}><Link to={`/tareas/${g.tarea_id}`} className="hover:underline inline-flex items-center gap-1.5"><PuntoLocal nombre={g.local_nombre} />{g.titulo}</Link></td>
                    <td className={td}>{g.concepto}</td>
                    <td className={`${td} text-right tabular-nums`}>{pesos(g.monto)}</td>
                    <td className={td}>{{ aprobado_solo: <Chip tono="verde">Sola</Chip>, aprobado: <Chip tono="verde">Por un dueño</Chip>, pendiente: <Chip tono="ambar">Esperando</Chip>, rechazado: <Chip tono="rojo">No aprobado</Chip> }[g.estado]}</td>
                    <td className={td}>{g.estado === 'rechazado' || g.estado === 'pendiente' ? '—' : g.con_comprobante ? <Chip tono="verde">Sí</Chip> : <Chip tono="rojo">Falta</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Seccion titulo="Reportes por persona · últimos 30 días" sub="Cuenta cómo llegó el reporte cuando entró el Fudo, no cómo quedó después. La persona se asigna al cerrar la tarea.">
          {d.personas.length === 0 ? <p className="text-sm text-ahg-text/50">Sin datos.</p> : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr><th className={th}>Persona</th><th className={`${th} text-right`}>Enviados</th><th className={`${th} text-right`}>No cargó</th><th className={`${th} text-right`}>Lo cargó después</th><th className={`${th} text-right`}>Ventas mal</th></tr></thead>
                <tbody>
                  {d.personas.map(p => (
                    <tr key={p.id}>
                      <td className={td}>{p.nombre}{p.local_corto && <span className="text-ahg-text/45"> · {p.local_corto}</span>}</td>
                      <td className={`${td} text-right tabular-nums`}>{p.enviados}</td>
                      <td className={`${td} text-right`}>{p.no_cargo ? <Chip tono="rojo">{p.no_cargo}</Chip> : 0}</td>
                      <td className={`${td} text-right tabular-nums`}>{p.llego_despues}</td>
                      <td className={`${td} text-right`}>{p.ventas_mal ? <Chip tono="rojo">{p.ventas_mal}</Chip> : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        <Seccion titulo="Descartadas · últimos 30 días" sub='Para que "no hacía falta" no sea una salida fácil: cada descarte se ve, con su motivo.'>
          {d.descartadas.length === 0 ? <p className="text-sm text-ahg-text/50">Ninguna.</p> : d.descartadas.map(t => (
            <Link key={t.id} to={`/tareas/${t.id}`} className="flex items-start gap-2 py-2 border-t border-ahg-accent/30 first:border-0 text-sm hover:bg-ahg-bg/60">
              <ChipTipo tipo={t.tipo} label={t.tipo_label} />
              <span className="flex-1">{t.local_corto} · {t.titulo}<br /><span className="text-xs text-ahg-text/55">Motivo: {t.resultado} · aprobó {t.terminada_por_nombre}</span></span>
              <span className="text-xs text-ahg-text/50">{diaCorto(t.fecha)}</span>
            </Link>
          ))}
        </Seccion>
      </div>
    </div>
  );
}
