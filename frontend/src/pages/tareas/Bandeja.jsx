import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import AvisosBoton from '../../components/AvisosBoton';
import { pesos, diaCorto, duracion, hoyStr, PuntoLocal, Cargando, MensajeError, Titulo } from './comunes';

// Las cuatro etapas por las que pasa toda tarea. La barrita de cada tarea muestra hasta dónde llegó.
const ETAPAS = [
  { estado: 'nueva',       label: 'Sin tomar' },
  { estado: 'en_curso',    label: 'En curso' },
  { estado: 'por_aprobar', label: 'Por aprobar' },
  { estado: 'terminada',   label: 'Terminada' },
];

const FILTROS = [
  { id: 'abiertas',    label: 'Abiertas',    f: t => t.estado !== 'terminada' },
  { id: 'nueva',       label: 'Sin tomar',   f: t => t.estado === 'nueva' },
  { id: 'en_curso',    label: 'En curso',    f: t => t.estado === 'en_curso' },
  { id: 'por_aprobar', label: 'Por aprobar', f: t => t.estado === 'por_aprobar' },
  { id: 'terminada',   label: 'Terminadas',  f: t => t.estado === 'terminada' },
];

const devuelta = t => t.estado === 'en_curso' && ['pidio_mas', 'rechazada'].includes(t.ultimo?.tipo);

// Lo que más apura va primero: devueltas y vencidas, después sin tomar, lo que espera a
// los dueños, lo que está en curso por fecha y al final lo terminado.
function urgencia(t) {
  if (devuelta(t) || t.dias_vencida > 0) return 0;
  return { nueva: 1, por_aprobar: 2, en_curso: 3, terminada: 4 }[t.estado] ?? 5;
}

// Qué pasa con la tarea ahora, en una frase. El color solo acompaña: la frase lo dice.
function Situacion({ t }) {
  let tono = 'text-ahg-text/60', txt;
  if (t.estado === 'terminada') {
    tono = 'text-green-700';
    txt = t.cierre_tipo === 'descarte' ? 'Descartada' : t.terminada_por_nombre ? `Aprobó ${t.terminada_por_nombre}` : 'Se aprobó sola';
  } else if (t.estado === 'por_aprobar') {
    tono = 'text-amber-700';
    txt = `Espera a los dueños hace ${duracion(t.relojes.duenos_ms)}`;
  } else if (t.estado === 'nueva') {
    tono = 'text-red-700';
    txt = `Nadie la tomó · hace ${duracion(t.relojes.encargado_ms)}`;
  } else if (devuelta(t)) {
    tono = 'text-red-700';
    txt = t.ultimo.tipo === 'pidio_mas' ? 'Le pidieron más' : 'No la aprobaron';
  } else if (t.dias_vencida > 0) {
    tono = 'text-red-700';
    txt = `Vencida hace ${t.dias_vencida} día${t.dias_vencida === 1 ? '' : 's'}`;
  } else if (t.plazo === hoyStr()) {
    tono = 'text-amber-700';
    txt = 'Vence hoy';
  } else {
    txt = `Para el ${diaCorto(t.plazo)}`;
  }
  return <span className={`text-xs font-semibold sm:whitespace-nowrap ${tono}`}>{txt}</span>;
}

function Avance({ t }) {
  const paso = ETAPAS.findIndex(e => e.estado === t.estado);
  const rojo = t.estado !== 'terminada' && (devuelta(t) || t.dias_vencida > 0);
  return (
    <div className="flex gap-1 mt-2" title={ETAPAS[paso]?.label}>
      {ETAPAS.map((e, i) => (
        <div key={e.estado} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= paso ? (rojo ? 'bg-red-500' : t.estado === 'terminada' ? 'bg-green-600' : 'bg-ahg-primary') : 'bg-ahg-accent/50'}`} />
          <p className={`text-[10px] mt-1 hidden sm:block ${i === paso ? 'text-ahg-text font-semibold' : 'text-ahg-text/40'}`}>{e.label}</p>
        </div>
      ))}
    </div>
  );
}

function Tarea({ t }) {
  return (
    <Link to={`/tareas/${t.id}`} className="block card p-4 hover:border-ahg-primary/40 transition-colors">
      <div className="flex flex-col-reverse items-start gap-1 sm:flex-row sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ahg-text">{t.titulo}</p>
          <p className="text-xs text-ahg-text/55 mt-0.5 flex items-center gap-1.5 flex-wrap">
            {t.local_corto && <><PuntoLocal nombre={t.local_nombre} />{t.local_corto} · </>}
            {t.tipo_label} · {diaCorto(t.fecha)}
          </p>
        </div>
        <Situacion t={t} />
      </div>
      {t.accion && <p className="text-sm text-ahg-text/80 mt-2">{t.accion}</p>}
      {devuelta(t) && t.ultimo?.texto && (
        <p className="text-sm text-red-700 mt-1">{t.ultimo.usuario}: {t.ultimo.texto}</p>
      )}
      {t.estado === 'por_aprobar' && t.resultado && (
        <p className="text-sm mt-1">{t.cierre_tipo === 'descarte' ? 'Pide descartarla: ' : 'Dice: '}<b>{t.resultado}</b></p>
      )}
      <Avance t={t} />
    </Link>
  );
}

// Un dueño le carga algo al encargado. Le llega el aviso y sigue el camino de siempre.
function NuevaTarea({ onCerrar }) {
  const navigate = useNavigate();
  const [locales, setLocales] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [local, setLocal] = useState('');
  const [para, setPara] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo))).catch(() => {});
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      const r = await api.post('/tareas/nueva', { titulo, texto, local_id: local || null, para_cuando: para || null });
      navigate(`/tareas/${r.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la tarea');
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="card p-4 grid gap-3">
      <p className="font-semibold">Nueva tarea para el encargado</p>
      <label className="text-xs text-ahg-text/60 grid gap-1">¿Qué hay que hacer?
        <input id="nt-titulo" className="input" maxLength={200} value={titulo} onChange={e => setTitulo(e.target.value)}
               placeholder="Ej.: cambiar el cartel de la vidriera" autoFocus />
      </label>
      <label className="text-xs text-ahg-text/60 grid gap-1">Más detalle (opcional)
        <textarea id="nt-texto" className="input" rows={3} maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ahg-text/60 grid gap-1">Local
          <select id="nt-local" className="input" value={local} onChange={e => setLocal(e.target.value)}>
            <option value="">Todo el grupo / ninguno en particular</option>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-ahg-text/60 grid gap-1">Para cuándo (opcional)
          <input id="nt-para" type="date" className="input" min={hoyStr()} value={para} onChange={e => setPara(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={guardando || titulo.trim().length < 3}>{guardando ? 'Guardando…' : 'Cargar la tarea'}</button>
        <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
      </div>
      <p className="text-xs text-ahg-text/50">Al encargado le llega el aviso en el celular. Él la toma, la resuelve y un dueño la aprueba, como las demás.</p>
    </form>
  );
}

export default function Bandeja() {
  const { user } = useAuth();
  const dueno = esDueno(user);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('abiertas');
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    api.get('/tareas').then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar las tareas'));
  }, []);

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  const f = FILTROS.find(x => x.id === filtro);
  const lista = d.tareas.filter(f.f).sort((a, b) =>
    urgencia(a) - urgencia(b) || (a.plazo || '9').localeCompare(b.plazo || '9') || a.id - b.id);
  const gastos = dueno ? d.gastos_pendientes : [];

  return (
    <div className="space-y-4 max-w-3xl">
      <Titulo eyebrow="Alfalca" derecha={<Link to="/dia" className="text-sm text-white/80 hover:text-white underline">Reporte del día →</Link>}>
        Tareas
      </Titulo>

      <AvisosBoton />

      {dueno && (nueva
        ? <NuevaTarea onCerrar={() => setNueva(false)} />
        : <button onClick={() => setNueva(true)} className="btn-primary">+ Nueva tarea</button>)}

      {gastos.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">{gastos.length === 1 ? 'Un gasto espera' : `${gastos.length} gastos esperan`} tu aprobación</p>
          {gastos.map(g => (
            <Link key={g.id} to={`/tareas/${g.tarea_id}`} className="block text-sm mt-1 hover:underline">
              {g.local_corto} · {g.concepto} · {pesos(g.monto)}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(x => {
          const n = d.tareas.filter(x.f).length;
          return (
            <button key={x.id} onClick={() => setFiltro(x.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${filtro === x.id ? 'bg-ahg-primary text-white border-ahg-primary' : 'bg-white text-ahg-text border-ahg-accent/60 hover:bg-ahg-bg'}`}>
              {x.label} <span className={filtro === x.id ? 'text-white/70' : 'text-ahg-text/45'}>{n}</span>
            </button>
          );
        })}
      </div>

      {lista.length === 0
        ? <p className="text-sm text-ahg-text/50 py-6 text-center">No hay tareas acá.</p>
        : <div className="space-y-2">{lista.map(t => <Tarea key={t.id} t={t} />)}</div>}

      {filtro === 'terminada' && <p className="text-xs text-ahg-text/45 text-center">Se ven las terminadas de los últimos 3 días.</p>}
    </div>
  );
}
