import { useEffect, useMemo, useState } from 'react';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { esDueno } from '../../../utils/roles';
import { TIPOS, ESTADOS, MEDIOS, RESULTADOS, label, cuando, hoyLocal, sumarDias, fmt, fechaCorta, SENZEN, NUNITO } from './senzenUtils';
import { Modal } from '../../tareas/kanban';

// Los comercios de Senzen: los que ya compraron (los trae Dux solo) y los que carga Pepa
// o un dueño para visitar. La lista muestra de un vistazo cuánto compró, cuánto debe y su
// último pedido (Martín, 23/10/2026; la plata solo la ven los dueños); al tocar uno se abre
// todo. Los dueños además marcan consignación, dan de baja y le encargan visitas a Pepa.
export default function Comercios() {
  const { user } = useAuth();
  const dueno = esDueno(user);
  const hoy = hoyLocal();
  const [lista, setLista] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [orden, setOrden] = useState(dueno ? 'pedido' : 'nombre');
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const cargar = () => api.get('/senzen/comercios').then(r => setLista(r.data.data))
    .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los comercios'));
  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const ORDEN = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      pedido: (a, b) => (b.ultimo_pedido || b.ultima_compra || '').localeCompare(a.ultimo_pedido || a.ultima_compra || '') || a.nombre.localeCompare(b.nombre),
      compro: (a, b) => (b.total || 0) - (a.total || 0),
      debe: (a, b) => (b.debe || 0) - (a.debe || 0),
    };
    return (lista || []).filter(c => (filtro === 'baja' ? !c.activo : c.activo)
      && (filtro === 'todos' || filtro === 'baja' || (filtro === 'deben' ? c.debe > 1 : c.estado === filtro))
      && (!q || c.nombre.toLowerCase().includes(q) || (c.localidad || '').toLowerCase().includes(q)))
      .sort(ORDEN[orden]);
  }, [lista, buscar, filtro, orden]);

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

  const activos = (lista || []).filter(c => c.activo);
  const cuenta = k => activos.filter(c => c.estado === k).length;
  const sum = k => activos.reduce((a, c) => a + (c[k] || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: SENZEN }}>Senzen</p>
          <h1 className="text-2xl font-extrabold text-ahg-text" style={NUNITO}>Comercios</h1>
        </div>
        <button className="btn-primary" onClick={() => { setNuevo(true); setEditando(null); }}>+ Comercio nuevo</button>
      </div>

      {dueno && lista && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Numero titulo="Compraron" valor={activos.filter(c => c.compras > 0).length} sub={`de ${activos.length} comercios`} />
          <Numero titulo="Comprado en total" valor={fmt(sum('total'))} />
          <Numero titulo="Nos deben" valor={fmt(sum('debe'))} sub={`${activos.filter(c => c.debe > 1).length} comercios`} tono={sum('debe') > 1 ? 'text-red-700' : ''} />
          <Numero titulo="Pedidos sin facturar" valor={fmt(sum('pendiente'))} sub="consignación incluida" />
        </div>
      )}

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
        {[['todos', 'Todos'], ...(dueno ? [['deben', `Deben · ${activos.filter(c => c.debe > 1).length}`]] : []),
          ['prospecto', `Sin comprar · ${cuenta('prospecto')}`], ['compro', `Compraron una vez · ${cuenta('compro')}`], ['repite', `Repiten · ${cuenta('repite')}`],
          ...(dueno ? [['baja', 'Dados de baja']] : [])].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} aria-pressed={filtro === v}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === v ? 'bg-ahg-primary text-white border-ahg-primary' : 'bg-white border-ahg-accent/60 text-ahg-text/70'}`}>{l}</button>
        ))}
        <label className="ml-auto text-xs text-ahg-text/55 flex items-center gap-1.5">Ordenar
          <select id="orden" className="border border-ahg-accent/60 rounded-lg px-2 py-1.5 text-sm bg-white" value={orden} onChange={e => setOrden(e.target.value)}>
            <option value="pedido">Último pedido</option>
            {dueno && <option value="compro">Más compraron</option>}
            {dueno && <option value="debe">Más deben</option>}
            <option value="nombre">Nombre</option>
          </select>
        </label>
      </div>

      {lista === null ? <div className="h-40 bg-stone-200 rounded-xl animate-pulse" /> : (
        <div className="space-y-2">
          {visibles.map(c => {
            const ultimo = c.ultimo_pedido || c.ultima_compra;
            return (
              <button key={c.id} type="button" onClick={() => setAbierto(c.id)}
                      className={`w-full text-left card p-3.5 grid gap-3 sm:grid-cols-[1fr_auto] items-center hover:border-ahg-accent transition-colors ${!c.activo ? 'opacity-60' : ''}`}>
                <span className="min-w-0 grid gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="font-semibold">{c.nombre}</b>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ESTADOS[c.estado][1]}`}>{ESTADOS[c.estado][0]}</span>
                    {c.consignacion && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">Consignación</span>}
                    {!c.activo && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">De baja</span>}
                  </span>
                  <span className="text-xs text-ahg-text/60">{[label(TIPOS, c.tipo) !== '—' ? label(TIPOS, c.tipo) : null, c.localidad, c.telefono].filter(Boolean).join(' · ') || 'Sin datos'}</span>
                  <span className="text-xs text-ahg-text/50">
                    {[c.ultimo_contacto ? `Último contacto ${cuando(c.ultimo_contacto, hoy)}` : 'Sin contactos', c.proxima ? (c.proxima < hoy ? `Pepa tenía que hablarle ${cuando(c.proxima, hoy)}` : `Pepa le habla ${cuando(c.proxima, hoy)}`) : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={`grid ${dueno ? 'grid-cols-3' : 'grid-cols-2'} gap-x-5 gap-y-0.5 sm:text-right text-xs`}>
                  {dueno && <Dato titulo="Compró" valor={c.total ? fmt(c.total) : '—'} sub={c.compras ? `${c.compras} ${c.compras === 1 ? 'compra' : 'compras'}` : ''} />}
                  {dueno ? <Dato titulo="Debe" valor={c.debe > 1 ? fmt(c.debe) : '—'} tono={c.debe > 1 ? 'text-red-700' : ''} sub={c.pendiente > 1 ? `${fmt(c.pendiente)} sin facturar` : ''} />
                    : <Dato titulo="Compras" valor={c.compras || '—'} />}
                  <Dato titulo="Último pedido" valor={ultimo ? fechaCorta(ultimo) : '—'} sub={ultimo ? cuando(ultimo, hoy) : ''} />
                </span>
              </button>
            );
          })}
          {!visibles.length && <p className="card p-5 text-sm text-center text-ahg-text/60">No hay comercios con ese filtro.</p>}
        </div>
      )}

      {abierto && <Detalle id={abierto} dueno={dueno} hoy={hoy} onCerrar={() => setAbierto(null)}
        onEditar={c => { setAbierto(null); setEditando(c); setNuevo(false); }}
        onEncargar={encargar} onCambiar={(c, cambios, msg) => { setAbierto(null); cambiar(c, cambios, msg); }} />}
    </div>
  );
}

function Numero({ titulo, valor, sub, tono }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-[11px] text-ahg-text/55">{titulo}</p>
      <p className={`text-lg font-extrabold tabular-nums leading-tight ${tono || ''}`} style={NUNITO}>{valor}</p>
      {sub && <p className="text-[11px] text-ahg-text/50">{sub}</p>}
    </div>
  );
}

function Dato({ titulo, valor, sub, tono }) {
  return (
    <span className="grid">
      <span className="text-[10.5px] uppercase tracking-wide text-ahg-text/45">{titulo}</span>
      <b className={`text-sm tabular-nums ${tono || ''}`}>{valor}</b>
      {sub ? <span className="text-[11px] text-ahg-text/50">{sub}</span> : <span className="text-[11px]">&nbsp;</span>}
    </span>
  );
}

const APROB = { pendiente: ['Para aprobar', 'bg-sky-50 text-sky-800'], aprobado: ['Aprobado', 'bg-green-50 text-green-800'], devuelto: ['Devuelto', 'bg-amber-50 text-amber-800'] };

// Todo de un comercio: datos, plata (dueños), qué compra, pedidos y los contactos de Pepa.
function Detalle({ id, dueno, hoy, onCerrar, onEditar, onEncargar, onCambiar }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/senzen/comercios/${id}`).then(r => setD(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudo cargar el comercio'));
  }, [id]);
  const c = d?.comercio;
  const sec = 'text-[13px] font-semibold';
  return (
    <Modal onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="p-5 grid gap-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold" style={NUNITO}>{c?.nombre || 'Cargando…'}</h2>
            {c && <p className="text-xs text-ahg-text/60">{[label(TIPOS, c.tipo) !== '—' ? label(TIPOS, c.tipo) : null, c.localidad, c.direccion].filter(Boolean).join(' · ') || 'Sin dirección cargada'}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-ahg-bg hover:bg-ahg-accent/40 text-lg leading-none flex-shrink-0">×</button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!d && !error && <div className="h-32 bg-stone-100 rounded-xl animate-pulse" />}
        {d && <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {dueno && <Numero titulo="Compró en total" valor={fmt(d.total)} sub={`${d.compras} ${d.compras === 1 ? 'compra' : 'compras'}`} />}
            {dueno && <Numero titulo="Debe" valor={d.debe > 1 ? fmt(d.debe) : '$ 0'} tono={d.debe > 1 ? 'text-red-700' : ''} sub={d.pendiente > 1 ? `${fmt(d.pendiente)} en pedidos sin facturar` : null} />}
            {!dueno && <Numero titulo="Compras" valor={d.compras || '—'} />}
            <Numero titulo="Primera compra" valor={d.primera_compra ? fechaCorta(d.primera_compra) : '—'} />
            <Numero titulo="Última compra" valor={d.ultima_compra ? fechaCorta(d.ultima_compra) : '—'} sub={d.ultima_compra ? cuando(d.ultima_compra, hoy) : null} />
          </div>

          <div className="rounded-xl bg-ahg-bg px-3 py-2.5 text-sm grid gap-1">
            <span><span className="text-ahg-text/55">Con quién hablar:</span> {c.contacto || '—'} · <span className="text-ahg-text/55">Teléfono:</span> {c.telefono || 'sin cargar'}</span>
            <span className="text-xs text-ahg-text/55">{d.proxima ? `${d.proxima.vence < hoy ? 'Pepa tenía que hablarle' : 'Pepa le tiene que hablar'} ${cuando(d.proxima.vence, hoy)}${d.proxima.nota ? `: ${d.proxima.nota}` : ''}` : 'Pepa no tiene nada pendiente con este comercio.'}{c.en_dux ? '' : ' · Todavía no está en Dux.'}</span>
          </div>

          {dueno && d.facturas?.length > 0 && (
            <div className="grid gap-1.5">
              <p className={sec}>Facturas</p>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ahg-text/45"><th className="py-1">Fecha</th><th>Comprobante</th><th className="text-right">Total</th><th className="text-right">Debe</th></tr></thead>
                <tbody>{d.facturas.map(f => (
                  <tr key={f.id} className="border-t border-ahg-accent/25"><td className="py-1.5 tabular-nums">{fechaCorta(f.fecha)}</td><td className="text-ahg-text/60">{f.comprobante}</td>
                    <td className="text-right tabular-nums">{fmt(f.total)}</td><td className={`text-right tabular-nums ${f.saldo > 1 ? 'text-red-700 font-semibold' : 'text-ahg-text/45'}`}>{f.saldo > 1 ? fmt(f.saldo) : 'pagada'}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
          {d.pedidos?.some(p => p.estado !== 'FACTURADO') && (
            <div className="grid gap-1">
              <p className={sec}>Pedidos sin facturar</p>
              {d.pedidos.filter(p => p.estado !== 'FACTURADO').map((p, i) => <p key={i} className="text-sm">{fechaCorta(p.fecha)}{dueno ? ` · ${fmt(p.total)}` : ''}{c.consignacion ? ' · en consignación' : ''}</p>)}
            </div>
          )}

          {d.productos.length > 0 && (
            <div className="grid gap-1.5">
              <p className={sec}>Qué compra</p>
              <div className="grid gap-1">{d.productos.slice(0, 8).map(p => (
                <div key={p.item} className="flex gap-3 text-sm"><span className="flex-1 min-w-0 truncate">{p.item}</span>
                  <span className="text-ahg-text/55 tabular-nums">{p.unidades} u.</span>{dueno && <span className="tabular-nums w-28 text-right">{fmt(p.total)}</span>}</div>
              ))}</div>
            </div>
          )}

          <div className="grid gap-1.5">
            <p className={sec}>Contactos de Pepa</p>
            {d.contactos.length ? d.contactos.map(k => (
              <div key={k.id} className="rounded-lg border border-ahg-accent/40 px-3 py-2 text-sm grid gap-0.5">
                <span className="flex gap-2 items-center"><b className="flex-1">{fechaCorta(k.fecha)} · {k.tipo === 'nuevo' ? 'Primera visita' : label(MEDIOS, k.medio)} · {label(RESULTADOS, k.resultado)}</b>
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${APROB[k.aprobacion][1]}`}>{APROB[k.aprobacion][0]}</span></span>
                {k.comentario && <span className="text-ahg-text/70">{k.comentario}</span>}
              </div>
            )) : <p className="text-sm text-ahg-text/55">Todavía no hay contactos.</p>}
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-ahg-accent/30">
            <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ahg-accent/60 mt-2" onClick={() => onEditar(c)}>Editar datos</button>
            {dueno && <span className="mt-2"><Encargar onElegir={v => onEncargar(c, v)} hoy={hoy} /></span>}
            {dueno && <button className="text-xs px-2 py-1.5 text-ahg-text/60 mt-2" onClick={() => onCambiar(c, { consignacion: !c.consignacion }, c.consignacion ? 'Ya no figura en consignación' : `${c.nombre} quedó en consignación`)}>{c.consignacion ? 'Sacar consignación' : 'Marcar consignación'}</button>}
            {dueno && <button className="text-xs px-2 py-1.5 text-ahg-text/60 mt-2" onClick={() => onCambiar(c, { activo: !c.activo }, c.activo ? `${c.nombre} quedó de baja` : `${c.nombre} volvió a la lista`)}>{c.activo ? 'Dar de baja' : 'Reactivar'}</button>}
          </div>
        </>}
      </div>
    </Modal>
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

// Alta o edición de un comercio.
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
