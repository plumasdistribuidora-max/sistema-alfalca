import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import AvatarClaudia from './AvatarClaudia';

// Claudia, la asistente de los dueños: un botón redondo abajo a la derecha que abre el chat encima de
// cualquier pantalla. La charla vive mientras se navega (está en el Layout) y se pierde al
// recargar. Las respuestas las arma Claude consultando la base (backend/services/asistente.js).


const fmtPesos = n => `$ ${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
// "Martín (Admin)" → "Martín".
const primerNombre = nombre => String(nombre || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || '';
const fmtUSD = n => `US$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Claude responde con **negrita** y renglones con guion; no hace falta un lector de markdown.
function Texto({ texto }) {
  const negrita = linea => linea.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p);
  return texto.split('\n').map((l, i) => {
    if (!l.trim()) return <div key={i} className="h-2" />;
    const item = l.match(/^\s*[-•*]\s+(.*)$/);
    return item
      ? <div key={i} className="flex gap-1.5 pl-1"><span className="text-ahg-text/40">•</span><span>{negrita(item[1])}</span></div>
      : <div key={i}>{negrita(l)}</div>;
  });
}

function Consultas({ consultas }) {
  const [abierto, setAbierto] = useState(false);
  if (!consultas?.length) return null;
  return (
    <div className="mt-2 pt-2 border-t border-ahg-accent/30">
      <button onClick={() => setAbierto(v => !v)} className="text-xs text-ahg-text/50 hover:text-ahg-text">
        {abierto ? 'Ocultar cómo lo calculé' : `Ver cómo lo calculé (${consultas.length} ${consultas.length === 1 ? 'consulta' : 'consultas'})`}
      </button>
      {abierto && (
        <ol className="mt-2 space-y-2">
          {consultas.map((c, i) => (
            <li key={i} className="text-xs">
              <p className="text-ahg-text/70">{i + 1}. {c.para_que || 'Consulta'}{c.error ? ' — dio error y la corrigió' : ''}</p>
              <pre className="mt-1 p-2 bg-ahg-bg rounded-lg overflow-x-auto whitespace-pre-wrap text-[11px] text-ahg-text/70">{c.sql}</pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Lo gastado de los créditos de Claude: el total siempre a la vista y, al tocarlo, quién lo gastó.
function Gasto({ gasto }) {
  const [abierto, setAbierto] = useState(false);
  if (!gasto) return null;
  return (
    <div className="px-3 pb-2 bg-white text-[11px] text-ahg-text/50">
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-baseline gap-2 text-left hover:text-ahg-text">
        <span className="flex-1">
          Gastado en total: <strong className="font-semibold text-ahg-text/70 whitespace-nowrap">{fmtUSD(gasto.costo_usd)}</strong>
          <span className="whitespace-nowrap"> · {gasto.preguntas} {gasto.preguntas === 1 ? 'pregunta' : 'preguntas'}</span>
          <span className="whitespace-nowrap"> · este mes {fmtUSD(gasto.costo_mes)}</span>
        </span>
        {gasto.por_persona.length > 0 && <span className="underline whitespace-nowrap">{abierto ? 'Ocultar' : 'Quién gastó'}</span>}
      </button>
      {abierto && (
        <ul className="mt-1.5 space-y-0.5">
          {gasto.por_persona.map(p => (
            <li key={p.nombre} className="flex gap-2">
              <span className="flex-1">{p.nombre}</span>
              <span>{p.preguntas} {p.preguntas === 1 ? 'pregunta' : 'preguntas'}</span>
              <span className="w-20 text-right font-medium text-ahg-text/70">{fmtUSD(p.costo_usd)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Los botones para bajar la respuesta en Excel o PDF. El archivo lo arma el sistema con la
// tabla que pasó Claudia; se pide con el token, por eso no es un link común.
function Descargas({ id }) {
  const [bajando, setBajando] = useState(null);
  const [error, setError] = useState('');
  async function bajar(tipo) {
    setBajando(tipo);
    setError('');
    try {
      const r = await api.get(`/asistente/preguntas/${id}/${tipo}`, { responseType: 'blob' });
      const nombre = decodeURIComponent((r.headers['content-disposition'] || '').match(/filename\*=UTF-8''([^;]+)/)?.[1] || `Claudia.${tipo === 'excel' ? 'xlsx' : 'pdf'}`);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError('No se pudo bajar. Probá de nuevo.');
    } finally {
      setBajando(null);
    }
  }
  const boton = 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-ahg-accent/60 text-ahg-text hover:border-ahg-primary/60 disabled:opacity-50';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button onClick={() => bajar('excel')} disabled={!!bajando} className={boton}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
        {bajando === 'excel' ? 'Armando…' : 'Descargar Excel'}
      </button>
      <button onClick={() => bajar('pdf')} disabled={!!bajando} className={boton}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
        {bajando === 'pdf' ? 'Armando…' : 'Descargar PDF'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export default function AsistenteChat() {
  const { user } = useAuth();
  const [abierto, setAbierto]     = useState(false);
  const [mensajes, setMensajes]   = useState([]);   // { rol, texto, consultas?, error? }
  const [pregunta, setPregunta]   = useState('');
  const [pensando, setPensando]   = useState(false);
  const [segundos, setSegundos]   = useState(0);
  const [gasto, setGasto]         = useState(null);
  const [charlaId, setCharlaId]   = useState(null); // la charla abierta, para guardarla junta
  const [vista, setVista]         = useState('chat'); // 'chat' | 'charlas'
  const [charlas, setCharlas]     = useState(null);
  const finRef   = useRef(null);
  const inputRef = useRef(null);

  const leerGasto = () => api.get('/asistente/gasto').then(r => setGasto(r.data.data)).catch(() => {});

  useEffect(() => {
    if (!abierto) return;
    leerGasto();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [abierto]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, pensando]);

  useEffect(() => {
    if (!pensando) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [pensando]);

  function nuevaCharla() {
    setMensajes([]);
    setCharlaId(null);
    setVista('chat');
  }

  function verCharlas() {
    setVista('charlas');
    setCharlas(null);
    api.get('/asistente/charlas').then(r => setCharlas(r.data.data)).catch(() => setCharlas([]));
  }

  // Vuelve a abrir una charla guardada; lo que se pregunte después se suma a la misma.
  async function abrirCharla(id) {
    try {
      const r = await api.get(`/asistente/charlas/${encodeURIComponent(id)}`);
      setMensajes(r.data.data.flatMap(p => [
        { rol: 'usuario', texto: p.pregunta },
        p.respuesta
          ? { rol: 'asistente', texto: p.respuesta, consultas: p.consultas, id: p.con_tabla ? p.id : null }
          : { rol: 'asistente', error: true, texto: p.error || 'No se pudo responder.' },
      ]));
      setCharlaId(id);
      setVista('chat');
    } catch {
      setCharlas(cs => cs?.filter(c => c.id !== id));
    }
  }

  async function enviar(texto) {
    const q = (texto ?? pregunta).trim();
    if (!q || pensando) return;
    // Al historial van solo las respuestas buenas, para que Claude tenga el contexto de la charla.
    const historial = mensajes.filter(m => !m.error).map(m => ({ rol: m.rol, texto: m.texto }));
    const id = charlaId || (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
    setCharlaId(id);
    setMensajes(ms => [...ms, { rol: 'usuario', texto: q }]);
    setPregunta('');
    setPensando(true);
    try {
      const r = await api.post('/asistente/preguntar', { pregunta: q, historial, charla: id });
      const d = r.data.data;
      setMensajes(ms => [...ms, { rol: 'asistente', texto: d.respuesta, consultas: d.consultas, id: d.con_tabla ? d.id : null }]);
    } catch (err) {
      setMensajes(ms => [...ms, { rol: 'asistente', error: true, texto: err.response?.data?.error || 'No se pudo responder. Probá de nuevo.' }]);
    } finally {
      setPensando(false);
      leerGasto();
    }
  }

  return (
    <>
      {abierto && (
        <div className="fixed z-40 inset-0 sm:inset-auto sm:right-6 sm:bottom-24 sm:w-[420px] sm:h-[min(640px,calc(100vh-8rem))] bg-white sm:rounded-2xl sm:border border-ahg-accent/40 sm:shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-ahg-primary text-white">
            <AvatarClaudia tamano={32} pensando={pensando} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Claudia</p>
              <p className="text-[11px] text-white/60 truncate">{pensando ? 'Buscando en los datos…' : 'Tu asistente con los datos del sistema'}</p>
            </div>
            {!pensando && (vista === 'charlas' || mensajes.length > 0) && (
              <button onClick={nuevaCharla} className="shrink-0 whitespace-nowrap text-xs text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">Nueva charla</button>
            )}
            {!pensando && vista === 'chat' && (
              <button onClick={verCharlas} className="shrink-0 whitespace-nowrap text-xs text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">Mis charlas</button>
            )}
            <button onClick={() => setAbierto(false)} aria-label="Cerrar a Claudia" className="p-1.5 rounded-lg hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          {vista === 'charlas' ? (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-ahg-bg/40">
              <p className="text-xs text-ahg-text/50">Tus charlas con Claudia, de la más nueva a la más vieja. Tocá una para leerla o seguirla.</p>
              {charlas === null && <p className="text-sm text-ahg-text/50">Cargando…</p>}
              {charlas?.length === 0 && <p className="text-sm text-ahg-text/50">Todavía no hay charlas guardadas.</p>}
              {charlas?.map(c => (
                <button key={c.id} onClick={() => abrirCharla(c.id)}
                  className="block w-full text-left px-3 py-2 rounded-xl bg-white border border-ahg-accent/40 hover:border-ahg-primary/50">
                  <p className="text-sm text-ahg-text line-clamp-2">{c.titulo}</p>
                  <p className="mt-0.5 text-[11px] text-ahg-text/50">
                    {new Date(c.ultima).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{c.preguntas} {c.preguntas === 1 ? 'pregunta' : 'preguntas'}
                  </p>
                </button>
              ))}
            </div>
          ) : (<>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-ahg-bg/40">
            {mensajes.length === 0 && (
              <div className="flex justify-center pt-2 pb-1"><AvatarClaudia tamano={112} grande /></div>
            )}
            {mensajes.length === 0 && (
              <div className="max-w-[92%] px-3 py-2 rounded-2xl rounded-bl-md bg-white text-ahg-text border border-ahg-accent/40 text-sm leading-relaxed">
                <p>Hola{primerNombre(user?.nombre) ? ` ${primerNombre(user.nombre)}` : ''}, soy Claudia, tu asistente. ¿En qué querés que te ayude hoy?</p>
                {gasto && (
                  <p className="mt-1.5 text-ahg-text/60">
                    Nos quedan <strong className="font-semibold text-ahg-text">{fmtUSD(gasto.quedan_usd)}</strong> en créditos este mes
                    {gasto.quedan_pesos != null && <> (unos {fmtPesos(gasto.quedan_pesos)})</>}.
                  </p>
                )}
              </div>
            )}
            {mensajes.map((m, i) => m.rol === 'usuario' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-ahg-primary text-white text-sm whitespace-pre-wrap">{m.texto}</div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className={`max-w-[92%] px-3 py-2 rounded-2xl rounded-bl-md text-sm leading-relaxed ${m.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-ahg-text border border-ahg-accent/40'}`}>
                  <Texto texto={m.texto} />
                  {m.id && <Descargas id={m.id} />}
                  <Consultas consultas={m.consultas} />
                </div>
              </div>
            ))}
            {pensando && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white border border-ahg-accent/40 text-sm text-ahg-text/60">
                  Buscando en los datos… {segundos > 3 && <span className="text-ahg-text/40">{segundos} s</span>}
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); enviar(); }} className="flex gap-2 p-3 border-t border-ahg-accent/30 bg-white">
            <textarea
              ref={inputRef}
              rows={1}
              value={pregunta}
              onChange={e => setPregunta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Escribí tu pregunta"
              className="flex-1 resize-none text-sm px-3 py-2 rounded-xl border border-ahg-accent/50 focus:outline-none focus:border-ahg-primary"
            />
            <button type="submit" disabled={pensando || !pregunta.trim()} aria-label="Enviar pregunta"
              className="w-10 rounded-xl bg-ahg-primary text-white flex items-center justify-center hover:bg-ahg-secondary disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </form>
          </>)}
          <Gasto gasto={gasto} />
        </div>
      )}

      <button
        onClick={() => setAbierto(v => !v)}
        aria-label={abierto ? 'Cerrar a Claudia' : 'Hablar con Claudia'}
        className={`fixed z-40 right-5 bottom-5 sm:right-6 sm:bottom-6 w-14 h-14 rounded-full bg-ahg-primary text-white shadow-lg ring-1 ring-white/20 hover:scale-105 flex items-center justify-center overflow-hidden transition-transform ${abierto ? 'hidden sm:flex' : 'flex'}`}
      >
        {abierto ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <AvatarClaudia tamano={56} pensando={pensando} />
        )}
      </button>
    </>
  );
}
