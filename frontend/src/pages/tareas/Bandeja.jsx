import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import AvisosBoton from '../../components/AvisosBoton';
import {
  pesos, diaCorto, duracion, hoyStr, PuntoLocal, ChipTipo, Chip, EstadoTarea,
  useOpciones, Cargando, MensajeError, Titulo, Seccion, QueVasAHacer,
} from './comunes';

function sumarDias(f, n) {
  const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Cada alerta del cuadro dice en qué está: el color del tipo mientras nadie la tomó,
// azul cuando el encargado la está resolviendo, ámbar cuando espera a los dueños y
// verde con tilde cuando ya está aprobada.
function ChipCuadro({ t }) {
  if (t.estado === 'terminada') return <Chip tono="verde">✓ {t.label}</Chip>;
  if (t.estado === 'por_aprobar') return <Chip tono="ambar">{t.label} · por aprobar</Chip>;
  if (t.estado === 'en_curso') return <Chip tono="azul">{t.label} · en curso</Chip>;
  return <ChipTipo tipo={t.tipo} label={`${t.label} · sin tomar`} />;
}

// "Desde el viernes": qué pasó en cada local los últimos días que ya tienen Fudo.
function CuadroDias({ dias }) {
  if (!dias?.length) return null;
  const locales = dias[0].locales;
  return (
    <Seccion titulo="Lo que pasó en cada local" sub="Los últimos días con el Fudo cargado. Cada alerta dice en qué está: sin tomar, en curso (azul), por aprobar (ámbar) o aprobada (verde). Tocala para abrirla.">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wider text-ahg-text/50 font-semibold py-2 px-1">Local</th>
              {dias.map(d => (
                <th key={d.fecha} className="text-left text-[11px] uppercase tracking-wider text-ahg-text/50 font-semibold py-2 px-1">{diaCorto(d.fecha)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locales.map(l => (
              <tr key={l.local_id} className="border-t border-ahg-accent/30 align-top">
                <td className="py-2 px-1 whitespace-nowrap"><span className="inline-flex items-center gap-2"><PuntoLocal nombre={l.nombre_completo} />{l.nombre}</span></td>
                {dias.map(d => {
                  const c = d.locales.find(x => x.local_id === l.local_id);
                  return (
                    <td key={d.fecha} className="py-2 px-1">
                      <div className="flex flex-wrap gap-1">
                        {c.estado === 'sin_fudo' && <Chip>Fudo sin cargar</Chip>}
                        {c.estado === 'no_abrio' && <Chip>No abrió según Fudo</Chip>}
                        {c.estado === 'abrio' && c.esperados > 0 && (() => {
                          // El local queda en verde cuando llegaron todos los reportes y
                          // todo lo que se levantó ese día ya está aprobado.
                          const ok = c.recibidos >= c.esperados && c.tareas.every(t => t.estado === 'terminada');
                          return <Chip tono={ok ? 'verde' : 'gris'}>{c.recibidos}/{c.esperados} reportes{ok ? ' · ok' : ''}</Chip>;
                        })()}
                        {c.tareas.map(t => (
                          <Link key={t.id} to={`/tareas/${t.id}`}><ChipCuadro t={t} /></Link>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

// Una alerta sin tomar: se toma acá mismo eligiendo qué hacer y para cuándo.
function AlertaNueva({ t, opciones, onCambio, dueno }) {
  const [abierta, setAbierta] = useState(false);
  const acciones = opciones?.tipos?.[t.tipo]?.acciones || [];
  const [accion, setAccion] = useState('');
  const [plazo, setPlazo] = useState(sumarDias(hoyStr(), 2));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function tomar() {
    setGuardando(true); setError('');
    try {
      await api.post(`/tareas/${t.id}/tomar`, { accion, plazo });
      onCambio();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo tomar');
    } finally { setGuardando(false); }
  }

  return (
    <div className="py-3 border-t border-ahg-accent/30 first:border-0">
      <div className="flex items-start gap-3">
        <ChipTipo tipo={t.tipo} label={t.tipo_label} />
        <div className="flex-1 min-w-0">
          <Link to={`/tareas/${t.id}`} className="font-medium text-ahg-text hover:underline">{t.titulo}</Link>
          <p className="text-xs text-ahg-text/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
            {t.local_corto && <><PuntoLocal nombre={t.local_nombre} />{t.local_corto} ·</>} {diaCorto(t.fecha)} · esperando hace {duracion(t.relojes.encargado_ms)}
          </p>
        </div>
        {/* Tomarla es trabajo del encargado: el dueño solo la abre. */}
        {dueno
          ? <Link to={`/tareas/${t.id}`} className="btn-secondary !py-1.5 !px-3 text-sm flex-shrink-0">Ver</Link>
          : <button onClick={() => setAbierta(a => !a)} className="btn-primary !py-1.5 !px-3 text-sm flex-shrink-0">{abierta ? 'Cerrar' : 'Tomar'}</button>}
      </div>
      {abierta && (
        <div className="mt-3 bg-ahg-bg rounded-lg p-3 flex flex-wrap gap-3 items-end">
          <QueVasAHacer id={`accion-${t.id}`} valor={accion} onChange={setAccion} ideas={acciones} />
          <label className="text-xs text-ahg-text/60 grid gap-1">¿Para cuándo?
            <input type="date" className="input !py-1.5" value={plazo} min={hoyStr()} onChange={e => setPlazo(e.target.value)} />
          </label>
          <button onClick={tomar} disabled={guardando || accion.trim().length < 3} className="btn-primary !py-1.5">{guardando ? 'Guardando…' : 'Tomar la tarea'}</button>
          <Link to={`/tareas/${t.id}`} className="text-xs text-ahg-text/60 underline">Ver detalle o descartar</Link>
          {error && <p className="w-full text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

function FilaTarea({ t, extra }) {
  return (
    <Link to={`/tareas/${t.id}`} className="flex items-start gap-3 py-3 border-t border-ahg-accent/30 first:border-0 hover:bg-ahg-bg/60 -mx-2 px-2 rounded-lg">
      <div className="w-14 flex-shrink-0 text-center">
        <p className={`font-bold leading-none ${t.dias_vencida > 0 ? 'text-red-700' : 'text-ahg-text'}`} style={{ fontFamily: 'Nunito, sans-serif', fontSize: 17 }}>
          {duracion(t.relojes.encargado_ms).replace(/ \d+ h$/, '')}
        </p>
        <p className="text-[10px] text-ahg-text/50 mt-0.5">suyo</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ahg-text">{t.titulo}</p>
        <p className="text-xs text-ahg-text/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {t.local_corto && <><PuntoLocal nombre={t.local_nombre} />{t.local_corto} ·</>}
          <ChipTipo tipo={t.tipo} label={t.tipo_label} />
          {t.accion && <span>· Va a hacer: {t.accion}</span>}
          {t.cambios_plazo > 0 && <span>· {t.cambios_plazo} cambio{t.cambios_plazo === 1 ? '' : 's'} de fecha</span>}
          {t.gastado > 0 && <span>· gastado {pesos(t.gastado)}</span>}
        </p>
        {extra}
      </div>
      <div className="flex-shrink-0"><EstadoTarea t={t} /></div>
    </Link>
  );
}

export default function Bandeja() {
  const { user } = useAuth();
  const dueno = esDueno(user);
  const opciones = useOpciones();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  function cargar() {
    api.get('/tareas').then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la bandeja'));
  }
  useEffect(cargar, []);

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  const tareas = d.tareas;
  const nuevas = tareas.filter(t => t.estado === 'nueva');
  const porAprobar = tareas.filter(t => t.estado === 'por_aprobar');
  const devueltas = tareas.filter(t => t.estado === 'en_curso' && ['pidio_mas', 'rechazada'].includes(t.ultimo?.tipo));
  const enCurso = tareas.filter(t => t.estado === 'en_curso' && !devueltas.includes(t))
    .sort((a, b) => (a.plazo || '').localeCompare(b.plazo || ''));
  const terminadas = tareas.filter(t => t.estado === 'terminada');

  return (
    <div className="space-y-4 max-w-4xl">
      <Titulo eyebrow="Alfalca · Tareas" derecha={<Link to="/dia" className="text-sm text-white/80 hover:text-white underline">Reporte del día →</Link>}>
        Bandeja
      </Titulo>

      <AvisosBoton />

      {dueno && (porAprobar.length > 0 || d.gastos_pendientes.length > 0) && (
        <Seccion titulo={`Para aprobar · ${porAprobar.length + d.gastos_pendientes.length}`} sub="El encargado pide cerrar estas tareas o aprobar un gasto. Abrí cada una para responder.">
          {d.gastos_pendientes.map(g => (
            <Link key={`g${g.id}`} to={`/tareas/${g.tarea_id}`} className="flex items-start gap-3 py-3 border-t border-ahg-accent/30 first:border-0 hover:bg-ahg-bg/60 -mx-2 px-2 rounded-lg">
              <Chip tono="azul">Gasto</Chip>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{g.concepto} · {pesos(g.monto)}</p>
                <p className="text-xs text-ahg-text/55">{g.local_corto} · {g.titulo}</p>
              </div>
              <span className="text-xs text-ahg-text/50">esperando {duracion(Date.now() - new Date(g.created_at))}</span>
            </Link>
          ))}
          {porAprobar.map(t => (
            <FilaTarea key={t.id} t={t} extra={
              <p className="text-sm mt-1">
                {t.cierre_tipo === 'descarte' ? 'Pide descartarla: ' : 'Dice: '}<b>{t.resultado}</b>{t.resultado_monto ? ` (${pesos(t.resultado_monto)})` : ''}
                <span className="text-xs text-ahg-text/50"> · esperando hace {duracion(t.relojes.duenos_ms)}</span>
              </p>
            } />
          ))}
        </Seccion>
      )}

      <CuadroDias dias={d.dias} />

      <Seccion
        titulo={`Alertas sin tomar · ${nuevas.length}`}
        sub="Cada una se toma escribiendo qué vas a hacer y para cuándo. Desde que nace, corre tu tiempo.">
        {nuevas.length === 0
          ? <p className="text-sm text-ahg-text/50">No hay alertas sin tomar.</p>
          : nuevas.map(t => <AlertaNueva key={t.id} t={t} opciones={opciones} onCambio={cargar} dueno={dueno} />)}
      </Seccion>

      {(devueltas.length > 0 || (!dueno && porAprobar.length > 0) || terminadas.length > 0) && (
        <Seccion titulo="Respuestas de los dueños" sub="Lo que pediste cerrar. Las que te devolvieron vuelven a tu reloj.">
          {devueltas.map(t => (
            <FilaTarea key={t.id} t={t} extra={
              <p className="text-sm mt-1 text-red-700">
                {t.ultimo.tipo === 'pidio_mas' ? 'Te piden más' : 'No la aprobaron'} · {t.ultimo.usuario}: <b>{t.ultimo.texto}</b>
              </p>
            } />
          ))}
          {!dueno && porAprobar.map(t => (
            <FilaTarea key={t.id} t={t} extra={<p className="text-xs text-ahg-text/55 mt-1">Esperando a los dueños hace {duracion(t.relojes.duenos_ms)}</p>} />
          ))}
          {terminadas.map(t => (
            <FilaTarea key={t.id} t={t} extra={
              <p className="text-xs text-ahg-text/55 mt-1">
                {t.terminada_por_nombre ? `Aprobó ${t.terminada_por_nombre}` : 'Se aprobó sola (causa conocida)'} · {t.resultado}
              </p>
            } />
          ))}
        </Seccion>
      )}

      <Seccion titulo={`En curso · ${enCurso.length}`} sub="Ordenadas por lo que vence primero. El número de la izquierda es cuánto lleva en tus manos.">
        {enCurso.length === 0
          ? <p className="text-sm text-ahg-text/50">No hay tareas en curso.</p>
          : enCurso.map(t => <FilaTarea key={t.id} t={t} />)}
      </Seccion>
    </div>
  );
}
