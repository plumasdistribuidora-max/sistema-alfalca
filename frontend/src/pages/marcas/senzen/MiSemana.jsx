import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { TAREAS, cuando, fechaCorta, label, RESULTADOS, NUNITO } from './senzenUtils';

// El inicio de Pepa: cómo va su semana, a quién le toca hablar hoy y qué viene.
// No muestra plata: eso lo ven los dueños en el tablero.
export default function MiSemana() {
  const { user } = useAuth();
  const [D, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/senzen/mi-semana').then(r => setD(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudo cargar tu semana'));
  }, []);

  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!D) return <div className="space-y-3 max-w-xl mx-auto">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-stone-200 rounded-xl animate-pulse" />)}</div>;

  const { hoy, semana: s, metas, tareas } = D;
  const paraHoy = tareas.filter(t => t.vence <= hoy);
  const proximas = tareas.filter(t => t.vence > hoy);
  const nombre = (user?.nombre || '').split(' ')[0];

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Senzen</p>
        <h1 className="text-2xl font-extrabold text-ahg-text" style={NUNITO}>Hola{nombre ? `, ${nombre}` : ''}</h1>
      </div>

      <Link to="/senzen/contacto" className="block text-center rounded-xl bg-ahg-primary hover:bg-ahg-secondary text-white font-semibold py-3.5 transition-colors">
        Cargar visita o llamada
      </Link>

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-ahg-text">Esta semana <span className="font-normal text-ahg-text/50">· {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}</span></h2>
        <Avance label="Contactos" valor={s.contactos} meta={metas.contactos} detalle={`${s.visitas} ${s.visitas === 1 ? 'visita' : 'visitas'}`} />
        <Avance label="Clientes nuevos" valor={s.nuevos} meta={metas.nuevos} detalle="primera compra en Dux" />
        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <Dato v={s.pedidos} l="pedidos" />
          <Dato v={s.cargados} l="comercios cargados" />
          <Dato v={s.tareasATiempo} l={`de ${s.tareasHechas} tareas a tiempo`} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ahg-text">Para hoy {paraHoy.length > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">{paraHoy.length}</span>}</h2>
        {paraHoy.length ? paraHoy.map(t => <Tarea key={t.id} t={t} hoy={hoy} />)
          : <p className="card px-4 py-5 text-sm text-ahg-text/60 text-center">No tenés a nadie pendiente para hoy.</p>}
      </section>

      {proximas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ahg-text">Próximos días</h2>
          {proximas.map(t => <Tarea key={t.id} t={t} hoy={hoy} />)}
        </section>
      )}
    </div>
  );
}

function Avance({ label: l, valor, meta, detalle }) {
  const pct = meta ? Math.min(100, Math.round(valor / meta * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-ahg-text/70">{l} <span className="text-xs text-ahg-text/45">· {detalle}</span></span>
        <span className="font-bold tabular-nums">{valor}{meta ? <span className="font-normal text-ahg-text/50"> de {meta}</span> : ''}</span>
      </div>
      {meta ? <div className="h-2 rounded-full bg-stone-100 overflow-hidden"><div className="h-full bg-teal-600 rounded-full" style={{ width: `${pct}%` }} /></div> : null}
    </div>
  );
}

function Dato({ v, l }) {
  return (
    <div className="rounded-lg bg-ahg-bg py-2 px-1">
      <p className="text-lg font-extrabold tabular-nums" style={NUNITO}>{v}</p>
      <p className="text-[11px] leading-tight text-ahg-text/55">{l}</p>
    </div>
  );
}

function Tarea({ t, hoy }) {
  const atrasada = t.vence < hoy;
  return (
    <div className={`card p-3.5 flex items-start gap-3 ${atrasada ? 'border-l-4 border-l-amber-500' : ''}`}>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-semibold text-ahg-text truncate">{t.nombre}</p>
        <p className="text-xs text-ahg-text/60">{TAREAS[t.tipo]}{t.tipo === 'visitar' && t.encargada_por ? ` (${t.encargada_por.replace(/\s*\(.*\)$/, '')})` : ''}</p>
        <p className="text-xs text-ahg-text/50">
          {[t.localidad, t.ultimo_contacto ? `último contacto ${cuando(t.ultimo_contacto, hoy)} · ${label(RESULTADOS, t.ultimo_resultado).toLowerCase()}` : 'sin contactos todavía',
            t.ultima_compra ? `última compra ${cuando(t.ultima_compra, hoy)}` : null].filter(Boolean).join(' · ')}
        </p>
        <p className={`text-xs font-medium ${atrasada ? 'text-amber-700' : 'text-ahg-text/70'}`}>{atrasada ? `Era para ${cuando(t.vence, hoy)}` : `Para ${cuando(t.vence, hoy)}`}</p>
      </div>
      <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
        <Link to={`/senzen/contacto?comercio=${t.comercio_id}`} className="text-xs font-semibold px-3 py-2 rounded-lg bg-ahg-primary text-white">Cargar</Link>
        {t.telefono && <a href={`tel:${t.telefono.replace(/[^\d+]/g, '')}`} className="text-xs text-teal-700 font-medium px-1">Llamar</a>}
      </div>
    </div>
  );
}
