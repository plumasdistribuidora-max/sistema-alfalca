import { useEffect, useState } from 'react';
import api from '../../../api';
import { comprimir } from '../../../utils/fotos';
import { Modal } from '../../tareas/kanban';
import { TIPOS, MEDIOS, MOTIVOS, RESULTADOS_CONTACTO, RESULTADOS_NUEVO, PIDEN_FECHA, SENZEN, sumarDias, hoyLocal, label, fechaCorta, NUNITO } from './senzenUtils';

// Los dos reportes de Pepa (23/10/2026). Cada uno es la prueba de que hizo una tarea y lo
// aprueba un dueño: la visita a un comercio nuevo (con la foto de la puerta del local) y el
// contacto con un cliente que ya compró. Si se lo devuelven, lo corrige acá mismo.

function useUbicacion() {
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(p => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, timeout: 15000 });
  }, []);
  return geo;
}

export function Chips({ opciones, valor, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${valor === v ? 'text-white' : 'bg-white border-ahg-accent/60 text-ahg-text hover:bg-ahg-bg'}`}
                style={valor === v ? { background: SENZEN, borderColor: SENZEN } : undefined}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Pregunta({ titulo, obligatoria, children }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-semibold">{titulo}{obligatoria && <span className="text-red-700"> *</span>}</p>
      {children}
    </div>
  );
}

function Foto({ id, foto, setFoto, texto }) {
  async function elegir(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setFoto(await comprimir(file)); } catch { setFoto(file); }
  }
  return (
    <label htmlFor={id} className="grid place-items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer text-sm"
           style={foto ? { borderColor: SENZEN, background: '#e5eee6', color: SENZEN } : { color: 'rgba(31,32,34,.6)' }}>
      <input id={id} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} />
      {foto ? <><img src={URL.createObjectURL(foto)} alt="" className="max-h-40 rounded-lg" /><span className="font-semibold">Foto lista · tocá para cambiarla</span></> : texto}
    </label>
  );
}

function FechaVolver({ valor, onChange }) {
  const hoy = hoyLocal();
  return (
    <div className="grid gap-2">
      <Chips opciones={[[sumarDias(hoy, 1), 'Mañana'], [sumarDias(hoy, 3), 'En 3 días'], [sumarDias(hoy, 7), 'En una semana']]} valor={valor} onChange={onChange} />
      <label className="flex items-center gap-2 text-xs text-ahg-text/55">u otro día:
        <input type="date" className="input !w-auto !py-1.5" min={sumarDias(hoy, 1)} value={valor || ''} onChange={e => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function Cabeza({ titulo, paso, onCerrar }) {
  return (
    <div className="flex items-start gap-3">
      <h2 className="text-lg font-extrabold flex-1 leading-snug" style={NUNITO}>{titulo}</h2>
      {paso && <span className="text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color: SENZEN, background: '#e5eee6' }}>{paso}</span>}
      <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-ahg-bg hover:bg-ahg-accent/40 text-lg leading-none flex-shrink-0">×</button>
    </div>
  );
}

const enviarFoto = (campos, foto) => {
  const fd = new FormData();
  Object.entries(campos).forEach(([k, v]) => v !== null && v !== undefined && v !== '' && fd.append(k, v));
  if (foto) fd.append('foto', foto);
  return fd;
};

// Visita a un comercio nuevo. `corregir`: el reporte devuelto, para completarlo.
export function NuevaVisita({ paso, corregir, onCerrar, onListo }) {
  const geo = useUbicacion();
  const [f, setF] = useState(corregir
    ? { resultado: corregir.resultado, comentario: corregir.comentario || '', volver_el: corregir.volver_el || '' }
    : { nombre: '', tipo: '', localidad: '', direccion: '', contacto: '', telefono: '', resultado: '', comentario: '', volver_el: '' });
  const [foto, setFoto] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault(); setError('');
    if (!corregir && !foto) return setError('Falta la foto de la puerta del local.');
    if (!corregir && !f.nombre.trim()) return setError('Escribí el nombre del comercio.');
    if (!f.resultado) return setError('Elegí cómo te fue.');
    if (f.resultado === 'volver' && !f.volver_el) return setError('Elegí cuándo volver a pasar.');
    if (f.comentario.trim().length < 5) return setError('Contá cómo te fue.');
    setGuardando(true);
    try {
      if (corregir) await api.put(`/senzen/contactos/${corregir.id}`, enviarFoto(f, foto));
      else await api.post('/senzen/visitas-nuevas', enviarFoto({ ...f, lat: geo?.lat, lng: geo?.lng }, foto));
      onListo();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar. Probá de nuevo.'); setGuardando(false); }
  }

  const etiq = 'grid gap-1 text-xs text-ahg-text/60';
  return (
    <Modal onCerrar={onCerrar} ancho="max-w-md">
      <form onSubmit={guardar} noValidate className="p-5 grid gap-4">
        <Cabeza titulo={corregir ? `Corregir: ${corregir.nombre}` : 'Visita a un comercio nuevo'} paso={paso} onCerrar={onCerrar} />
        {corregir?.respuesta && <p className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-800"><b>{corregir.aprobado_por_nombre?.replace(/\s*\(.*\)$/, '') || 'Un dueño'} te pidió:</b> {corregir.respuesta}</p>}
        <Pregunta titulo={corregir ? 'Foto de la puerta (si querés cambiarla)' : 'Foto de la puerta del local'} obligatoria={!corregir}>
          <Foto id="nv-foto" foto={foto} setFoto={setFoto} texto="Sacar foto de la puerta" />
        </Pregunta>
        {!corregir && (
          <>
            <label className={etiq}>Nombre del comercio *<input id="nv-nombre" className="input" maxLength={200} value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Limpiamás" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={etiq}>Tipo
                <select id="nv-tipo" className="input" value={f.tipo} onChange={set('tipo')}><option value="">Elegí</option>{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
              <label className={etiq}>Localidad<input id="nv-loc" className="input" value={f.localidad} onChange={set('localidad')} placeholder="Godoy Cruz" /></label>
            </div>
            <label className={etiq}>Dirección<input id="nv-dir" className="input" value={f.direccion} onChange={set('direccion')} placeholder="Calle y número" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={etiq}>Con quién hablaste<input id="nv-cont" className="input" value={f.contacto} onChange={set('contacto')} placeholder="Nombre y puesto" /></label>
              <label className={etiq}>Teléfono<input id="nv-tel" className="input" inputMode="tel" value={f.telefono} onChange={set('telefono')} placeholder="261…" /></label>
            </div>
          </>
        )}
        <Pregunta titulo="¿Cómo te fue?" obligatoria>
          <Chips opciones={RESULTADOS_NUEVO} valor={f.resultado} onChange={v => setF(x => ({ ...x, resultado: v, volver_el: v === 'volver' ? x.volver_el : '' }))} />
        </Pregunta>
        {f.resultado === 'volver' && <Pregunta titulo="¿Cuándo volvés a pasar?" obligatoria><FechaVolver valor={f.volver_el} onChange={v => setF(x => ({ ...x, volver_el: v }))} /></Pregunta>}
        <label className={etiq}>Contá cómo te fue *
          <textarea id="nv-com" className="input" rows={3} maxLength={1000} value={f.comentario} onChange={set('comentario')} placeholder="Qué le mostraste, qué te dijo, qué quedó en hacer" />
        </label>
        {!corregir && <p className="text-xs text-ahg-text/45">{geo ? 'Ubicación tomada.' : 'Si el celular te pide la ubicación, aceptá: queda marcada la visita.'}</p>}
        {error && <p className="text-sm text-red-700 font-semibold">{error}</p>}
        <button type="submit" disabled={guardando} className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50" style={{ background: SENZEN }}>
          {guardando ? 'Enviando…' : corregir ? 'Enviar de nuevo' : `Enviar${paso ? ` · ${paso}` : ''}`}
        </button>
      </form>
    </Modal>
  );
}

// Contactar a un cliente que ya compró: el reporte de esa tarea. `corregir`: el devuelto.
export function ContarComoFue({ tarea, corregir, onCerrar, onListo }) {
  const geo = useUbicacion();
  const k = corregir || tarea?.contacto;
  const [f, setF] = useState({ medio: corregir?.medio || '', resultado: corregir?.resultado || '', motivo: '', volver_el: corregir?.volver_el || '', comentario: corregir?.comentario || '' });
  const [foto, setFoto] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const tel = tarea?.telefono;

  async function guardar(e) {
    e.preventDefault(); setError('');
    if (!f.medio) return setError('Elegí cómo te comunicaste.');
    if (!f.resultado) return setError('Elegí qué pasó.');
    if (PIDEN_FECHA.includes(f.resultado) && !f.volver_el) return setError('Elegí para cuándo.');
    if (f.comentario.trim().length < 5) return setError('Contá cómo fue.');
    if (!corregir && f.medio === 'visita' && !foto) return setError('En una visita la foto de cómo quedó el producto es obligatoria.');
    setGuardando(true);
    try {
      if (corregir) await api.put(`/senzen/contactos/${corregir.id}`, enviarFoto(f, foto));
      else await api.post('/senzen/contactos', enviarFoto({ ...f, comercio_id: tarea.comercio_id, lat: geo?.lat, lng: geo?.lng }, foto));
      onListo();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar. Probá de nuevo.'); setGuardando(false); }
  }

  const nombre = tarea?.nombre || corregir?.nombre;
  return (
    <Modal onCerrar={onCerrar} ancho="max-w-md">
      <form onSubmit={guardar} noValidate className="p-5 grid gap-4">
        <Cabeza titulo={corregir ? `Corregir: ${nombre}` : nombre} onCerrar={onCerrar} />
        {tarea && <p className="text-sm text-ahg-text/60 -mt-2">{tarea.motivo_texto}</p>}
        {k?.respuesta && corregir && <p className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-800"><b>Te pidieron:</b> {k.respuesta}</p>}
        {!corregir && (
          <div className="rounded-xl bg-ahg-bg px-3 py-2.5 text-sm grid gap-1.5">
            {tel ? <>
              <span>Teléfono: <b>{tel}</b></span>
              <span className="flex gap-2">
                <a href={`tel:${tel.replace(/[^\d+]/g, '')}`} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white border border-ahg-accent/60">Llamar</a>
                <a href={`https://wa.me/${tel.replace(/\D/g, '').replace(/^0/, '549')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white border border-ahg-accent/60">Abrir WhatsApp</a>
              </span>
            </> : <>
              <span>Este cliente todavía no tiene teléfono cargado.</span>
              <span className="text-xs text-ahg-text/55">Cargalo en Comercios y acá te aparecen los botones para llamarlo o escribirle.</span>
            </>}
          </div>
        )}
        <Pregunta titulo="¿Cómo te comunicaste?" obligatoria><Chips opciones={MEDIOS} valor={f.medio} onChange={v => setF(x => ({ ...x, medio: v }))} /></Pregunta>
        <Pregunta titulo="¿Qué pasó?" obligatoria>
          <Chips opciones={RESULTADOS_CONTACTO} valor={f.resultado} onChange={v => setF(x => ({ ...x, resultado: v, volver_el: PIDEN_FECHA.includes(v) ? x.volver_el : '', motivo: '' }))} />
        </Pregunta>
        {PIDEN_FECHA.includes(f.resultado) && <Pregunta titulo="¿Para cuándo?" obligatoria><FechaVolver valor={f.volver_el} onChange={v => setF(x => ({ ...x, volver_el: v }))} /></Pregunta>}
        {f.resultado === 'no_quiere' && <Pregunta titulo="¿Por qué? (opcional)"><Chips opciones={MOTIVOS} valor={f.motivo} onChange={v => setF(x => ({ ...x, motivo: v }))} /></Pregunta>}
        <label className="grid gap-1 text-xs text-ahg-text/60">Contá cómo fue *
          <textarea id="cf-com" className="input" rows={3} maxLength={1000} value={f.comentario} onChange={e => setF(x => ({ ...x, comentario: e.target.value }))} placeholder="Ej.: le escribí el martes y el jueves, no contestó" />
        </label>
        <Pregunta titulo={f.medio === 'visita' && !corregir ? 'Foto de cómo quedó el producto' : 'Foto o captura del chat (opcional)'} obligatoria={f.medio === 'visita' && !corregir}>
          <Foto id="cf-foto" foto={foto} setFoto={setFoto} texto="Sacar foto" />
        </Pregunta>
        {error && <p className="text-sm text-red-700 font-semibold">{error}</p>}
        <button type="submit" disabled={guardando} className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50" style={{ background: SENZEN }}>
          {guardando ? 'Enviando…' : corregir ? 'Enviar de nuevo' : 'Enviar a los dueños'}
        </button>
      </form>
    </Modal>
  );
}

// Una foto de un reporte, para los dueños.
export function FotoReporte({ id }) {
  const [url, setUrl] = useState(null);
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    let vivo = true, creada = null;
    api.get(`/senzen/contactos/${id}/foto`, { responseType: 'blob' })
      .then(r => { if (!vivo) return; creada = URL.createObjectURL(r.data); setUrl(creada); }).catch(() => {});
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [id]);
  return (
    <>
      <button type="button" onClick={() => url && setGrande(true)} className="block w-full aspect-video rounded-lg overflow-hidden bg-ahg-bg">
        {url ? <img src={url} alt="Foto del reporte" className="w-full h-full object-cover" /> : <span className="text-xs text-ahg-text/50">Cargando foto…</span>}
      </button>
      {grande && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setGrande(false)}><img src={url} alt="" className="max-w-full max-h-full rounded-lg" /></div>}
    </>
  );
}

export const resultadoTexto = (k, tipo) => label(tipo === 'nuevo' ? RESULTADOS_NUEVO : RESULTADOS_CONTACTO, k.resultado)
  + (k.volver_el ? ` · para el ${fechaCorta(k.volver_el)}` : '');
