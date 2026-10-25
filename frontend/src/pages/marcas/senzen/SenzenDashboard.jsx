import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { esDueno } from '../../../utils/roles';
import { MARCAS } from '../../../marcas';
import { Proximamente } from '../../MarcaProximamente';
import { TAREAS, MEDIOS, RESULTADOS, MOTIVOS, ESTADOS, label, fmt, pc, mesN, cuando, fechaCorta } from './senzenUtils';
import GastosSenzen from './GastosSenzen';
import '../kankay/kankay.css';

// Tablero de Senzen para los dueños. Lo que vende sale de Dux de Plumas (sucursal Senzen,
// depósito Carmix), que el sistema lee solo cada hora; lo de Pepa sale de lo que ella carga.
const TABS = [
  { id: 'mes',   label: 'El mes' },
  { id: 'cli',   label: 'Clientes' },
  { id: 'prod',  label: 'Productos y stock' },
  { id: 'cob',   label: 'Cobranza' },
  { id: 'pepa',  label: 'Pepa' },
  { id: 'gastos', label: 'Gastos' },
];

export default function SenzenRuta() {
  const { user } = useAuth();
  if (!esDueno(user)) return <Proximamente marca={{ ...MARCAS.find(m => m.slug === 'senzen'), proximamente: true }} />;
  return <SenzenDashboard />;
}

function hace(ts) {
  if (!ts) return 'nunca';
  const min = Math.round((Date.now() - new Date(ts)) / 60000);
  if (min < 2) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function SenzenDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'mes';
  const [D, setD] = useState(null);
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);

  const cargar = useCallback(() => {
    api.get('/senzen/datos').then(r => setD(r.data.data)).catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los datos'));
  }, []);
  useEffect(cargar, [cargar]);

  async function actualizar() {
    setLeyendo(true); setError('');
    try { await api.post('/senzen/sincronizar'); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo leer Dux'); }
    finally { setLeyendo(false); }
  }

  if (!D) return error
    ? <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>
    : <div className="space-y-4"><div className="h-36 bg-stone-200 rounded-2xl animate-pulse" /><div className="grid sm:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-stone-200 rounded-2xl animate-pulse" />)}</div></div>;

  const meses = Object.keys(D.meses);
  return (
    <div className="kk -mt-2">
      <div className="hdr">
        <div className="t">
          <div><h1>SENZEN</h1><div className="k">Distribución · Mendoza</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="bell" onClick={actualizar} disabled={leyendo}>{leyendo ? 'Leyendo Dux…' : 'Actualizar ahora'}</button>
            <span className="badge"><i style={D.sync?.ok === false ? { background: '#b91c1c' } : undefined} />Dux {hace(D.sync?.termino)}</span>
          </div>
        </div>
        <div className="s">{meses.length ? `Desde el ${fechaCorta(D.clientes.map(c => c.primera_compra).filter(Boolean).sort()[0])} · ` : ''}utensilios de limpieza Senzen y Glick · vende Pepa</div>
        <div className="tabs" role="tablist">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams(t.id === 'mes' ? {} : { tab: t.id })}>{t.label}</button>)}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}
      {D.sync?.ok === false && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">La última lectura de Dux falló: {D.sync.detalle?.error}</p>}

      {tab === 'mes'  && <ElMes D={D} />}
      {tab === 'cli'  && <Clientes D={D} />}
      {tab === 'prod' && <Productos D={D} />}
      {tab === 'cob'  && <Cobranza D={D} />}
      {tab === 'pepa' && <Pepa D={D} recargar={cargar} />}
      {tab === 'gastos' && <GastosSenzen />}
    </div>
  );
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
// "PAÑO CRISTAL 30X35CM EXPERTO SENZEN" → "Paño cristal 30x35cm experto".
const nom = s => capital(s.replace(/ SENZEN$/, '').toLowerCase());
function Chg({ a, b }) {
  if (!b) return null;
  const v = a / b - 1;
  return <span className={`chg ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '▲' : '▼'} {pc(Math.abs(v))}</span>;
}

// ── El mes ───────────────────────────────────────────────────────────────────

function ElMes({ D }) {
  const meses = Object.keys(D.meses).sort();
  const p = D.hoy.slice(0, 7);
  const M = D.meses[p] || { total: 0, facturas: 0, clientes: 0, nuevos: 0, margen: null };
  const prev = meses.filter(x => x < p).at(-1), P = prev ? D.meses[prev] : null;
  const dormidos = D.pepa.tareas.filter(t => t.tipo === 'dormido').length;
  const unaVez = D.clientes.filter(c => c.activo && c.compras === 1).length;
  const cortos = D.productos.filter(x => x.dias != null && x.dias < 15);
  const vencido = D.deudas.filter(d => d.dias > 30).reduce((a, d) => a + d.saldo, 0);
  const consig = D.pedidos.filter(x => x.consignacion);
  const sinFacturar = D.pedidos.filter(x => !x.consignacion);

  return (
    <>
      <div className="cards">
        <div className="kc dark"><span className="l">Facturado en {mesN(p)}</span><span className="v">{fmt(M.total)}</span>
          <span className="a">{M.facturas} {M.facturas === 1 ? 'factura' : 'facturas'}</span>
          {P && <div className="cmp"><span>{capital(mesN(prev))} entero: {fmt(P.total)}</span>{p !== D.hoy.slice(0, 7) && <Chg a={M.total} b={P.total} />}</div>}</div>
        <div className="kc"><span className="l">Comercios que compraron</span><span className="v">{M.clientes}</span>
          <span className="a">{M.nuevos} {M.nuevos === 1 ? 'nuevo' : 'nuevos'} este mes</span>
          {P && <div className="cmp"><span>{capital(mesN(prev))}: {P.clientes}</span></div>}</div>
        <div className="kc"><span className="l">Factura promedio</span><span className="v">{fmt(M.facturas ? M.total / M.facturas : 0)}</span>
          {P && <div className="cmp"><span>{capital(mesN(prev))}: {fmt(P.facturas ? P.total / P.facturas : 0)}</span></div>}</div>
        <div className="kc"><span className="l">Margen aproximado</span><span className="v">{pc(M.margen)}</span>
          <span className="a">precio de venta contra costo de Dux</span></div>
      </div>

      <div className="g32">
        <div className="card">
          <h3>Mes a mes</h3>
          <p className="sub">Lo facturado en la sucursal Senzen de Dux, con IVA.</p>
          <div className="sx"><table className="t">
            <thead><tr><th>Mes</th><th>Facturado</th><th>Facturas</th><th>Comercios</th><th>Nuevos</th><th>Margen</th></tr></thead>
            <tbody>{meses.map(m => { const X = D.meses[m]; return (
              <tr key={m}><td>{capital(mesN(m))} {m.slice(0, 4)}</td><td>{fmt(X.total)}</td><td>{X.facturas}</td><td>{X.clientes}</td><td>{X.nuevos}</td><td>{pc(X.margen)}</td></tr>); })}
            </tbody>
          </table></div>
        </div>
        <div className="card">
          <h3>Para mirar</h3>
          <p className="sub">Lo que necesita una decisión o una visita.</p>
          <div className="pe-rows">
            <div><span>Clientes que no compran hace rato</span><b>{dormidos}</b></div>
            <div><span>Compraron una sola vez</span><b>{unaVez}</b></div>
            <div><span>Productos con menos de 15 días de stock</span><b>{cortos.length ? cortos.map(x => nom(x.item)).join(', ') : 0}</b></div>
            <div><span>Sin cobrar hace más de 30 días</span><b>{fmt(vencido)}</b></div>
            {consig.map(x => <div key={x.nro_pedido}><span>En consignación: {x.nombre} desde el {fechaCorta(x.fecha)}</span><b>{fmt(x.total)}</b></div>)}
            {sinFacturar.length > 0 && <div><span>Pedidos sin facturar</span><b>{sinFacturar.length} · {fmt(sinFacturar.reduce((a, x) => a + x.total, 0))}</b></div>}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Clientes ─────────────────────────────────────────────────────────────────

function Clientes({ D }) {
  const lista = D.clientes.filter(c => c.compras > 0).sort((a, b) => b.total - a.total);
  const prospectos = D.clientes.filter(c => c.activo && c.compras === 0);
  return (
    <>
      <div className="card">
        <h3>Los que compraron</h3>
        <p className="sub">{lista.length} comercios. "Sin comprar" cuenta desde su última factura.</p>
        <div className="sx"><table className="t">
          <thead><tr><th>Comercio</th><th>Estado</th><th>Compras</th><th>Total</th><th>Primera</th><th>Última</th><th>Sin comprar</th><th>Debe</th></tr></thead>
          <tbody>{lista.map(c => (
            <tr key={c.id}><td className="w">{c.nombre}{c.consignacion && <small> · consignación</small>}{!c.activo && <small> · no se visita</small>}<br /><small>{c.localidad || ''}</small></td>
              <td>{ESTADOS[c.estado][0]}</td><td>{c.compras}</td><td>{fmt(c.total)}</td><td>{fechaCorta(c.primera_compra)}</td><td>{fechaCorta(c.ultima_compra)}</td>
              <td>{c.dias_sin_comprar} días</td><td>{c.debe ? fmt(c.debe) : '—'}</td></tr>))}
          </tbody>
        </table></div>
      </div>
      <div className="card">
        <h3>Todavía no compraron</h3>
        <p className="sub">{prospectos.length} comercios cargados por Pepa o los dueños. <Link to="/senzen/comercios" style={{ textDecoration: 'underline' }}>Ver y cargar comercios</Link></p>
        {prospectos.length ? <div className="sx"><table className="t">
          <thead><tr><th>Comercio</th><th>Localidad</th><th>Último contacto</th><th>Próximo</th></tr></thead>
          <tbody>{prospectos.map(c => <tr key={c.id}><td className="w">{c.nombre}</td><td>{c.localidad || '—'}</td><td>{c.ultimo_contacto ? cuando(c.ultimo_contacto, D.hoy) : '—'}</td><td>{c.proxima ? cuando(c.proxima, D.hoy) : '—'}</td></tr>)}</tbody>
        </table></div> : <p className="mut" style={{ fontSize: 13 }}>Ninguno todavía.</p>}
      </div>
    </>
  );
}

// ── Productos y stock ────────────────────────────────────────────────────────

function Productos({ D }) {
  const vendidos = D.productos.filter(x => x.unidades > 0);
  const quietos = D.productos.filter(x => x.unidades === 0 && x.stock > 0);
  const valor = D.productos.reduce((a, x) => a + x.valorStock, 0);
  const max = Math.max(...vendidos.map(x => x.ventas), 1);
  return (
    <>
      <div className="card">
        <h3>Lo vendido</h3>
        <p className="sub">Desde el arranque. "Alcanza para" usa el ritmo de los últimos 60 días.</p>
        <div className="sx"><table className="t">
          <thead><tr><th>Producto</th><th>Unidades</th><th>Vendido</th><th>Margen</th><th>Stock</th><th>Alcanza para</th></tr></thead>
          <tbody>{vendidos.map(x => (
            <tr key={x.cod || x.item}><td className="w">{nom(x.item)}<div className="tk" style={{ height: 4, background: 'var(--line2)', marginTop: 4, borderRadius: 2 }}><i style={{ display: 'block', height: '100%', width: `${x.ventas / max * 100}%`, background: 'var(--bar)', borderRadius: 2 }} /></div></td>
              <td>{x.unidades.toLocaleString('es-AR')}</td><td>{fmt(x.ventas)}</td><td>{x.ventas ? pc((x.ventas - x.costo) / x.ventas) : '—'}</td>
              <td>{x.stock}</td><td style={x.dias != null && x.dias < 15 ? { color: 'var(--down)', fontWeight: 700 } : undefined}>{x.dias == null ? '—' : x.dias > 365 ? 'más de un año' : `${x.dias} días`}</td></tr>))}
          </tbody>
        </table></div>
      </div>
      <div className="g2">
        <div className="card">
          <h3>Stock en el depósito Carmix</h3>
          <p className="sub">{D.productos.filter(x => x.stock > 0).length} productos con stock, {fmt(valor)} al costo.</p>
          <div className="pe-rows">
            <div><span>Unidades</span><b>{D.productos.reduce((a, x) => a + x.stock, 0).toLocaleString('es-AR')}</b></div>
            <div><span>De Glick</span><b>{D.productos.filter(x => x.stock > 0 && /GLICK/.test(x.item)).length} productos</b></div>
          </div>
        </div>
        <div className="card">
          <h3>Con stock y sin ninguna venta</h3>
          <p className="sub">{quietos.length} productos, {fmt(quietos.reduce((a, x) => a + x.valorStock, 0))} al costo.</p>
          <div className="pe-rows">{quietos.map(x => <div key={x.cod}><span>{nom(x.item)}</span><b>{x.stock} u.</b></div>)}</div>
        </div>
      </div>
    </>
  );
}

// ── Cobranza ─────────────────────────────────────────────────────────────────

function Cobranza({ D }) {
  const total = D.deudas.reduce((a, d) => a + d.saldo, 0);
  return (
    <>
      <div className="card">
        <h3>Facturas sin cobrar</h3>
        <p className="sub">{D.deudas.length} facturas, {fmt(total)}. El saldo sale de los cobros cargados en Dux.</p>
        <div className="sx"><table className="t">
          <thead><tr><th>Comercio</th><th>Factura</th><th>Fecha</th><th>Total</th><th>Falta cobrar</th><th>Días</th></tr></thead>
          <tbody>{D.deudas.map(d => (
            <tr key={d.id}><td className="w">{d.nombre || 'Sin cliente'}</td><td>{d.comprobante}</td><td>{fechaCorta(d.fecha)}</td><td>{fmt(d.total)}</td><td><b>{fmt(d.saldo)}</b></td>
              <td style={d.dias > 30 ? { color: 'var(--down)', fontWeight: 700 } : undefined}>{d.dias}</td></tr>))}
            <tr className="tot"><td>Total</td><td /><td /><td /><td>{fmt(total)}</td><td /></tr>
          </tbody>
        </table></div>
      </div>
      <div className="card">
        <h3>Pedidos sin facturar</h3>
        <p className="sub">Los de consignación se facturan y cobran cuando el cliente vuelve a pedir.</p>
        {D.pedidos.length ? <div className="sx"><table className="t">
          <thead><tr><th>Comercio</th><th>Pedido</th><th>Fecha</th><th>Total</th><th /></tr></thead>
          <tbody>{D.pedidos.map(x => <tr key={x.nro_pedido}><td className="w">{x.nombre}</td><td>{x.nro_pedido}</td><td>{fechaCorta(x.fecha)}</td><td>{fmt(x.total)}</td><td>{x.consignacion ? 'Consignación' : 'Sin facturar'}</td></tr>)}</tbody>
        </table></div> : <p className="mut" style={{ fontSize: 13 }}>No hay pedidos pendientes.</p>}
      </div>
    </>
  );
}

// ── Pepa ─────────────────────────────────────────────────────────────────────

function Pepa({ D, recargar }) {
  const { semanas, embudo, motivos, contactos, tareas } = D.pepa;
  const actual = semanas.at(-1);
  const m = D.metas;
  const maxE = Math.max(embudo.comercios, 1);
  return (
    <>
      <div className="cards">
        {[['Contactos esta semana', actual.contactos, m.contactos, `${actual.visitas} visitas`],
          ['Clientes nuevos', actual.nuevos, m.nuevos, 'primera compra en la semana'],
          ['Facturado en la semana', fmt(actual.ventas), m.ventas ? fmt(m.ventas) : null, `${actual.pedidos} pedidos cargados por Pepa`],
          ['Tareas hechas a tiempo', `${actual.tareasATiempo} de ${actual.tareasHechas}`, null, `${tareas.filter(t => t.vence < D.hoy).length} atrasadas hoy`]]
          .map(([l, v, meta, a]) => (
            <div key={l} className="kc"><span className="l">{l}</span><span className="v">{v}</span><span className="a">{meta ? `Meta: ${meta}` : a}</span>{meta && <span className="a">{a}</span>}</div>))}
      </div>

      <div className="g32">
        <div className="card">
          <h3>Semana a semana</h3>
          <p className="sub">De lunes a domingo. Sin metas cargadas todavía no hay contra qué comparar.</p>
          <div className="sx"><table className="t">
            <thead><tr><th>Semana</th><th>Contactos</th><th>Visitas</th><th>Pedidos</th><th>Comercios cargados</th><th>Clientes nuevos</th><th>Facturado</th></tr></thead>
            <tbody>{semanas.map(s => <tr key={s.desde}><td>{fechaCorta(s.desde)} al {fechaCorta(s.hasta)}</td><td>{s.contactos}</td><td>{s.visitas}</td><td>{s.pedidos}</td><td>{s.cargados}</td><td>{s.nuevos}</td><td>{fmt(s.ventas)}</td></tr>)}</tbody>
          </table></div>
        </div>
        <Metas metas={m} onGuardar={recargar} />
      </div>

      <div className="g2">
        <div className="card">
          <h3>De contactar a repetir</h3>
          <p className="sub">Todos los comercios activos de la lista.</p>
          <div className="hb">
            {[['En la lista', embudo.comercios], ['Contactados', embudo.contactados], ['Compraron', embudo.compraron], ['Repiten', embudo.repiten]].map(([l, v]) => (
              <div key={l} className="r"><span>{l}</span><span className="tk"><i style={{ width: `${v / maxE * 100}%` }} /></span><b>{v}</b></div>))}
          </div>
        </div>
        <div className="card">
          <h3>Por qué no compran</h3>
          <p className="sub">Lo que eligió Pepa cuando un comercio no compró.</p>
          {motivos.length ? <div className="pe-rows">{motivos.map(x => <div key={x.motivo}><span>{label(MOTIVOS, x.motivo)}</span><b>{x.n}</b></div>)}</div>
            : <p className="mut" style={{ fontSize: 13 }}>Todavía no hay contactos con "no compró".</p>}
        </div>
      </div>

      <div className="card">
        <h3>A quién le tiene que hablar</h3>
        <p className="sub">{tareas.length} pendientes. Para encargarle un comercio, andá a <Link to="/senzen/comercios" style={{ textDecoration: 'underline' }}>Comercios</Link>.</p>
        <div className="sx"><table className="t">
          <thead><tr><th>Comercio</th><th>Por qué</th><th>Para</th><th>Último contacto</th><th /></tr></thead>
          <tbody>{tareas.map(t => (
            <tr key={t.id}><td className="w">{t.nombre}</td><td className="w">{TAREAS[t.tipo]}</td>
              <td style={t.vence < D.hoy ? { color: 'var(--down)', fontWeight: 700 } : undefined}>{cuando(t.vence, D.hoy)}</td>
              <td>{t.ultimo_contacto ? cuando(t.ultimo_contacto, D.hoy) : '—'}</td>
              <td><button className="mut" style={{ fontSize: 12, textDecoration: 'underline' }} onClick={() => api.post(`/senzen/tareas/${t.id}/descartar`).then(recargar)}>Descartar</button></td></tr>))}
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h3>Últimos contactos</h3>
        <p className="sub">Con la foto de la exhibición y dónde estaba al cargarlo.</p>
        {contactos.length ? <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
          {contactos.map(k => (
            <div key={k.id} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', fontSize: 12.5 }}>
              {k.foto ? <Foto id={k.id} /> : <div style={{ height: 40, background: 'var(--line2)' }} />}
              <div style={{ padding: 10, display: 'grid', gap: 2 }}>
                <b>{k.nombre}</b>
                <span className="mut">{fechaCorta(k.fecha)} · {label(MEDIOS, k.medio)} · {k.quien.replace(/\s*\(.*\)$/, '')}</span>
                <span>{label(RESULTADOS, k.resultado)}{k.motivo ? `: ${label(MOTIVOS, k.motivo).toLowerCase()}` : ''}{k.volver_el ? ` · volver ${cuando(k.volver_el, D.hoy)}` : ''}</span>
                {k.lat != null && <a href={`https://www.google.com/maps?q=${k.lat},${k.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--hi)' }}>Ver en el mapa</a>}
              </div>
            </div>))}
        </div> : <p className="mut" style={{ fontSize: 13 }}>Pepa todavía no cargó contactos.</p>}
      </div>
    </>
  );
}

// La foto pide token: se baja con api y se muestra como blob.
function Foto({ id }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    api.get(`/senzen/contactos/${id}/foto`, { responseType: 'blob' }).then(r => { url = URL.createObjectURL(r.data); setSrc(url); }).catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [id]);
  return src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="Exhibición" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} /></a>
    : <div style={{ height: 150, background: 'var(--line2)' }} />;
}

function Metas({ metas, onGuardar }) {
  const [f, setF] = useState({ contactos: metas.contactos ?? '', nuevos: metas.nuevos ?? '', ventas: metas.ventas ?? '' });
  const [msg, setMsg] = useState('');
  async function guardar(e) {
    e.preventDefault();
    try { await api.put('/senzen/metas', f); setMsg('Metas guardadas'); onGuardar(); }
    catch (err) { setMsg(err.response?.data?.error || 'No se pudieron guardar'); }
  }
  return (
    <form className="card" onSubmit={guardar}>
      <h3>Metas por semana</h3>
      <p className="sub">Las definen los socios. Vacío = sin meta. Pepa ve las de contactos y clientes nuevos.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {[['contactos', 'Contactos (visitas, llamadas, WhatsApp)'], ['nuevos', 'Clientes nuevos'], ['ventas', 'Facturado ($)']].map(([k, l]) => (
          <label key={k} style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
            <span className="mut">{l}</span>
            <input className="input" inputMode="numeric" value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} id={`meta-${k}`} />
          </label>))}
        <button className="btn-primary">Guardar metas</button>
        {msg && <span className="mut" style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>
    </form>
  );
}
