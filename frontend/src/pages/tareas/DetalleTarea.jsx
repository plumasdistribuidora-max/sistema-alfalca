import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import { comprimir } from '../../utils/fotos';
import DetalleReporte from '../reportes/DetalleReporte';
import {
  pesos, ddmm, diaCorto, diaLargo, cuando, duracion, hoyStr, PuntoLocal, ChipTipo, Chip, EstadoTarea,
  useOpciones, Adjunto, Cargando, MensajeError, TextoConIdeas,
} from './comunes';

function sumarDias(f, n) {
  const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Las fotos se achican antes de subir; los PDF van como están.
async function preparar(file) {
  if (!file) return null;
  return /^image\//.test(file.type) ? comprimir(file) : file;
}

async function enviar(url, campos, archivo) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null && v !== '') fd.append(k, v);
  const f = await preparar(archivo);
  if (f) fd.append('foto', f);
  return api.post(url, fd);
}

function Dato({ label, valor, tono }) {
  return (
    <div className="bg-ahg-bg rounded-lg px-3 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-ahg-text/50 font-semibold">{label}</p>
      <p className={`font-bold truncate ${tono || 'text-ahg-text'}`} style={{ fontFamily: 'Nunito, sans-serif', fontSize: 17 }}>{valor}</p>
    </div>
  );
}

// Lo que levantó la alerta, según el tipo.
function DatosDelProblema({ t }) {
  const d = t.detalle || {};
  if (t.tipo === 'ventas') return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Dato label="Dijeron los turnos" valor={pesos(d.reportado)} />
        <Dato label="Dice Fudo" valor={pesos(d.fudo)} />
        <Dato label="Diferencia" valor={pesos(Math.abs(d.diferencia))} tono="text-red-700" />
      </div>
      {d.turnos?.length > 0 && (
        <p className="text-xs text-ahg-text/60 mt-2">
          {d.turnos.map(x => `${x.turno}: ${x.usuario} dijo ${pesos(x.ventas)}`).join(' · ')}
        </p>
      )}
      {d.causa_conocida && <p className="text-xs text-ahg-text/60 mt-1">Este local tiene una causa conocida aprobada: <b>{d.causa_conocida}</b>.</p>}
    </>
  );
  if (t.tipo === 'no_cargo') return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Dato label="Reporte" valor={`${d.plantilla_nombre || ''} · ${d.turno || ''}`} />
      <Dato label="Ventas del local en Fudo" valor={pesos(d.ventas_fudo)} />
      <Dato label="Tickets" valor={d.tickets_fudo ?? '—'} />
    </div>
  );
  if (t.tipo === 'vencimiento') return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Dato label="Producto" valor={d.producto} />
      <Dato label="Cantidad" valor={d.cantidad ?? '—'} />
      <Dato label="Vence" valor={ddmm(d.vence)} tono={d.dias <= 3 ? 'text-red-700' : undefined} />
    </div>
  );
  if (t.tipo === 'mantenimiento') return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Dato label="Rubro" valor={d.rubro || '—'} />
      <Dato label="Desde" valor={ddmm(d.desde)} />
      <Dato label="Lo reportó" valor={d.reportado_por || '—'} />
    </div>
  );
  if (t.tipo === 'cafe') return (
    <div className="grid grid-cols-3 gap-2">
      <Dato label="Pesaje" valor={`${d.real} kg`} />
      <Dato label="Lo vendido" valor={`${d.teorico} kg`} />
      <Dato label="Diferencia" valor={`${d.diferencia} kg`} tono="text-red-700" />
    </div>
  );
  if (t.tipo === 'encargo') return (
    <>
      {d.texto && <p className="text-sm whitespace-pre-line">{d.texto}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
        <Dato label="La pidió" valor={d.pedido_por || '—'} />
        <Dato label="Para cuándo" valor={d.para_cuando ? ddmm(d.para_cuando) : 'Sin fecha'} />
      </div>
    </>
  );
  if (Array.isArray(d.items)) return (
    <ul className="text-sm space-y-1">
      {d.items.map((it, i) => (
        <li key={i} className="bg-ahg-bg rounded-lg px-3 py-2">
          {Object.entries(it).filter(([k]) => !['local'].includes(k)).map(([k, v]) => v ? <span key={k} className="mr-3"><span className="text-ahg-text/50">{k}:</span> {String(v)}</span> : null)}
        </li>
      ))}
    </ul>
  );
  return null;
}

// ── La conversación ──────────────────────────────────────────────────────────
// Todo lo que pasó en la tarea, como un chat (Martín, 15/10/2026): cada mensaje dice
// quién lo escribió y si es el encargado o un dueño. Los dueños van en amarillo, el
// encargado en gris y lo del sistema al medio. Lo propio va a la derecha.

// La marca chica debajo del texto: qué cambió con ese mensaje.
function marcaDe(e, gastos) {
  const d = e.datos || {};
  switch (e.tipo) {
    case 'tomada': return { tono: 'azul', txt: `La tomó${d.plazo ? ` · para el ${diaCorto(d.plazo)}` : ''}` };
    case 'plazo': return { tono: 'ambar', txt: `Cambió la fecha${d.antes ? `: ${ddmm(d.antes)} → ${ddmm(d.despues)}` : ''}` };
    case 'gasto': {
      const g = gastos.find(x => x.id === d.gasto_id);
      const estado = g ? { aprobado_solo: 'aprobado solo', pendiente: 'espera a los dueños', aprobado: 'aprobado', rechazado: 'no aprobado' }[g.estado] : '';
      return { tono: 'azul', txt: `Gasto ${pesos(d.monto ?? g?.monto)}${d.rol ? ` · ${d.rol}` : ''}${estado ? ` · ${estado}` : ''}` };
    }
    case 'comprobante': return { tono: 'azul', txt: 'Subió el comprobante' };
    case 'gasto_aprobado': return { tono: 'verde', txt: 'Aprobó el gasto' };
    case 'gasto_rechazado': return { tono: 'rojo', txt: 'Gasto no aprobado' };
    case 'pidio_cierre': return d.descarte ? { tono: 'ambar', txt: 'Pide descartarla' } : { tono: 'verde', txt: `Pidió el cierre${d.monto ? ` · ${pesos(d.monto)}` : ''}` };
    case 'aprobada': return { tono: 'verde', txt: 'Aprobada' };
    case 'pidio_mas': return { tono: 'rojo', txt: 'Pide más' };
    case 'rechazada': return { tono: 'rojo', txt: 'No la aprobó' };
    case 'encargo': return { tono: 'gris', txt: 'Cargó la tarea' };
    default: return null;
  }
}

// Lo que se lee en la burbuja. Los mensajes viejos traían el texto armado ("Va a hacer:
// …", "Cambió la fecha: … Motivo: …"); los nuevos traen solo lo que escribió la persona.
function textoDe(e) {
  const d = e.datos || {};
  if (e.tipo === 'plazo' && d.motivo) return d.motivo;
  if (e.tipo === 'tomada' && d.accion && /^Va a hacer:/.test(e.texto || '')) return d.accion;
  return e.texto;
}

// Las fotos del gasto cuelgan del gasto, no del mensaje: se muestran en el mensaje
// donde se subieron (el del gasto o el del comprobante).
function adjuntosDe(e, gastos) {
  const d = e.datos || {};
  const propios = e.adjuntos || [];
  if (!['gasto', 'comprobante'].includes(e.tipo) || !d.gasto_id) return propios;
  const g = gastos.find(x => x.id === d.gasto_id);
  if (!g) return propios;
  const t0 = new Date(e.created_at).getTime();
  const cerca = g.adjuntos.filter(a => Math.abs(new Date(a.created_at).getTime() - t0) < 120000
    && (e.tipo === 'comprobante' ? a.rol === 'comprobante' : a.rol !== 'comprobante' || d.rol === 'comprobante'));
  return [...propios, ...cerca];
}

// Un mensaje del cuadro único deja varios eventos (por ejemplo, fecha nueva y gasto):
// comparten "grupo" y se muestran como una sola burbuja.
function agrupar(eventos) {
  const out = [];
  for (const e of eventos) {
    const prev = out[out.length - 1];
    if (prev && e.datos?.grupo && prev.grupo === e.datos.grupo && prev.usuario === e.usuario) prev.eventos.push(e);
    else out.push({ grupo: e.datos?.grupo, usuario: e.usuario, rol: e.usuario_rol, created_at: e.created_at, eventos: [e] });
  }
  return out;
}

function Conversacion({ data, yo }) {
  const { eventos, gastos, tarea: t } = data;
  const grupos = agrupar(eventos);
  return (
    <div className="space-y-2.5">
      {grupos.map(g => {
        const primero = g.eventos[0];
        const sistema = !g.usuario;
        if (sistema) {
          return (
            <div key={primero.id} className="text-center text-xs text-ahg-text/55 px-6">
              <span className="font-semibold">{cuando(primero.created_at)}</span> · {primero.tipo === 'creada' ? 'El sistema levantó la alerta. ' : ''}{primero.texto}
            </div>
          );
        }
        const duenio = g.rol === 'admin';
        const mio = g.usuario === yo;
        const textos = [...new Set(g.eventos.map(textoDe).filter(Boolean))];
        const marcas = g.eventos.map(e => marcaDe(e, gastos)).filter(Boolean);
        const adjuntos = g.eventos.flatMap(e => adjuntosDe(e, gastos));
        return (
          <div key={primero.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 space-y-1 border ${duenio ? 'bg-amber-50 border-amber-200' : 'bg-stone-100 border-stone-200'}`}>
              <p className="text-[11px] text-ahg-text/60">
                <b className="text-ahg-text">{g.usuario}</b>
                <span className={`ml-1.5 px-1.5 py-px rounded-full text-[10px] font-semibold ${duenio ? 'bg-amber-200/70 text-amber-900' : 'bg-stone-300/70 text-stone-700'}`}>{duenio ? 'Dueño' : 'Encargado'}</span>
                <span className="ml-1.5">{cuando(g.created_at)}</span>
              </p>
              {textos.map((x, i) => <p key={i} className="text-sm whitespace-pre-line break-words">{x}</p>)}
              {marcas.length > 0 && <div className="flex flex-wrap gap-1">{marcas.map((m, i) => <Chip key={i} tono={m.tono}>{m.txt}</Chip>)}</div>}
              {adjuntos.length > 0 && <div className="flex gap-2 flex-wrap pt-0.5">{adjuntos.map(a => <Adjunto key={a.id} a={a} />)}</div>}
            </div>
          </div>
        );
      })}
      {t.dias_vencida > 0 && t.estado === 'en_curso' && (
        <p className="text-center text-xs font-semibold text-red-700">Se venció la fecha hace {t.dias_vencida} día{t.dias_vencida === 1 ? '' : 's'} ({diaCorto(t.plazo)}).</p>
      )}
    </div>
  );
}

function Archivo({ id, archivo, setArchivo, texto = 'Sumar foto', aceptaPdf }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border border-ahg-accent/60 bg-white cursor-pointer hover:bg-ahg-bg">
      📷 {archivo ? archivo.name.slice(0, 24) : texto}
      <input id={id} type="file" className="hidden" accept={aceptaPdf ? 'image/*,application/pdf' : 'image/*'}
             onChange={e => setArchivo(e.target.files?.[0] || null)} />
    </label>
  );
}

function Extra({ activo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
            className={`text-sm px-3 py-1.5 rounded-full border ${activo ? 'border-ahg-primary bg-ahg-bg font-medium' : 'border-dashed border-ahg-accent bg-white hover:bg-ahg-bg'}`}>
      {children}
    </button>
  );
}

const etiq = 'text-xs text-ahg-text/60 grid gap-1';
const soloNumero = v => { const x = String(v).replace(/\D/g, ''); return x ? Number(x).toLocaleString('es-AR') : ''; };
const aNumero = v => Number(String(v).replace(/\D/g, '')) || 0;

// ── El cuadro del encargado ──────────────────────────────────────────────────
// Uno solo: escribe cómo viene y le suma, si hace falta, una fecha nueva, un gasto o una
// foto. "Terminé" manda lo escrito como cierre; "No hay nada que hacer" pide descartarla.
function CuadroEncargado({ data, opcionesGen, onCambio }) {
  const { tarea: t, opciones, gastos, personas } = data;
  const nueva = t.estado === 'nueva';
  const [texto, setTexto] = useState('');
  const [plazo, setPlazo] = useState(t.detalle?.para_cuando || sumarDias(hoyStr(), 2));
  const [conFecha, setConFecha] = useState(false);
  const [nuevoPlazo, setNuevoPlazo] = useState('');
  const [conGasto, setConGasto] = useState(false);
  const [gMonto, setGMonto] = useState('');
  const [gRol, setGRol] = useState('presupuesto');
  const [conFoto, setConFoto] = useState(false);
  const [foto, setFoto] = useState(null);
  const [modo, setModo] = useState('');        // '' | 'cierre' | 'descarte'
  const [monto, setMonto] = useState('');
  const [afectado, setAfectado] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const tope = opcionesGen?.tope_gasto || 100000;
  const montoGasto = aNumero(gMonto);
  const sinComprobante = gastos.filter(g => ['aprobado_solo', 'aprobado'].includes(g.estado) && !g.con_comprobante);
  const conMonto = (opciones.con_monto || []).length > 0;

  function limpiar() {
    setTexto(''); setConFecha(false); setNuevoPlazo(''); setConGasto(false); setGMonto(''); setGRol('presupuesto');
    setConFoto(false); setFoto(null); setModo(''); setMonto(''); setAfectado('');
  }

  async function mandar(cerrar) {
    setOcupado(true); setError('');
    try {
      if (modo === 'descarte') {
        await api.post(`/tareas/${t.id}/descartar`, { motivo: texto });
      } else {
        await enviar(`/tareas/${t.id}/mensaje`, {
          texto,
          plazo: nueva ? plazo : undefined,
          nuevo_plazo: conFecha ? nuevoPlazo : undefined,
          gasto_monto: conGasto ? montoGasto : undefined,
          gasto_rol: conGasto ? gRol : undefined,
          cerrar: cerrar ? '1' : undefined,
          monto: cerrar ? aNumero(monto) || undefined : undefined,
          afectado_usuario_id: cerrar ? afectado || undefined : undefined,
        }, (conFoto || conGasto) ? foto : null);
      }
      limpiar(); onCambio();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.data?.faltan?.join(' · ') || d?.error || err.message || 'No se pudo guardar');
    } finally { setOcupado(false); }
  }

  const etiqueta = modo === 'cierre' ? '¿Qué era y cómo se resolvió?'
    : modo === 'descarte' ? '¿Por qué no hay nada que hacer?'
    : nueva ? '¿Qué vas a hacer?' : 'Escribí cómo viene';
  const ejemplo = modo === 'cierre' ? 'Ej.: parlante nuevo instalado y probado con el celular de la tienda'
    : modo === 'descarte' ? 'Ej.: ya lo había arreglado el dueño del local el sábado'
    : nueva ? 'Ej.: compro uno en la casa de electrónica y lo instalo yo' : 'Ej.: ya lo compré, lo instalo mañana a la mañana';
  const ideas = modo === 'cierre' ? opciones.resultados : modo === 'descarte' ? (opcionesGen?.motivos_descarte || []) : nueva ? opciones.acciones : [];

  return (
    <div className="space-y-3">
      {sinComprobante.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-red-800">Falta el comprobante de pago. Sin eso la tarea no se puede cerrar.</p>
          {sinComprobante.map(g => <SubirComprobante key={g.id} g={g} onCambio={onCambio} />)}
        </div>
      )}

      {modo && (
        <div className={`rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-2 ${modo === 'cierre' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          <span>{modo === 'cierre' ? 'Vas a pedir el cierre. Lo aprueba un dueño.' : 'Vas a pedir descartarla. También lo aprueba un dueño.'}</span>
          <button type="button" className="underline text-xs" onClick={() => setModo('')}>Volver</button>
        </div>
      )}

      <TextoConIdeas id="cuadro" label={etiqueta} valor={texto} onChange={setTexto} ideas={ideas} placeholder={ejemplo} rows={3} max={1000} />

      {nueva && !modo && (
        <label className={etiq}>¿Para cuándo?
          <input id="cuadro-plazo" type="date" className="input !py-1.5 w-44" value={plazo} min={hoyStr()} onChange={e => setPlazo(e.target.value)} />
        </label>
      )}

      {modo === 'cierre' && (conMonto || opciones.pide_afectado) && (
        <div className="flex flex-wrap gap-3">
          {conMonto && (
            <label className={etiq}>Monto (si corresponde)
              <input id="cuadro-monto" className="input !py-1.5 w-36" inputMode="numeric" value={monto} onChange={e => setMonto(soloNumero(e.target.value))} placeholder="$" />
            </label>
          )}
          {opciones.pide_afectado && (
            <label className={etiq}>¿De quién fue?
              <select id="cuadro-afectado" className="input !py-1.5" value={afectado} onChange={e => setAfectado(e.target.value)}>
                <option value="">No corresponde a nadie</option>
                {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {modo !== 'descarte' && (
        <div className="flex flex-wrap gap-2">
          {!nueva && modo !== 'cierre' && <Extra activo={conFecha} onClick={() => setConFecha(v => !v)}>Cambiar la fecha</Extra>}
          <Extra activo={conGasto} onClick={() => setConGasto(v => !v)}>Hay un gasto</Extra>
          {!conGasto && <Extra activo={conFoto} onClick={() => setConFoto(v => !v)}>Sumar foto</Extra>}
        </div>
      )}

      {conFecha && !nueva && modo !== 'cierre' && modo !== 'descarte' && (
        <div className="rounded-xl bg-ahg-bg p-3 flex flex-wrap gap-3 items-end">
          <label className={etiq}>Fecha nueva
            <input id="cuadro-nueva-fecha" type="date" className="input !py-1.5" value={nuevoPlazo} min={hoyStr()} onChange={e => setNuevoPlazo(e.target.value)} />
          </label>
          <p className="text-xs text-ahg-text/55 flex-1 min-w-[180px]">Hoy es para el {diaCorto(t.plazo)}. Escribí arriba por qué cambia: queda contado y los dueños lo ven.</p>
        </div>
      )}

      {conGasto && modo !== 'descarte' && (
        <div className="rounded-xl bg-ahg-bg p-3 space-y-2">
          <div className="flex flex-wrap gap-3 items-end">
            <label className={etiq}>Monto
              <input id="cuadro-gasto" className="input !py-1.5 w-36" inputMode="numeric" value={gMonto} onChange={e => setGMonto(soloNumero(e.target.value))} placeholder="$" />
            </label>
            <label className={etiq}>La foto es
              <select id="cuadro-gasto-rol" className="input !py-1.5" value={gRol} onChange={e => setGRol(e.target.value)}>
                <option value="presupuesto">Presupuesto</option>
                <option value="comprobante">Comprobante de pago</option>
              </select>
            </label>
            <Archivo id="cuadro-gasto-foto" archivo={foto} setArchivo={setFoto} aceptaPdf texto="Foto o PDF" />
          </div>
          <p className="text-xs text-ahg-text/60">
            Sale de la caja chica. Lo que escribiste arriba es el detalle del gasto.{' '}
            {montoGasto > 0 && (montoGasto < tope
              ? <><Chip tono="verde">Aprobado solo</Chip> Después subí el comprobante: sin eso no se cierra.</>
              : <><Chip tono="ambar">Va a los dueños</Chip> Pasa los {pesos(tope)}: no se gasta hasta que lo aprueben.</>)}
          </p>
        </div>
      )}

      {conFoto && !conGasto && modo !== 'descarte' && (
        <div className="rounded-xl bg-ahg-bg p-3"><Archivo id="cuadro-foto" archivo={foto} setArchivo={setFoto} /></div>
      )}

      {error && <p className="text-sm text-red-700 font-medium">{error}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        {modo === 'cierre' && (
          <button className="btn-primary" disabled={ocupado || texto.trim().length < 3} onClick={() => mandar(true)}>
            {ocupado ? 'Enviando…' : 'Pedir el cierre a los dueños'}
          </button>
        )}
        {modo === 'descarte' && (
          <button className="btn-primary" disabled={ocupado || texto.trim().length < 3} onClick={() => mandar(false)}>
            {ocupado ? 'Enviando…' : 'Pedir descartarla'}
          </button>
        )}
        {!modo && (
          <>
            <button className="btn-primary" disabled={ocupado || texto.trim().length < 3} onClick={() => mandar(false)}>
              {ocupado ? 'Guardando…' : nueva ? 'Tomar la tarea' : 'Mandar'}
            </button>
            {!nueva && <button className="btn-secondary" disabled={ocupado} onClick={() => { setModo('cierre'); setConFecha(false); }}>Terminé, pedir el cierre</button>}
          </>
        )}
        {!modo && <button type="button" className="ml-auto text-xs underline text-ahg-text/55" onClick={() => setModo('descarte')}>No hay nada que hacer</button>}
      </div>
      <p className="text-xs text-ahg-text/50">Lo que mandes les llega en un aviso a los cuatro dueños y al encargado.</p>
    </div>
  );
}

// Para los dueños, y para el encargado cuando la tarea espera a los dueños o ya se
// terminó: un cuadro para escribir. También avisa a todos.
function CuadroComentar({ id, onCambio, ayuda }) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function mandar() {
    setOcupado(true); setError('');
    try { await api.post(`/tareas/${id}/comentar`, { texto }); setTexto(''); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo mandar'); }
    finally { setOcupado(false); }
  }
  return (
    <div className="space-y-2">
      {ayuda && <p className="text-sm text-ahg-text/70">{ayuda}</p>}
      <label htmlFor="comentar" className="text-xs text-ahg-text/60">Escribí lo que quieras</label>
      <textarea id="comentar" className="input w-full" rows={2} maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Lo ven todos y les llega el aviso" />
      <button className="btn-primary" disabled={ocupado || !texto.trim()} onClick={mandar}>{ocupado ? 'Mandando…' : 'Mandar'}</button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function SubirComprobante({ g, onCambio }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <span className="text-sm flex-1 min-w-[160px]">{g.concepto} · {pesos(g.monto)}</span>
      <Archivo id={`comp-${g.id}`} archivo={f} setArchivo={setF} aceptaPdf texto="Foto del comprobante" />
      <button className="btn-primary !py-1.5" disabled={!f || ocupado}
              onClick={async () => { setOcupado(true); setError(''); try { await enviar(`/tareas/gastos/${g.id}/comprobante`, {}, f); onCambio(); } catch (err) { setError(err.response?.data?.error || 'No se pudo subir'); } finally { setOcupado(false); } }}>
        Subir
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}

// ── Lo que responde un dueño ─────────────────────────────────────────────────
function RespuestaDueno({ data, onCambio }) {
  const { tarea: t, causa } = data;
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState('');
  const puedeCausa = t.tipo === 'ventas' && t.cierre_tipo === 'resultado' && !(causa && causa.resultado === t.resultado);
  const [comoCausa, setComoCausa] = useState(t.resultado === 'Venta ficticia para nota de crédito');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const dif = Math.abs(Number(t.detalle?.diferencia) || 0);

  async function comentar() {
    setOcupado(true); setError('');
    try { await api.post(`/tareas/${t.id}/comentar`, { texto }); setTexto(''); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo mandar'); }
    finally { setOcupado(false); }
  }

  async function responder(accion) {
    setOcupado(true); setError('');
    try { await api.post(`/tareas/${t.id}/responder`, { accion, texto, causa_conocida: accion === 'aprobar' && puedeCausa && comoCausa }); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }

  return (
    <div className="card p-4 sm:p-5 border-2 border-amber-300 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-800">Para aprobar</p>
        <p className="text-base mt-1">
          {t.cierre_tipo === 'descarte' ? 'Pide descartarla: ' : 'El encargado dice: '}
          <b>{t.resultado}</b>{t.resultado_monto ? ` · ${pesos(t.resultado_monto)}` : ''}
        </p>
        {t.tipo === 'ventas' && t.resultado_monto != null && (
          <p className="text-sm mt-1">
            {Math.abs(t.resultado_monto - dif) < 1
              ? <Chip tono="verde">El monto coincide con la diferencia</Chip>
              : <Chip tono="rojo">El monto no coincide: la diferencia es {pesos(dif)}</Chip>}
          </p>
        )}
        {t.afectado_nombre && <p className="text-sm text-ahg-text/70 mt-1">Queda anotado en el historial de <b>{t.afectado_nombre}</b>.</p>}
        <p className="text-xs text-ahg-text/55 mt-1">
          Tardó {duracion(t.relojes.encargado_ms)} · {t.cambios_plazo} cambio{t.cambios_plazo === 1 ? '' : 's'} de fecha · esperando hace {duracion(t.relojes.duenos_ms)}
        </p>
      </div>
      {puedeCausa && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={comoCausa} onChange={e => setComoCausa(e.target.checked)} />
          <span>Aprobar como <b>causa conocida</b> de {t.local_corto}: las próximas con este resultado se aprueban solas, solo si el monto coincide con la diferencia.</span>
        </label>
      )}
      <textarea className="input" rows={2} value={texto} onChange={e => { setTexto(e.target.value); setModo(''); }} maxLength={1000}
                placeholder="Escribile lo que quieras. Para aprobar es opcional; para pedir algo o rechazar, escribí qué." />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={ocupado} onClick={() => responder('aprobar')}>Aprobar</button>
        <button className="btn-secondary" disabled={ocupado} onClick={() => texto.trim() ? responder('pedir') : setModo('pedir')}>Pedir foto o dato</button>
        <button className="btn-secondary" disabled={ocupado} onClick={() => texto.trim() ? responder('rechazar') : setModo('rechazar')}>No alcanza</button>
        <button className="text-sm underline text-ahg-text/60 ml-auto" disabled={ocupado} onClick={() => texto.trim() ? comentar() : setModo('comentar')}>Solo comentar</button>
      </div>
      {modo && !texto.trim() && <p className="text-sm text-amber-800">Escribí arriba {modo === 'pedir' ? 'qué le pedís (ej.: mandame la foto del arqueo)' : modo === 'comentar' ? 'lo que le querés decir' : 'por qué no alcanza'} y volvé a tocar el botón.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

// Otro dueño ya la rechazó o pidió más, pero quizás vos sabés algo que él no: la
// podés aprobar igual, aclarando por qué.
function AprobarIgual({ data, onCambio }) {
  const { tarea: t, aprobar_igual: a } = data;
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function aprobar() {
    setOcupado(true); setError('');
    try { await api.post(`/tareas/${t.id}/responder`, { accion: 'aprobar', texto }); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo aprobar'); }
    finally { setOcupado(false); }
  }
  return (
    <div className="card p-4 border-2 border-sky-200 space-y-2">
      <p className="text-sm">
        <b>{a.quien}</b> la {a.tipo === 'rechazada' ? 'rechazó' : 'devolvió pidiendo más'}. El encargado pedía cerrarla con: <b>{t.resultado}</b>{t.resultado_monto ? ` (${pesos(t.resultado_monto)})` : ''}.
      </p>
      <p className="text-xs text-ahg-text/60">Si sabés algo que {a.quien} no, la podés aprobar igual. Tenés que aclarar por qué: queda en el seguimiento y les llega a todos.</p>
      <textarea className="input" rows={2} maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej.: la nota de crédito ya la tengo yo, el monto está bien" />
      <button className="btn-primary" disabled={ocupado || !texto.trim()} onClick={aprobar}>{ocupado ? 'Aprobando…' : 'Aprobar igual'}</button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function GastoPendienteDueno({ g, onCambio }) {
  const [modo, setModo] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  async function responder(accion) {
    setError('');
    try { await api.post(`/tareas/gastos/${g.id}/responder`, { accion, texto }); onCambio(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }
  return (
    <div className="card p-4 border-2 border-sky-300 space-y-2">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-sky-800">Gasto para aprobar</p>
      <p className="text-base"><b>{g.concepto}</b> · {pesos(g.monto)}</p>
      <div className="flex gap-2 flex-wrap">{g.adjuntos.map(a => <Adjunto key={a.id} a={a} />)}</div>
      {modo && <textarea className="input" rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder={modo === 'otro' ? 'Opcional: qué querés que cambie' : 'Por qué no'} autoFocus />}
      <div className="flex flex-wrap gap-2">
        {!modo && <button className="btn-primary" onClick={() => responder('aprobar')}>Aprobar gasto</button>}
        {!modo && <button className="btn-secondary" onClick={() => setModo('otro')}>Pedir otro presupuesto</button>}
        {!modo && <button className="btn-secondary" onClick={() => setModo('rechazar')}>No</button>}
        {modo && <button className="btn-primary" onClick={() => responder(modo)}>{modo === 'otro' ? 'Pedir otro presupuesto' : 'Rechazar gasto'}</button>}
        {modo && <button className="btn-secondary" onClick={() => { setModo(''); setTexto(''); }}>Volver</button>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

const PASOS = ['Sin tomar', 'En curso', 'Por aprobar', 'Terminada'];
const PASO = { nueva: 0, en_curso: 1, por_aprobar: 2, terminada: 3 };

export default function DetalleTarea() {
  const { id } = useParams();
  const { user } = useAuth();
  const dueno = esDueno(user);
  const opcionesGen = useOpciones();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reporteAbierto, setReporteAbierto] = useState(null);

  function cargar() {
    api.get(`/tareas/${id}`).then(r => { setData(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la tarea'));
  }
  useEffect(cargar, [id]);

  if (error) return <MensajeError texto={error} />;
  if (!data || !opcionesGen) return <Cargando />;
  const t = data.tarea;
  const pendientesDueno = data.gastos.filter(g => g.estado === 'pendiente');
  const paso = PASO[t.estado] ?? 0;
  const rojo = t.estado === 'en_curso' && t.dias_vencida > 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/tareas" className="text-sm text-ahg-text/60 hover:text-ahg-text">← Tareas</Link>

      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <ChipTipo tipo={t.tipo} label={t.tipo_label} />
            <h1 className="text-lg font-bold mt-1.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{t.titulo}</h1>
            <p className="text-sm text-ahg-text/60 flex items-center gap-1.5 flex-wrap">
              {t.local_corto && <><PuntoLocal nombre={t.local_nombre} />{t.local_corto} ·</>} {diaLargo(t.fecha)}
              {t.tomada_por_nombre && <> · la tomó {t.tomada_por_nombre}</>}
            </p>
          </div>
          <EstadoTarea t={t} />
        </div>

        <div>
          <div className="flex gap-1">
            {PASOS.map((p, i) => (
              <div key={p} className={`flex-1 h-1.5 rounded-full ${i <= paso ? (rojo ? 'bg-red-500' : t.estado === 'terminada' ? 'bg-green-600' : 'bg-ahg-primary') : 'bg-ahg-accent/50'}`} />
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {PASOS.map((p, i) => <p key={p} className={`flex-1 text-[10px] ${i === paso ? 'text-ahg-text font-semibold' : 'text-ahg-text/40'}`}>{p}</p>)}
          </div>
        </div>

        <DatosDelProblema t={t} />

        <p className="text-xs text-ahg-text/60">
          En manos del encargado: <b>{duracion(t.relojes.encargado_ms)}</b>
          {t.relojes.duenos_ms > 0 && <> · esperando a los dueños: <b>{duracion(t.relojes.duenos_ms)}</b></>}
          {t.cambios_plazo > 0 && <> · {t.cambios_plazo} cambio{t.cambios_plazo === 1 ? '' : 's'} de fecha</>}
          {t.gastado > 0 && <> · gastado {pesos(t.gastado)}</>}
        </p>

        {data.reportes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="text-ahg-text/55">Reportes de ese día:</span>
            {data.reportes.map(r => (
              <button key={r.id} onClick={() => setReporteAbierto(r.id)} className="px-2.5 py-1 rounded-lg border border-ahg-accent/50 hover:bg-ahg-bg">
                {r.turno} · {r.usuario_nombre}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="bg-ahg-bg/60 p-4 sm:p-5">
          <Conversacion data={data} yo={user?.nombre} />
        </div>

        <div className="p-4 sm:p-5 border-t border-ahg-accent/40 space-y-4">
          {dueno && t.estado === 'por_aprobar' && <RespuestaDueno data={data} onCambio={cargar} />}
          {dueno && data.aprobar_igual && <AprobarIgual data={data} onCambio={cargar} />}
          {dueno && pendientesDueno.map(g => <GastoPendienteDueno key={g.id} g={g} onCambio={cargar} />)}

          {!dueno && ['nueva', 'en_curso'].includes(t.estado) && (
            <CuadroEncargado key={t.estado} data={data} opcionesGen={opcionesGen} onCambio={cargar} />
          )}
          {!dueno && t.estado === 'por_aprobar' && (
            <CuadroComentar id={t.id} onCambio={cargar} ayuda={`Esperando la respuesta de los dueños hace ${duracion(t.relojes.duenos_ms)}. Tu tiempo quedó frenado.`} />
          )}
          {dueno && t.estado !== 'por_aprobar' && (
            <CuadroComentar id={t.id} onCambio={cargar}
              ayuda={t.estado === 'nueva' ? 'El encargado todavía no la tomó.'
                : t.estado === 'en_curso' ? 'La está resolviendo el encargado. Cuando pida el cierre te aparece acá para aprobar.'
                : null} />
          )}
          {!dueno && t.estado === 'terminada' && <CuadroComentar id={t.id} onCambio={cargar} />}
        </div>
      </section>

      {reporteAbierto && <DetalleReporte id={reporteAbierto} onCerrar={() => setReporteAbierto(null)} />}
    </div>
  );
}
