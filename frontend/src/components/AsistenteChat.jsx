import { useEffect, useRef, useState } from 'react';
import api from '../api';

// El asistente de los dueños: un botón redondo abajo a la derecha que abre el chat encima de
// cualquier pantalla. La charla vive mientras se navega (está en el Layout) y se pierde al
// recargar. Las respuestas las arma Claude consultando la base (backend/services/asistente.js).

const SUGERIDAS = [
  '¿Cuántos doypacks se venden por semana en cada local?',
  '¿Cuántas docenas vendió el grupo el mes pasado contra el mismo mes del año pasado?',
  '¿Cuál es la hora del día que más vende cada tienda?',
  '¿Cuánto vendió Kankay este mes y cuánto fue sin factura?',
];

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

export default function AsistenteChat() {
  const [abierto, setAbierto]     = useState(false);
  const [mensajes, setMensajes]   = useState([]);   // { rol, texto, consultas?, error? }
  const [pregunta, setPregunta]   = useState('');
  const [pensando, setPensando]   = useState(false);
  const [segundos, setSegundos]   = useState(0);
  const [gasto, setGasto]         = useState(null);
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

  async function enviar(texto) {
    const q = (texto ?? pregunta).trim();
    if (!q || pensando) return;
    // Al historial van solo las respuestas buenas, para que Claude tenga el contexto de la charla.
    const historial = mensajes.filter(m => !m.error).map(m => ({ rol: m.rol, texto: m.texto }));
    setMensajes(ms => [...ms, { rol: 'usuario', texto: q }]);
    setPregunta('');
    setPensando(true);
    try {
      const r = await api.post('/asistente/preguntar', { pregunta: q, historial });
      const d = r.data.data;
      setMensajes(ms => [...ms, { rol: 'asistente', texto: d.respuesta, consultas: d.consultas }]);
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
          <div className="flex items-center gap-3 px-4 py-3 bg-ahg-primary text-white">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Asistente</p>
              <p className="text-[11px] text-white/60">Responde con los datos del sistema</p>
            </div>
            {mensajes.length > 0 && !pensando && (
              <button onClick={() => setMensajes([])} className="text-xs text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">Nueva charla</button>
            )}
            <button onClick={() => setAbierto(false)} aria-label="Cerrar asistente" className="p-1.5 rounded-lg hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-ahg-bg/40">
            {mensajes.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-ahg-text/70">Preguntá lo que quieras del negocio: ventas, docenas, horarios, compras, Kankay, Senzen. Busco la respuesta en los datos del sistema.</p>
                {SUGERIDAS.map(s => (
                  <button key={s} onClick={() => enviar(s)} className="block w-full text-left text-sm px-3 py-2 rounded-xl bg-white border border-ahg-accent/40 hover:border-ahg-primary/50 text-ahg-text">
                    {s}
                  </button>
                ))}
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
          <Gasto gasto={gasto} />
        </div>
      )}

      <button
        onClick={() => setAbierto(v => !v)}
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente'}
        className={`fixed z-40 right-5 bottom-5 sm:right-6 sm:bottom-6 w-14 h-14 rounded-full bg-ahg-primary text-white shadow-lg hover:bg-ahg-secondary flex items-center justify-center transition-colors ${abierto ? 'hidden sm:flex' : 'flex'}`}
      >
        {abierto ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6l2.5-3H18a3 3 0 003-3V7a3 3 0 00-3-3H6a3 3 0 00-3 3v7a3 3 0 003 3" /></svg>
        )}
      </button>
    </>
  );
}
