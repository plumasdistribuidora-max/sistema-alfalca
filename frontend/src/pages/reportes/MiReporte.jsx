import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import Campo, { soloNumero, FotoAdjunta } from './campos';
import { UNIDADES, precioPor } from '../../utils/unidades';
import { campoVisible } from './pesaje';
import { camposApertura, camposEntrega, tieneApertura, codigosFotoApertura, resumenApertura, hora } from './etapas';

const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
const fechaLarga = f => FECHA_LARGA.format(new Date(`${f}T12:00:00`));

// Las fotos salen de la cámara del celular a 4000px y 5 MB. Se achican acá para que
// la carga no dependa de la señal que haya en el local.
function comprimir(file, maxLado = 1600, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(new File([blob], 'foto.jpg', { type: 'image/jpeg' })) : reject(new Error('No se pudo procesar la foto')),
        'image/jpeg', calidad
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

function ModalFactura({ proveedores, onGuardar, onCerrar }) {
  const [f, setF] = useState({ proveedor_id: '', numero: '', total: '', items: [{}] });
  const [guardando, setGuardando] = useState(false);

  const subtotal = f.items.reduce(
    (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unit) || 0), 0
  );
  const dif = (Number(f.total) || 0) - subtotal;

  function editarItem(i, campo, v) {
    setF(x => ({ ...x, items: x.items.map((it, idx) => idx === i ? { ...it, [campo]: v } : it) }));
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    await onGuardar({ ...f, items: f.items.filter(i => i.producto?.trim()) });
    setGuardando(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-3 overflow-y-auto">
      <form onSubmit={guardar} className="bg-white rounded-2xl w-full max-w-md my-4 p-5 space-y-4">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Nueva factura</h2>

        <div>
          <label className="label">Proveedor</label>
          <select className="input" required value={f.proveedor_id}
                  onChange={e => setF(x => ({ ...x, proveedor_id: e.target.value }))}>
            <option value="">Elegí el proveedor…</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <p className="text-xs text-ahg-text/50 mt-1">
            {proveedores.length
              ? 'Si el proveedor no está en la lista, avisale al encargado para que lo cargue.'
              : 'Todavía no hay proveedores cargados. Avisale al encargado.'}
          </p>
        </div>
        <div>
          <label className="label">Número de factura</label>
          <input className="input" value={f.numero} placeholder="A 0003-00018472"
                 onChange={e => setF(x => ({ ...x, numero: e.target.value }))} />
        </div>

        <div>
          <label className="label">
            Detalle
            <span className="block text-xs font-normal text-ahg-text/50">
              Esto es lo que después dice a cuánto estás pagando cada cosa
            </span>
          </label>
          <div className="space-y-2">
            {f.items.map((it, i) => (
              <div key={i} className="space-y-1">
                <input className="input text-sm w-full" placeholder="Producto"
                       value={it.producto || ''} onChange={e => editarItem(i, 'producto', e.target.value)} />
                <div className="flex gap-1.5">
                  <input className="input text-sm w-20 text-right" inputMode="decimal" placeholder="cant"
                         value={it.cantidad ?? ''} onChange={e => editarItem(i, 'cantidad', e.target.value.replace(',', '.'))} />
                  <select className="input text-sm w-24" value={it.unidad || 'u'}
                          onChange={e => editarItem(i, 'unidad', e.target.value)}>
                    {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                  <input className="input text-sm flex-1 text-right" inputMode="numeric"
                         placeholder={`$ ${precioPor(it.unidad)}`}
                         value={it.precio_unit ?? ''} onChange={e => editarItem(i, 'precio_unit', soloNumero(e.target.value))} />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setF(x => ({ ...x, items: [...x.items, {}] }))}
                    className="w-full py-1.5 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg">
              + Agregar renglón
            </button>
          </div>
        </div>

        <div>
          <label className="label">Total de la factura</label>
          <input className="input tabular-nums" inputMode="numeric" required
                 value={f.total === '' ? '' : money.format(f.total)}
                 onChange={e => setF(x => ({ ...x, total: soloNumero(e.target.value) }))} />
        </div>

        {f.items.some(i => i.producto?.trim()) && (
          <div className="rounded-lg bg-ahg-accent/10 border border-ahg-accent/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-ahg-text/60">Suma del detalle</span>
              <span className="tabular-nums font-medium">$ {money.format(subtotal)}</span>
            </div>
            {Math.abs(dif) > 0 && f.total !== '' && (
              <div className="flex justify-between">
                <span className="text-amber-700">Diferencia con el total</span>
                <span className="tabular-nums font-semibold text-amber-700">$ {money.format(Math.abs(dif))}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="btn-secondary flex-1">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary flex-1">
            {guardando ? 'Guardando…' : 'Guardar factura'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Aviso de lo que quedó por resolver de otros días. Un reporte devuelto por el
// encargado, o uno que se empezó y nunca se envió, no aparece en la pantalla de hoy:
// desde acá se abre para corregirlo o terminarlo.
function Pendientes({ lista, onAbrir }) {
  if (!lista.length) return null;
  return (
    <div className="card p-4 mb-4 border-amber-300 bg-amber-50 space-y-2">
      <p className="text-sm font-semibold text-amber-800">
        {lista.length === 1 ? 'Tenés un reporte por resolver' : `Tenés ${lista.length} reportes por resolver`}
      </p>
      {lista.map(p => (
        <div key={p.id} className="bg-white rounded-lg border border-amber-200 p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {p.local_nombre} · turno {p.turno.toLowerCase()} · {fechaLarga(p.fecha)}
            </p>
            {p.estado === 'observado' ? (
              <p className="text-xs text-red-700 mt-0.5">
                Devuelto por el encargado{p.observacion?.comentario && <>: “{p.observacion.comentario}”</>}
              </p>
            ) : (
              <p className="text-xs text-ahg-text/50 mt-0.5">Quedó empezado y sin enviar</p>
            )}
          </div>
          <button onClick={() => onAbrir(p)} className="btn-primary !py-1.5 !px-3 text-sm flex-shrink-0">
            {p.estado === 'observado' ? 'Corregir' : 'Terminar'}
          </button>
        </div>
      ))}
    </div>
  );
}

function TituloEtapa({ titulo, nota, apagado }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] font-bold uppercase tracking-widest ${apagado ? 'text-ahg-text/40' : 'text-ahg-primary'}`}>{titulo}</span>
      <span className="flex-1 h-px bg-ahg-accent/40" />
      {nota && <span className="text-[11px] text-ahg-text/40">{nota}</span>}
    </div>
  );
}

// La apertura ya confirmada: lo que se recibió, con hora y fotos, y sin nada editable.
function AperturaConfirmada({ campos, respuestas, adjuntos, aperturaAt }) {
  const codigos = codigosFotoApertura(campos);
  const fotos = adjuntos.filter(a => codigos.includes(a.campo_codigo));
  return (
    <div className="rounded-xl border border-green-300 bg-green-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
        <span className="text-[11px] font-bold uppercase tracking-wide text-green-800">Turno recibido · {hora(aperturaAt)}</span>
      </div>
      <p className="text-sm text-ahg-text">{resumenApertura(campos, respuestas)}</p>
      {fotos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {fotos.map(a => <div key={a.id} className="w-11 h-14 rounded-md overflow-hidden border border-green-200"><FotoAdjunta id={a.id} /></div>)}
        </div>
      )}
      <p className="text-xs text-ahg-text/50">Ya no se puede modificar. Si algo está mal, avisale al encargado.</p>
    </div>
  );
}

// En la lista de locales, el café y la cocina comparten edificio: se distinguen por el
// nombre del formulario. Las tiendas se distinguen solas por el nombre del local.
const plantilla_es_sector = o => o.plantilla_codigo !== 'tienda';

export default function MiReporte() {
  const { user } = useAuth();

  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState('');
  const [cargando, setCargando] = useState(true);

  const [turno,      setTurno]      = useState('');
  const [respuestas, setRespuestas] = useState({});
  const [reporteId,  setReporteId]  = useState(null);
  const [aperturaAt, setAperturaAt] = useState(null);   // reportes en dos etapas: cuándo se confirmó la recepción
  const [estadoReporte, setEstadoReporte] = useState(null);
  const [adjuntos,   setAdjuntos]   = useState([]);
  const [facturas,   setFacturas]   = useState([]);

  const [guardando,  setGuardando]  = useState(false);
  const [subiendo,   setSubiendo]   = useState(null);
  const [enviando,   setEnviando]   = useState(false);
  const [faltan,     setFaltan]     = useState([]);
  const [enviado,    setEnviado]    = useState(false);
  const [modalFactura, setModalFactura] = useState(false);
  const [proveedores, setProveedores] = useState([]);

  // Reportes de otros días que quedaron por resolver (devueltos o sin enviar), y cuál
  // de ellos está abierto en pantalla en vez del de hoy.
  const [pendientes,  setPendientes]  = useState([]);
  const [corrigiendo, setCorrigiendo] = useState(null);

  const debounce = useRef(null);

  function cargarPendientes() {
    api.get('/reportes/pendientes')
      .then(r => setPendientes(r.data.data))
      .catch(() => {});
  }

  // Carga la pantalla para un local y formulario. Sin argumentos, el backend elige:
  // lo que ya venía cargando hoy, o si no el local propio. Con un pendiente, abre ese
  // reporte puntual de otro día.
  async function cargar(opcion, pendiente = null) {
    setCargando(true);
    clearTimeout(debounce.current);
    try {
      const params = opcion ? { local_id: opcion.local_id, plantilla: opcion.plantilla_codigo } : {};
      if (pendiente) params.fecha = pendiente.fecha;
      const r = await api.get('/reportes/mio', { params });
      setData(r.data.data);
      setCorrigiendo(pendiente);
      const reportes = r.data.data.reportes;
      const previo = (pendiente && reportes.find(x => x.id === pendiente.id)) || reportes[0];
      setTurno(previo?.turno || '');
      setRespuestas(previo?.respuestas || {});
      setReporteId(previo?.id || null);
      setAperturaAt(previo?.apertura_at || null);
      setEstadoReporte(previo?.estado || null);
      setAdjuntos(previo?.adjuntos || []);
      setFacturas(previo?.facturas || []);
      setFaltan([]);
      setEnviado(previo?.estado === 'enviado' || previo?.estado === 'aprobado');
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar tu reporte');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); cargarPendientes(); }, []);

  function refrescarPendientesMantenimiento() {
    if (!data) return;
    const params = { local_id: data.local?.id, plantilla: data.plantilla?.codigo };
    if (corrigiendo) params.fecha = corrigiendo.fecha;
    api.get('/reportes/mio', { params })
      .then(r => setData(d => ({ ...d, mantenimiento_pendientes: r.data.data.mantenimiento_pendientes || [] })))
      .catch(() => {});
  }

  async function confirmarApertura() {
    setEnviando(true);
    setError('');
    setFaltan([]);
    try {
      clearTimeout(debounce.current);
      const id = await guardar(turno, respuestas);
      if (!id) return;
      const r = await api.post(`/reportes/${id}/apertura`);
      setAperturaAt(r.data.data.apertura_at);
      setEstadoReporte(e => e || 'borrador');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const d = err.response?.data;
      if (d?.data?.faltan) setFaltan(d.data.faltan);
      else setError(d?.error || 'No se pudo confirmar');
    } finally {
      setEnviando(false);
    }
  }

  function abrirPendiente(p) {
    cargar({ local_id: p.local_id, plantilla_codigo: p.plantilla_codigo }, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function volverAHoy() { cargar(); }

  // Cambiar de local es cambiar de reporte: se descarta lo que había en pantalla (ya
  // quedó guardado como borrador de ese otro local) y se carga el del elegido.
  function elegirLocal(clave) {
    const opcion = data.opciones.find(o => `${o.local_id}:${o.plantilla_codigo}` === clave);
    if (opcion) cargar(opcion);
  }

  // La lista de proveedores para el desplegable de facturas. Si falla, el modal
  // queda sin opciones y avisa; el resto del reporte se sigue pudiendo cargar.
  useEffect(() => {
    api.get('/proveedores/lista')
      .then(r => setProveedores(r.data.data))
      .catch(() => {});
  }, []);

  const guardar = useCallback(async (nuevoTurno, nuevasRespuestas) => {
    if (!nuevoTurno) return null;
    setGuardando(true);
    try {
      const r = await api.post('/reportes', {
        local_id:  data?.local?.id,
        plantilla: data?.plantilla?.codigo,
        turno:     nuevoTurno,
        fecha:     data?.fecha,
        respuestas: nuevasRespuestas,
      });
      setReporteId(r.data.data.id);
      setError('');
      return r.data.data.id;
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
      return null;
    } finally {
      setGuardando(false);
    }
  }, [data?.fecha, data?.local?.id, data?.plantilla?.codigo]);

  // Autoguardado: el borrador se va guardando solo mientras completa.
  function cambiar(codigo, valor) {
    const nuevas = { ...respuestas, [codigo]: valor };
    setRespuestas(nuevas);
    setFaltan([]);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => guardar(turno, nuevas), 900);
  }

  async function elegirTurno(t) {
    setTurno(t);
    await guardar(t, respuestas);
  }

  async function subirFoto(campoCodigo, file) {
    setSubiendo(campoCodigo);
    setError('');
    try {
      let id = reporteId;
      if (!id) id = await guardar(turno, respuestas);
      if (!id) throw new Error('Elegí primero el turno');

      const chica = await comprimir(file);
      const fd = new FormData();
      fd.append('foto', chica);
      fd.append('campo_codigo', campoCodigo);
      const r = await api.post(`/reportes/${id}/adjuntos`, fd);
      setAdjuntos(a => [...a, r.data.data]);
      setFaltan([]);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'No se pudo subir la foto');
    } finally {
      setSubiendo(null);
    }
  }

  async function borrarFoto(id) {
    try {
      await api.delete(`/reportes/adjuntos/${id}`);
      setAdjuntos(a => a.filter(x => x.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar la foto');
    }
  }

  async function agregarFactura(f) {
    try {
      let id = reporteId;
      if (!id) id = await guardar(turno, respuestas);
      if (!id) throw new Error('Elegí primero el turno');
      await api.post(`/reportes/${id}/facturas`, f);
      const r = await api.get(`/reportes/${id}`);
      setFacturas(r.data.data.facturas || []);
      setModalFactura(false);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la factura');
    }
  }

  async function borrarFactura(id) {
    try {
      await api.delete(`/reportes/facturas/${id}`);
      setFacturas(f => f.filter(x => x.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar la factura');
    }
  }

  async function enviar() {
    setEnviando(true);
    setError('');
    setFaltan([]);
    try {
      clearTimeout(debounce.current);
      const id = await guardar(turno, respuestas);
      if (!id) return;
      await api.post(`/reportes/${id}/enviar`);
      setEnviado(true);
      cargarPendientes();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const d = err.response?.data;
      if (d?.data?.faltan) {
        setFaltan(d.data.faltan);
        // Si otro turno reportó algo de mantenimiento después de que se abrió esta
        // pantalla, el pendiente nuevo no está en la lista: se vuelve a pedir.
        if (d.data.faltan.some(f => f.startsWith('Mantenimiento'))) refrescarPendientesMantenimiento();
      }
      else setError(d?.error || 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  }

  // Solo la primera carga deja la pantalla vacía. Al cambiar de local, el formulario
  // queda atenuado mientras llega el otro: mejor que un "Cargando…" en blanco.
  if (cargando && !data) return <p className="text-center text-ahg-text/50 py-10">Cargando…</p>;

  if (error && !data) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-5 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const { plantilla, local, fecha, opciones = [], otros = [] } = data;
  const fechaTxt = fechaLarga(fecha);
  const esHoy = fecha === hoyStr();
  const claveActual = `${local?.id}:${plantilla.codigo}`;
  // Con una sola opción no hay nada que elegir: se muestra el local y listo. Y al
  // corregir un reporte de otro día tampoco: el local y el turno ya están fijados.
  const eligeLocal = opciones.length > 1 && !corrigiendo;
  const observacion = data.reportes?.find(r => r.id === reporteId)?.observacion || corrigiendo?.observacion;
  // Los pendientes que no son el que está abierto ahora.
  const otrosPendientes = pendientes.filter(p => p.id !== reporteId);
  const etiquetaOpcion = o => plantilla_es_sector(o) ? `${o.plantilla_nombre} · ${o.local_nombre}` : o.local_nombre;
  const campoTurno = plantilla.campos.find(c => c.tipo === 'seleccion' && c.codigo === 'turno');
  // Un campo que cuelga de otro (solo_si) aparece recién cuando esa respuesta lo pide:
  // la foto de la máquina sucia no está ahí molestando si la recibieron bien.
  const resto = plantilla.campos
    .filter(c => c.codigo !== 'turno')
    .filter(c => campoVisible(c, respuestas));

  // Reportes en dos etapas: la apertura se edita hasta confirmarla (o si el encargado
  // devolvió el reporte); la entrega aparece recién después.
  const conEtapas = tieneApertura(plantilla.campos);
  const aperturaEditable = !aperturaAt || estadoReporte === 'observado';
  const entregaVisible = !!aperturaAt;

  // Mantenimiento pendiente: lo de días anteriores siempre; lo de hoy solo si lo
  // reportó la mañana y este es el turno de la tarde (misma regla que el backend).
  const mantenimientoPendientes = (data.mantenimiento_pendientes || [])
    .filter(p => p.fecha < fecha || (turno === 'Tarde' && p.turno === 'Mañana'));

  const ctx = {
    equipo: data.equipo || [],
    mantenimientoPendientes,
    mantenimientoRubros: data.mantenimiento_rubros || [],
    vencimientoProductos: data.vencimiento_productos || [],
    turno, fecha, plantilla, respuestas,
    adjuntos, facturas, subiendo,
    onSubirFoto: subirFoto,
    onBorrarFoto: borrarFoto,
    onAgregarFactura: () => setModalFactura(true),
    onBorrarFactura: borrarFactura,
  };

  if (enviado) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="card p-6 text-center border-green-300 bg-green-50">
          <p className="text-4xl mb-2">✓</p>
          <h1 className="text-lg font-bold text-green-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {corrigiendo ? 'Reporte corregido y enviado' : conEtapas ? 'Turno entregado' : 'Reporte enviado'}
          </h1>
          <p className="text-sm text-green-700 mt-1">
            {local?.nombre}, turno {turno.toLowerCase()} del {fechaTxt}. Ya le llegó al encargado.
          </p>
        </div>
        {corrigiendo && (
          <button onClick={volverAHoy} className="btn-primary w-full">
            Ir al reporte de hoy
          </button>
        )}
        <button onClick={() => setEnviado(false)} className="btn-secondary w-full">
          Ver mi reporte
        </button>
        <Pendientes lista={otrosPendientes} onAbrir={abrirPendiente} />
        {eligeLocal && (
          <div className="card p-4">
            <p className="text-sm text-ahg-text/70 mb-2">¿Trabajaste también en otro local hoy?</p>
            <select className="input" value="" onChange={e => e.target.value && elegirLocal(e.target.value)}>
              <option value="">Elegí el local…</option>
              {opciones.filter(o => `${o.local_id}:${o.plantilla_codigo}` !== claveActual).map(o => (
                <option key={`${o.local_id}:${o.plantilla_codigo}`} value={`${o.local_id}:${o.plantilla_codigo}`}>
                  {etiquetaOpcion(o)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`max-w-lg mx-auto pb-24 transition-opacity ${cargando ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Cabecera con lo que no se tipea */}
      <div className="rounded-2xl px-5 py-4 mb-4" style={{ background: corrigiendo ? '#7F1D1D' : '#45484c' }}>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          {corrigiendo ? `Corrigiendo · ${fechaTxt}` : fechaTxt}
        </p>
        <h1 className="text-lg font-bold text-white mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {plantilla.nombre}
        </h1>
        <p className="text-white/70 text-sm">{user?.nombre} · {local?.nombre}</p>
        {corrigiendo && (
          <button onClick={volverAHoy} className="mt-2 text-sm text-white/80 underline underline-offset-2">
            ← Volver al reporte de hoy
          </button>
        )}
      </div>

      {error && <div className="card px-4 py-3 mb-4 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {observacion && (
        <div className="card px-4 py-3 mb-4 border-red-300 bg-red-50">
          <p className="text-sm font-semibold text-red-800">
            {observacion.encargado} te lo devolvió para corregir:
          </p>
          <p className="text-sm text-red-700 mt-1 whitespace-pre-line">“{observacion.comentario}”</p>
          <p className="text-xs text-red-700/70 mt-2">Corregí lo que haga falta y volvé a tocar Enviar.</p>
        </div>
      )}

      {!corrigiendo && <Pendientes lista={otrosPendientes} onAbrir={abrirPendiente} />}

      {faltan.length > 0 && (
        <div className="card px-4 py-3 mb-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800 mb-1.5">Antes de enviar, completá:</p>
          <ul className="text-sm text-amber-700 list-disc pl-5 space-y-0.5">
            {faltan.map(f => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      {otros.length > 0 && (
        <div className="card px-4 py-3 mb-4 border-ahg-accent bg-ahg-accent/10 text-sm text-ahg-text/80">
          {esHoy ? 'Hoy' : 'Ese día'} también cargaste: {otros.map(o => `${o.local_nombre} (${o.turno.toLowerCase()}, ${o.estado})`).join(' · ')}.
        </div>
      )}

      <div className="card p-5">
        {eligeLocal && (
          <div className="mb-4">
            <label className="label">¿Dónde trabajaste?</label>
            <select className="input" value={claveActual} onChange={e => elegirLocal(e.target.value)}>
              {opciones.map(o => (
                <option key={`${o.local_id}:${o.plantilla_codigo}`} value={`${o.local_id}:${o.plantilla_codigo}`}>
                  {etiquetaOpcion(o)}
                </option>
              ))}
            </select>
            <p className="text-xs text-ahg-text/50 mt-1">
              Si hoy hiciste turnos en dos locales, cargá uno, envialo, y después elegí el otro.
            </p>
          </div>
        )}

        {campoTurno && ((corrigiendo || (conEtapas && aperturaAt)) ? (
          <div className="mb-4">
            <label className="label">{campoTurno.label}</label>
            <p className="text-sm font-semibold">{turno}</p>
          </div>
        ) : (
          <Campo campo={campoTurno} valor={turno} onChange={(_, v) => elegirTurno(v)} ctx={ctx} />
        ))}

        {!turno ? (
          <p className="text-sm text-ahg-text/50 text-center py-6 border-t border-ahg-accent/30">
            Elegí el turno para empezar a cargar.
          </p>
        ) : conEtapas ? (
          <div className="border-t border-ahg-accent/30 pt-5 space-y-5">
            <TituloEtapa titulo="Recibo el turno" nota={aperturaAt ? null : 'se confirma una vez'} />
            {aperturaEditable ? (
              <>
                {camposApertura(plantilla.campos).map(campo => (
                  <Campo key={campo.codigo} campo={campo} valor={respuestas[campo.codigo]} onChange={cambiar} ctx={ctx} />
                ))}
                {resumenApertura(plantilla.campos, respuestas) && (
                  <div className="rounded-lg border border-ahg-accent bg-ahg-accent/10 p-3 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ahg-primary">Así recibís tu turno</p>
                    <p className="text-sm">{resumenApertura(plantilla.campos, respuestas)}</p>
                    {!aperturaAt && <p className="text-xs text-ahg-text/50">Al confirmar, esto queda fijo y no se puede cambiar durante el turno.</p>}
                  </div>
                )}
                {!aperturaAt && (
                  <button onClick={confirmarApertura} disabled={enviando} className="btn-primary w-full">
                    {enviando ? 'Confirmando…' : 'Confirmar que recibí el turno'}
                  </button>
                )}
              </>
            ) : (
              <AperturaConfirmada campos={plantilla.campos} respuestas={respuestas} adjuntos={adjuntos} aperturaAt={aperturaAt} />
            )}

            <TituloEtapa titulo="Entrego el turno" apagado={!entregaVisible} />
            {entregaVisible ? (
              <div>
                {camposEntrega(plantilla.campos).map(campo => (
                  <Campo key={campo.codigo} campo={campo} valor={respuestas[campo.codigo]} onChange={cambiar} ctx={ctx} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ahg-text/50">Se habilita cuando confirmes que recibiste el turno.</p>
            )}
          </div>
        ) : (
          <div className="border-t border-ahg-accent/30 pt-5">
            {resto.map(campo => (
              <Campo
                key={campo.codigo} campo={campo}
                valor={respuestas[campo.codigo]} onChange={cambiar} ctx={ctx}
              />
            ))}
          </div>
        )}
      </div>

      {turno && (!conEtapas || entregaVisible) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-ahg-accent/30 p-3 lg:static lg:bg-transparent lg:border-0 lg:p-0 lg:mt-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <span className="text-xs text-ahg-text/40 flex-shrink-0">
              {guardando ? 'Guardando…' : 'Guardado'}
            </span>
            <button onClick={enviar} disabled={enviando} className="btn-primary flex-1">
              {enviando ? 'Enviando…' : corrigiendo ? 'Enviar corregido' : conEtapas ? 'Entregar turno y enviar al Encargado' : 'Enviar al Encargado'}
            </button>
          </div>
        </div>
      )}

      {modalFactura && (
        <ModalFactura proveedores={proveedores} onGuardar={agregarFactura} onCerrar={() => setModalFactura(false)} />
      )}
    </div>
  );
}
