import { useEffect, useMemo, useState } from 'react';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { esDueno } from '../../../utils/roles';
import { TIPOS, ESTADOS, label, cuando, hoyLocal, sumarDias, NUNITO } from './senzenUtils';

// Los comercios de Senzen: los que ya compraron (los trae Dux solo) y los que carga Pepa
// o un dueño para visitar. Los dueños además marcan consignación, dan de baja y le
// encargan visitas a Pepa.
export default function Comercios() {
  const { user } = useAuth();
  const dueno = esDueno(user);
  const hoy = hoyLocal();
  const [lista, setLista] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const cargar = () => api.get('/senzen/comercios').then(r => setLista(r.data.data))
    .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los comercios'));
  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (lista || []).filter(c => (filtro === 'baja' ? !c.activo : c.activo)
      && (filtro === 'todos' || filtro === 'baja' || c.estado === filtro)
      && (!q || c.nombre.toLowerCase().includes(q) || (c.localidad || '').toLowerCase().includes(q)));
  }, [lista, buscar, filtro]);

  async function cambiar(c, cambios, msg) {
    try {
      await api.put(`/senzen/comercios/${c.id}`, { ...c, ...cambios });
      setAviso(msg); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }
  async function encargar(c, vence) {
    try {
      await api.post('/senzen/tareas', { comercio_id: c.id, vence });
      setAviso(`Le quedó a Pepa: ${c.nombre}, ${cuando(vence, hoy)}`); cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo encargar'); }
  }

  const cuenta = k => (lista || []).filter(c => c.activo && c.estado === k).length;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Senzen</p>
          <h1 className="text-2xl font-extrabold text-ahg-text" style={NUNITO}>Comercios</h1>
        </div>
        <button className="btn-primary" onClick={() => { setNuevo(true); setEditando(null); }}>+ Comercio nuevo</button>
      </div>

      {aviso && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {(nuevo || editando) && (
        <div className="card p-4">
          <NuevoComercio inicial={editando} onCancelar={() => { setNuevo(false); setEditando(null); }}
            onListo={c => { setAviso(editando ? 'Comercio actualizado' : `${c.nombre} quedó cargado`); setNuevo(false); setEditando(null); cargar(); }} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" placeholder="Buscar por nombre o localidad" value={buscar} onChange={e => setBuscar(e.target.value)} id="buscar" />
        {[['todos', 'Todos'], ['prospecto', `Sin comprar · ${cuenta('prospecto')}`], ['compro', `Compraron una vez · ${cuenta('compro')}`], ['repite', `Repiten · ${cuenta('repite')}`],
          ...(dueno ? [['baja', 'Dados de baja']] : [])].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} aria-pressed={filtro === v}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === v ? 'bg-ahg-primary text-white border-ahg-primary' : 'bg-white border-ahg-accent/60 text-ahg-text/70'}`}>{l}</button>
        ))}
      </div>

      {lista === null ? <div className="h-40 bg-stone-200 rounded-xl animate-pulse" /> : (
        <div className="space-y-2">
          {visibles.map(c => (
            <div key={c.id} className={`card p-3.5 flex flex-wrap items-start gap-3 ${!c.activo ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-[200px] space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{c.nombre}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ESTADOS[c.estado][1]}`}>{ESTADOS[c.estado][0]}</span>
                  {c.consignacion && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">Consignación</span>}
                  {!c.activo && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">De baja</span>}
                </div>
                <p className="text-xs text-ahg-text/60">{[label(TIPOS, c.tipo) !== '—' ? label(TIPOS, c.tipo) : null, c.localidad, c.telefono].filter(Boolean).join(' · ') || 'Sin datos'}</p>
                <p className="text-xs text-ahg-text/50">
                  {[c.ultima_compra ? `Última compra ${cuando(c.ultima_compra, hoy)} (${c.compras} ${c.compras === 1 ? 'compra' : 'compras'})` : null,
                    c.ultimo_contacto ? `último contacto ${cuando(c.ultimo_contacto, hoy)}` : 'sin contactos',
                    c.proxima ? `próximo ${cuando(c.proxima, hoy)}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ahg-accent/60" onClick={() => { setEditando(c); setNuevo(false); }}>Editar</button>
                {dueno && <Encargar onElegir={v => encargar(c, v)} hoy={hoy} />}
                {dueno && <button className="text-xs px-2 py-1.5 text-ahg-text/60" onClick={() => cambiar(c, { consignacion: !c.consignacion }, c.consignacion ? 'Ya no figura en consignación' : `${c.nombre} quedó en consignación`)}>{c.consignacion ? 'Sacar consignación' : 'Consignación'}</button>}
                {dueno && <button className="text-xs px-2 py-1.5 text-ahg-text/60" onClick={() => cambiar(c, { activo: !c.activo }, c.activo ? `${c.nombre} quedó de baja` : `${c.nombre} volvió a la lista`)}>{c.activo ? 'Dar de baja' : 'Reactivar'}</button>}
              </div>
            </div>
          ))}
          {!visibles.length && <p className="card p-5 text-sm text-center text-ahg-text/60">No hay comercios con ese filtro.</p>}
        </div>
      )}
    </div>
  );
}

function Encargar({ onElegir, hoy }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-600 text-teal-800" onClick={() => setAbierto(true)}>Encargar a Pepa</button>;
  return (
    <span className="flex items-center gap-1 text-xs">
      {[[hoy, 'Hoy'], [sumarDias(hoy, 1), 'Mañana'], [sumarDias(hoy, 7), 'En una semana']].map(([v, l]) => (
        <button key={v} className="px-2 py-1.5 rounded-lg bg-teal-50 text-teal-800 font-semibold" onClick={() => { onElegir(v); setAbierto(false); }}>{l}</button>
      ))}
      <button className="px-1 text-ahg-text/50" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
    </span>
  );
}

// Alta o edición de un comercio. Se usa acá y adentro de "Cargar visita o llamada".
export function NuevoComercio({ inicial, onListo, onCancelar }) {
  const [f, setF] = useState({ nombre: inicial?.nombre || '', tipo: inicial?.tipo || '', localidad: inicial?.localidad || '',
    direccion: inicial?.direccion || '', contacto: inicial?.contacto || '', telefono: inicial?.telefono || '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    if (!f.nombre.trim()) return setError('Falta el nombre');
    if (!f.tipo) return setError('Elegí qué tipo de comercio es');
    setGuardando(true); setError('');
    try {
      if (inicial) {
        await api.put(`/senzen/comercios/${inicial.id}`, f);
        onListo({ ...inicial, ...f });
      } else {
        const r = await api.post('/senzen/comercios', f);
        onListo({ id: r.data.data.id, ...f });
      }
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      <p className="text-sm font-semibold">{inicial ? `Editar ${inicial.nombre}` : 'Comercio nuevo'}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label" htmlFor="c-nombre">Nombre</label><input id="c-nombre" className="input" value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className="label" htmlFor="c-tipo">Tipo</label>
          <select id="c-tipo" className="input" value={f.tipo} onChange={set('tipo')}>
            <option value="">Elegí…</option>
            {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="label" htmlFor="c-loc">Localidad</label><input id="c-loc" className="input" list="localidades" value={f.localidad} onChange={set('localidad')} /></div>
        <div><label className="label" htmlFor="c-dir">Dirección</label><input id="c-dir" className="input" value={f.direccion} onChange={set('direccion')} /></div>
        <div><label className="label" htmlFor="c-con">Con quién hablar</label><input id="c-con" className="input" value={f.contacto} onChange={set('contacto')} /></div>
        <div><label className="label" htmlFor="c-tel">Teléfono</label><input id="c-tel" className="input" inputMode="tel" value={f.telefono} onChange={set('telefono')} /></div>
      </div>
      <datalist id="localidades">
        {['Capital', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú', 'Lavalle', 'San Martín', 'Rivadavia', 'Junín', 'Tunuyán', 'Tupungato', 'San Carlos', 'San Rafael'].map(l => <option key={l} value={l} />)}
      </datalist>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
