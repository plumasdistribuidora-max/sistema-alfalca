import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../../api';
import { comprimir } from '../../../utils/fotos';
import { NuevoComercio } from './Comercios';
import { MEDIOS, RESULTADOS_CONTACTO, MOTIVOS, sumarDias, hoyLocal, cuando, NUNITO } from './senzenUtils';

// Cargar una visita, llamada o WhatsApp que no estaba en el calendario. Se elige de listas y
// se cuenta cómo fue; en una visita la foto de cómo quedó el producto es obligatoria. Como
// todo reporte de Pepa, lo aprueba un dueño. La ubicación se toma sola si el celular la da.
// Las visitas a comercios nuevos se cargan desde Mi semana, con la foto de la puerta.
export default function RegistrarContacto() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const hoy = hoyLocal();
  const [comercios, setComercios] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ comercio_id: params.get('comercio') || '', medio: 'visita', resultado: '', motivo: '', volver_el: '', comentario: '' });
  const [foto, setFoto] = useState(null);
  const [geo, setGeo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  const cargar = () => api.get('/senzen/comercios').then(r => setComercios(r.data.data.filter(c => c.activo)))
    .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los comercios'));
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(p => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, timeout: 15000 });
  }, []);

  const elegido = comercios?.find(c => String(c.id) === String(f.comercio_id));
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (comercios || []).filter(c => !q || c.nombre.toLowerCase().includes(q) || (c.localidad || '').toLowerCase().includes(q)).slice(0, 30);
  }, [comercios, buscar]);

  const pideFecha = ['va_a_comprar', 'volver'].includes(f.resultado);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  async function elegirFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setFoto(await comprimir(file)); } catch { setFoto(file); }
  }

  async function guardar() {
    setError('');
    if (!f.comercio_id) return setError('Elegí el comercio.');
    if (!f.resultado) return setError('Elegí cómo terminó.');
    if (pideFecha && !f.volver_el) return setError('Elegí cuándo volver a hablarle.');
    if (f.comentario.trim().length < 5) return setError('Contá cómo fue.');
    if (f.medio === 'visita' && !foto) return setError('Sacale una foto a cómo quedó el producto en el comercio.');
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
    if (geo) { fd.append('lat', geo.lat); fd.append('lng', geo.lng); }
    if (foto) fd.append('foto', foto);
    setGuardando(true);
    try {
      await api.post('/senzen/contactos', fd);
      setListo(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (listo) return (
    <div className="max-w-md mx-auto card p-8 text-center space-y-4 mt-6">
      <p className="text-xl font-extrabold" style={NUNITO}>Listo, quedó cargado</p>
      <p className="text-sm text-ahg-text/60">Lo tiene que aprobar un dueño.</p>
      <p className="text-sm text-ahg-text/60">{elegido?.nombre}{f.volver_el ? ` · te lo recordamos ${cuando(f.volver_el, hoy)}` : ''}</p>
      <div className="flex gap-2 justify-center">
        <button className="btn-secondary" onClick={() => { setF({ comercio_id: '', medio: 'visita', resultado: '', motivo: '', volver_el: '', comentario: '' }); setFoto(null); setListo(false); cargar(); }}>Cargar otro</button>
        <button className="btn-primary" onClick={() => navigate('/')}>Volver a mi semana</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ahg-text" style={NUNITO}>Cargar visita o llamada</h1>
        <Link to="/" className="text-sm text-ahg-text/60">Cancelar</Link>
      </div>

      <Paso n="Comercio">
        {elegido ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2.5">
            <div className="min-w-0"><p className="font-semibold truncate">{elegido.nombre}</p><p className="text-xs text-ahg-text/60">{elegido.localidad || 'sin localidad'}</p></div>
            <button className="text-xs font-semibold text-teal-800" onClick={() => set('comercio_id', '')}>Cambiar</button>
          </div>
        ) : nuevo ? (
          <NuevoComercio onListo={c => { setNuevo(false); cargar().then(() => set('comercio_id', String(c.id))); }} onCancelar={() => setNuevo(false)} />
        ) : (
          <div className="space-y-2">
            <input className="input" placeholder="Buscar por nombre o localidad" value={buscar} onChange={e => setBuscar(e.target.value)} id="buscar-comercio" />
            <div className="max-h-64 overflow-y-auto divide-y divide-stone-100 rounded-lg border border-ahg-accent/40 bg-white">
              {comercios === null ? <p className="p-3 text-sm text-ahg-text/50">Cargando…</p>
                : lista.length ? lista.map(c => (
                  <button key={c.id} className="w-full text-left px-3 py-2.5 hover:bg-ahg-bg" onClick={() => set('comercio_id', String(c.id))}>
                    <span className="font-medium">{c.nombre}</span> <span className="text-xs text-ahg-text/50">{c.localidad || ''}</span>
                  </button>))
                : <p className="p-3 text-sm text-ahg-text/50">No hay ninguno con ese nombre.</p>}
            </div>
            <button className="text-sm font-semibold text-teal-700" onClick={() => setNuevo(true)}>+ Es un comercio nuevo</button>
          </div>
        )}
      </Paso>

      <Paso n="¿Cómo fue?">
        <Chips opciones={MEDIOS} valor={f.medio} onChange={v => set('medio', v)} />
      </Paso>

      <Paso n="¿Qué pasó?">
        <Chips opciones={RESULTADOS_CONTACTO} valor={f.resultado} onChange={v => setF(x => ({ ...x, resultado: v, motivo: '', volver_el: '' }))} />
      </Paso>

      {f.resultado === 'no_quiere' && (
        <Paso n="¿Por qué? (opcional)">
          <Chips opciones={MOTIVOS} valor={f.motivo} onChange={v => set('motivo', v)} />
        </Paso>
      )}

      <Paso n="Contá cómo fue">
        <textarea id="comentario" className="input" rows={3} maxLength={1000} value={f.comentario} onChange={e => set('comentario', e.target.value)} placeholder="Qué le dijiste, qué te contestó, qué quedó en hacer" />
      </Paso>

      {f.resultado && (
        <Paso n={pideFecha ? '¿Cuándo le volvés a hablar?' : '¿Querés que te lo recordemos? (opcional)'}>
          <Chips
            opciones={[[sumarDias(hoy, 1), 'Mañana'], [sumarDias(hoy, 3), 'En 3 días'], [sumarDias(hoy, 7), 'En una semana'], [sumarDias(hoy, 15), 'En 15 días']]}
            valor={f.volver_el} onChange={v => set('volver_el', f.volver_el === v ? '' : v)} />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-ahg-text/55">u otro día:</span>
            <input type="date" className="input !w-auto" min={sumarDias(hoy, 1)} value={f.volver_el} onChange={e => set('volver_el', e.target.value)} id="volver-el" />
          </div>
        </Paso>
      )}

      <Paso n={f.medio === 'visita' ? 'Foto de cómo quedó el producto' : 'Foto (opcional)'}>
        <label className={`block rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer ${foto ? 'border-teal-600 bg-teal-50' : 'border-ahg-accent'}`}>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFoto} id="foto" />
          {foto ? <span className="text-sm font-medium text-teal-800">Foto lista · tocá para cambiarla</span>
            : <span className="text-sm text-ahg-text/60">Sacar foto</span>}
        </label>
        {foto && <img src={URL.createObjectURL(foto)} alt="" className="mt-2 rounded-lg max-h-56 object-cover" />}
      </Paso>

      <p className="text-xs text-ahg-text/45">{geo ? 'Ubicación tomada.' : 'Sin ubicación: si el celular la pide, aceptá para que quede marcada la visita.'}</p>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <button className="btn-primary w-full !py-3.5 text-base" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </div>
  );
}

function Paso({ n, children }) {
  return <section className="space-y-2"><h2 className="text-xs font-semibold uppercase tracking-wider text-ahg-text/55">{n}</h2>{children}</section>;
}

export function Chips({ opciones, valor, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
          className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors
            ${valor === v ? 'bg-ahg-primary border-ahg-primary text-white' : 'bg-white border-ahg-accent/60 text-ahg-text hover:bg-ahg-bg'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}
