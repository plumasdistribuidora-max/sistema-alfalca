import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import Campo, { soloNumero } from './campos';

const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

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
              <div key={i} className="flex gap-1.5">
                <input className="input text-sm flex-1" placeholder="Producto"
                       value={it.producto || ''} onChange={e => editarItem(i, 'producto', e.target.value)} />
                <input className="input text-sm w-16 text-right" inputMode="decimal" placeholder="cant"
                       value={it.cantidad ?? ''} onChange={e => editarItem(i, 'cantidad', e.target.value.replace(',', '.'))} />
                <input className="input text-sm w-24 text-right" inputMode="numeric" placeholder="$ c/u"
                       value={it.precio_unit ?? ''} onChange={e => editarItem(i, 'precio_unit', soloNumero(e.target.value))} />
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

export default function MiReporte() {
  const { user } = useAuth();

  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState('');
  const [cargando, setCargando] = useState(true);

  const [turno,      setTurno]      = useState('');
  const [respuestas, setRespuestas] = useState({});
  const [reporteId,  setReporteId]  = useState(null);
  const [adjuntos,   setAdjuntos]   = useState([]);
  const [facturas,   setFacturas]   = useState([]);

  const [guardando,  setGuardando]  = useState(false);
  const [subiendo,   setSubiendo]   = useState(null);
  const [enviando,   setEnviando]   = useState(false);
  const [faltan,     setFaltan]     = useState([]);
  const [enviado,    setEnviado]    = useState(false);
  const [modalFactura, setModalFactura] = useState(false);
  const [proveedores, setProveedores] = useState([]);

  const debounce = useRef(null);

  async function cargar() {
    setCargando(true);
    try {
      const r = await api.get('/reportes/mio');
      setData(r.data.data);
      const previo = r.data.data.reportes[0];
      if (previo) {
        setTurno(previo.turno);
        setRespuestas(previo.respuestas || {});
        setReporteId(previo.id);
        setAdjuntos(previo.adjuntos || []);
        setFacturas(previo.facturas || []);
        if (previo.estado === 'enviado' || previo.estado === 'aprobado') setEnviado(true);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar tu reporte');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

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
        turno: nuevoTurno,
        fecha: data?.fecha,
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
  }, [data?.fecha]);

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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const d = err.response?.data;
      if (d?.data?.faltan) setFaltan(d.data.faltan);
      else setError(d?.error || 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-center text-ahg-text/50 py-10">Cargando…</p>;

  if (error && !data) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-5 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const { plantilla, local, fecha } = data;
  const fechaTxt = FECHA_LARGA.format(new Date(`${fecha}T12:00:00`));
  const campoTurno = plantilla.campos.find(c => c.tipo === 'seleccion' && c.codigo === 'turno');
  const resto = plantilla.campos.filter(c => c.codigo !== 'turno');

  const ctx = {
    equipo: data.equipo || [],
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
            Reporte enviado
          </h1>
          <p className="text-sm text-green-700 mt-1">
            Turno {turno.toLowerCase()} del {fechaTxt}. Ya le llegó al encargado.
          </p>
        </div>
        <button onClick={() => { setEnviado(false); cargar(); }} className="btn-secondary w-full">
          Ver mi reporte
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Cabecera con lo que no se tipea */}
      <div className="rounded-2xl px-5 py-4 mb-4" style={{ background: '#4C1D95' }}>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          {fechaTxt}
        </p>
        <h1 className="text-lg font-bold text-white mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {plantilla.nombre}
        </h1>
        <p className="text-white/70 text-sm">{user?.nombre} · {local?.nombre}</p>
      </div>

      {error && <div className="card px-4 py-3 mb-4 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {faltan.length > 0 && (
        <div className="card px-4 py-3 mb-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800 mb-1.5">Antes de enviar, completá:</p>
          <ul className="text-sm text-amber-700 list-disc pl-5 space-y-0.5">
            {faltan.map(f => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      <div className="card p-5">
        {campoTurno && (
          <Campo campo={campoTurno} valor={turno} onChange={(_, v) => elegirTurno(v)} ctx={ctx} />
        )}

        {!turno ? (
          <p className="text-sm text-ahg-text/50 text-center py-6 border-t border-ahg-accent/30">
            Elegí el turno para empezar a cargar.
          </p>
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

      {turno && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-ahg-accent/30 p-3 lg:static lg:bg-transparent lg:border-0 lg:p-0 lg:mt-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <span className="text-xs text-ahg-text/40 flex-shrink-0">
              {guardando ? 'Guardando…' : 'Guardado'}
            </span>
            <button onClick={enviar} disabled={enviando} className="btn-primary flex-1">
              {enviando ? 'Enviando…' : 'Enviar al Encargado'}
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
