import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import { comprimir } from '../../utils/fotos';
import DetalleReporte from '../reportes/DetalleReporte';
import {
  pesos, ddmm, diaCorto, diaLargo, cuando, duracion, hoyStr, PuntoLocal, ChipTipo, Chip, EstadoTarea,
  useOpciones, Adjunto, Cargando, MensajeError, QueVasAHacer,
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

const COLOR_EVENTO = {
  creada: 'bg-stone-400', tomada: 'bg-sky-600', avance: 'bg-sky-600', plazo: 'bg-amber-500',
  gasto: 'bg-sky-600', comprobante: 'bg-sky-600', gasto_aprobado: 'bg-emerald-600', gasto_rechazado: 'bg-red-600',
  pidio_cierre: 'bg-ahg-primary', aprobada: 'bg-emerald-600', pidio_mas: 'bg-red-600', rechazada: 'bg-red-600', sistema: 'bg-stone-400',
};
const TITULO_EVENTO = {
  creada: 'El sistema levantó la alerta', tomada: 'La tomó', avance: 'Avance', plazo: 'Cambió la fecha',
  gasto: 'Cargó un gasto', comprobante: 'Subió un comprobante', gasto_aprobado: 'Gasto aprobado', gasto_rechazado: 'Gasto no aprobado',
  pidio_cierre: 'Pidió el cierre', aprobada: 'Aprobada', pidio_mas: 'Pide más', rechazada: 'No la aprobó', sistema: 'Aviso del sistema',
};

function Seguimiento({ eventos, tarea }) {
  const vencida = tarea.dias_vencida > 0;
  return (
    <ol className="relative">
      {eventos.map((e, i) => (
        <li key={e.id} className="relative pl-6 pb-4">
          {(i < eventos.length - 1 || vencida) && <span className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-ahg-accent/50" />}
          <span className={`absolute left-0 top-1 w-3 h-3 rounded-full ${COLOR_EVENTO[e.tipo] || 'bg-stone-400'}`} />
          <p className="text-xs text-ahg-text/50">{cuando(e.created_at)}{e.usuario ? ` · ${e.usuario}` : ''}</p>
          <p className="font-semibold text-sm">{TITULO_EVENTO[e.tipo] || e.tipo}</p>
          {e.texto && <p className="text-sm text-ahg-text/80">{e.texto}</p>}
          {e.adjuntos?.length > 0 && <div className="flex gap-2 flex-wrap mt-1.5">{e.adjuntos.map(a => <Adjunto key={a.id} a={a} />)}</div>}
        </li>
      ))}
      {vencida && (
        <li className="relative pl-6">
          <span className="absolute left-0 top-1 w-3 h-3 rounded-full bg-red-600" />
          <p className="text-xs text-ahg-text/50">{diaCorto(tarea.plazo)}</p>
          <p className="font-semibold text-sm text-red-700">Se venció el plazo hace {tarea.dias_vencida} día{tarea.dias_vencida === 1 ? '' : 's'}</p>
          <p className="text-sm text-ahg-text/80">Sigue en manos del encargado. Los dueños la ven en rojo.</p>
        </li>
      )}
    </ol>
  );
}

function Archivo({ id, archivo, setArchivo, texto = 'Adjuntar foto', aceptaPdf }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-ahg-accent/60 bg-white cursor-pointer hover:bg-ahg-bg">
      📷 {archivo ? archivo.name.slice(0, 24) : texto}
      <input id={id} type="file" className="hidden" accept={aceptaPdf ? 'image/*,application/pdf' : 'image/*'}
             onChange={e => setArchivo(e.target.files?.[0] || null)} />
    </label>
  );
}

function Bloque({ titulo, sub, children }) {
  return (
    <div className="bg-ahg-bg rounded-xl p-3.5 space-y-3">
      <div>
        <p className="font-bold text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</p>
        {sub && <p className="text-xs text-ahg-text/55">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

const etiq = 'text-xs text-ahg-text/60 grid gap-1';

// ── Lo que hace el encargado ─────────────────────────────────────────────────
function AccionesEncargado({ data, opcionesGen, onCambio }) {
  const { tarea: t, opciones, gastos, personas } = data;
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState('');

  const [accion, setAccion] = useState('');
  const [plazo, setPlazo] = useState(sumarDias(hoyStr(), 2));
  const [motivoDesc, setMotivoDesc] = useState(opcionesGen?.motivos_descarte?.[0] || '');
  const [avTipo, setAvTipo] = useState(opcionesGen?.avances?.[0] || '');
  const [avNota, setAvNota] = useState('');
  const [avFoto, setAvFoto] = useState(null);
  const [nuevoPlazo, setNuevoPlazo] = useState('');
  const [motivoPlazo, setMotivoPlazo] = useState(opcionesGen?.motivos_plazo?.[0] || '');
  const [gConcepto, setGConcepto] = useState('');
  const [gMonto, setGMonto] = useState('');
  const [gRol, setGRol] = useState('presupuesto');
  const [gFoto, setGFoto] = useState(null);
  const [resultado, setResultado] = useState(opciones.resultados?.[0] || '');
  const [monto, setMonto] = useState('');
  const [afectado, setAfectado] = useState('');
  const [nota, setNota] = useState('');
  const [prueba, setPrueba] = useState(null);

  const tope = opcionesGen?.tope_gasto || 100000;
  const conMonto = (opciones.con_monto || []).includes(resultado);

  async function hacer(clave, fn) {
    setOcupado(clave); setError('');
    try { await fn(); onCambio(); }
    catch (err) {
      const d = err.response?.data;
      setError(d?.data?.faltan?.join(' · ') || d?.error || err.message || 'No se pudo guardar');
    } finally { setOcupado(''); }
  }

  if (t.estado === 'nueva') {
    return (
      <div className="space-y-3">
        <Bloque titulo="Tomar la tarea" sub="Escribí qué vas a hacer y elegí para cuándo. Las dos cosas las ven los dueños.">
          <div className="flex flex-wrap gap-3 items-end">
            <QueVasAHacer id="accion-detalle" valor={accion} onChange={setAccion} ideas={opciones.acciones} />
            <label className={etiq}>¿Para cuándo?
              <input type="date" className="input !py-1.5" value={plazo} min={hoyStr()} onChange={e => setPlazo(e.target.value)} />
            </label>
            <button className="btn-primary !py-1.5" disabled={!!ocupado || accion.trim().length < 3}
                    onClick={() => hacer('tomar', () => api.post(`/tareas/${t.id}/tomar`, { accion, plazo }))}>
              {ocupado === 'tomar' ? 'Guardando…' : 'Tomar la tarea'}
            </button>
          </div>
        </Bloque>
        {descartar()}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  function descartar() {
    return (
      <Bloque titulo="¿No hay nada que hacer?" sub="El descarte también lo tiene que aprobar un dueño.">
        <div className="flex flex-wrap gap-3 items-end">
          <label className={etiq}>Motivo
            <select className="input !py-1.5" value={motivoDesc} onChange={e => setMotivoDesc(e.target.value)}>
              {(opcionesGen?.motivos_descarte || []).map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <button className="btn-secondary !py-1.5" disabled={!!ocupado}
                  onClick={() => hacer('desc', () => api.post(`/tareas/${t.id}/descartar`, { motivo: motivoDesc }))}>
            Pedir descartarla
          </button>
        </div>
      </Bloque>
    );
  }

  const montoNum = Number(String(gMonto).replace(/\D/g, '')) || 0;
  const sinComprobante = gastos.filter(g => ['aprobado_solo', 'aprobado'].includes(g.estado) && !g.con_comprobante);

  return (
    <div className="space-y-3">
      <Bloque titulo="Anotar un avance" sub="Qué hiciste. La nota y la foto son opcionales.">
        <div className="flex flex-wrap gap-3 items-end">
          <label className={etiq}>¿Qué hiciste?
            <select className="input !py-1.5" value={avTipo} onChange={e => setAvTipo(e.target.value)}>
              {(opcionesGen?.avances || []).map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className={`${etiq} flex-1 min-w-[180px]`}>Nota
            <input className="input !py-1.5" value={avNota} maxLength={300} onChange={e => setAvNota(e.target.value)} placeholder="Opcional" />
          </label>
          <Archivo id="av-foto" archivo={avFoto} setArchivo={setAvFoto} />
          <button className="btn-primary !py-1.5" disabled={!!ocupado}
                  onClick={() => hacer('av', async () => { await enviar(`/tareas/${t.id}/avance`, { tipo: avTipo, nota: avNota }, avFoto); setAvNota(''); setAvFoto(null); })}>
            {ocupado === 'av' ? 'Guardando…' : 'Guardar avance'}
          </button>
        </div>
      </Bloque>

      <Bloque titulo="Cambiar la fecha" sub={`Hoy es para el ${diaCorto(t.plazo)}. Cada cambio queda registrado con su motivo.`}>
        <div className="flex flex-wrap gap-3 items-end">
          <label className={etiq}>Fecha nueva
            <input type="date" className="input !py-1.5" value={nuevoPlazo} min={hoyStr()} onChange={e => setNuevoPlazo(e.target.value)} />
          </label>
          <label className={etiq}>Motivo
            <select className="input !py-1.5" value={motivoPlazo} onChange={e => setMotivoPlazo(e.target.value)}>
              {(opcionesGen?.motivos_plazo || []).map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <button className="btn-secondary !py-1.5" disabled={!!ocupado || !nuevoPlazo}
                  onClick={() => hacer('plazo', async () => { await api.post(`/tareas/${t.id}/plazo`, { plazo: nuevoPlazo, motivo: motivoPlazo }); setNuevoPlazo(''); })}>
            Cambiar fecha
          </button>
        </div>
      </Bloque>

      <Bloque titulo="Cargar un gasto" sub={`Sale de la caja chica. Menos de ${pesos(tope)}: queda aprobado solo. Desde ${pesos(tope)}: no se gasta hasta que lo apruebe un dueño.`}>
        <div className="flex flex-wrap gap-3 items-end">
          <label className={`${etiq} flex-1 min-w-[160px]`}>Qué es
            <input className="input !py-1.5" value={gConcepto} maxLength={200} onChange={e => setGConcepto(e.target.value)} placeholder="Ej.: plomero, destapar baño" />
          </label>
          <label className={etiq}>Monto
            <input className="input !py-1.5 w-36" inputMode="numeric" value={gMonto}
                   onChange={e => { const v = e.target.value.replace(/\D/g, ''); setGMonto(v ? Number(v).toLocaleString('es-AR') : ''); }} placeholder="$" />
          </label>
          <label className={etiq}>Lo que adjuntás es
            <select className="input !py-1.5" value={gRol} onChange={e => setGRol(e.target.value)}>
              <option value="presupuesto">Presupuesto</option>
              <option value="comprobante">Comprobante de pago</option>
            </select>
          </label>
          <Archivo id="g-foto" archivo={gFoto} setArchivo={setGFoto} aceptaPdf texto="Adjuntar foto o PDF" />
          <button className="btn-primary !py-1.5" disabled={!!ocupado}
                  onClick={() => hacer('gasto', async () => {
                    await enviar(`/tareas/${t.id}/gastos`, { concepto: gConcepto, monto: montoNum, rol: gRol }, gFoto);
                    setGConcepto(''); setGMonto(''); setGFoto(null);
                  })}>
            {ocupado === 'gasto' ? 'Guardando…' : 'Cargar gasto'}
          </button>
        </div>
        {montoNum > 0 && (
          <p className="text-xs">
            {montoNum < tope
              ? <><Chip tono="verde">Aprobado solo</Chip> Podés hacerlo ya. Después subí el comprobante del pago: sin eso no podés pedir el cierre.</>
              : <><Chip tono="ambar">Va a los dueños</Chip> Pasa los {pesos(tope)}. Les llega un aviso con el presupuesto y no se puede gastar hasta que lo aprueben.</>}
          </p>
        )}
      </Bloque>

      {sinComprobante.length > 0 && (
        <Bloque titulo="Falta el comprobante" sub="Sin el comprobante de pago la tarea no se puede cerrar.">
          {sinComprobante.map(g => <SubirComprobante key={g.id} g={g} onCambio={onCambio} />)}
        </Bloque>
      )}

      <Bloque titulo="Pedir el cierre" sub="Elegí qué era. La tarea queda terminada cuando un dueño la aprueba.">
        <div className="flex flex-wrap gap-3 items-end">
          <label className={etiq}>¿Qué era?
            <select className="input !py-1.5" value={resultado} onChange={e => setResultado(e.target.value)}>
              {opciones.resultados.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
          {conMonto && (
            <label className={etiq}>Monto
              <input className="input !py-1.5 w-36" inputMode="numeric" value={monto}
                     onChange={e => { const v = e.target.value.replace(/\D/g, ''); setMonto(v ? Number(v).toLocaleString('es-AR') : ''); }} placeholder="$" />
            </label>
          )}
          {opciones.pide_afectado && (
            <label className={etiq}>¿De quién fue?
              <select className="input !py-1.5" value={afectado} onChange={e => setAfectado(e.target.value)}>
                <option value="">No corresponde a nadie</option>
                {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          )}
          <label className={`${etiq} flex-1 min-w-[180px]`}>Nota
            <input className="input !py-1.5" value={nota} maxLength={300} onChange={e => setNota(e.target.value)} placeholder="Opcional" />
          </label>
          <Archivo id="cierre-foto" archivo={prueba} setArchivo={setPrueba} texto="Foto de prueba" />
        </div>
        <button className="btn-primary" disabled={!!ocupado}
                onClick={() => hacer('cierre', () => enviar(`/tareas/${t.id}/pedir-cierre`, {
                  resultado, monto: conMonto ? Number(String(monto).replace(/\D/g, '')) : undefined,
                  afectado_usuario_id: afectado || undefined, nota,
                }, prueba))}>
          {ocupado === 'cierre' ? 'Enviando…' : 'Pedir el cierre a los dueños'}
        </button>
      </Bloque>

      {descartar()}
      {error && <p className="text-sm text-red-700 font-medium">{error}</p>}
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
      {modo && (
        <textarea className="input" rows={2} value={texto} onChange={e => setTexto(e.target.value)} autoFocus
                  placeholder={modo === 'pedir' ? 'Qué le pedís (ej.: mandame la foto del arqueo)' : 'Por qué no alcanza'} />
      )}
      <div className="flex flex-wrap gap-2">
        {!modo && <button className="btn-primary" disabled={ocupado} onClick={() => responder('aprobar')}>Aprobar</button>}
        {!modo && <button className="btn-secondary" onClick={() => setModo('pedir')}>Pedir foto o dato</button>}
        {!modo && <button className="btn-secondary" onClick={() => setModo('rechazar')}>No alcanza</button>}
        {modo && <button className="btn-primary" disabled={ocupado || !texto.trim()} onClick={() => responder(modo)}>{modo === 'pedir' ? 'Mandar pedido' : 'Rechazar'}</button>}
        {modo && <button className="btn-secondary" onClick={() => { setModo(''); setTexto(''); }}>Volver</button>}
      </div>
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

const ESTADO_GASTO = {
  aprobado_solo: ['verde', 'Aprobado solo'], pendiente: ['ambar', 'Espera a los dueños'],
  aprobado: ['verde', 'Aprobado'], rechazado: ['rojo', 'No aprobado'],
};

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

  return (
    <div className="space-y-4 max-w-4xl">
      <Link to="/tareas" className="text-sm text-ahg-text/60 hover:text-ahg-text">← Bandeja</Link>

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
        <DatosDelProblema t={t} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Dato label="Tiempo del encargado" valor={duracion(t.relojes.encargado_ms)} tono={t.dias_vencida > 0 ? 'text-red-700' : undefined} />
          <Dato label="Tiempo de los dueños" valor={duracion(t.relojes.duenos_ms)} />
          <Dato label="Cambios de fecha" valor={t.cambios_plazo} />
          <Dato label="Gastado" valor={pesos(t.gastado)} />
        </div>
        {t.accion && <p className="text-sm">Va a hacer: <b>{t.accion}</b>{t.plazo && <> · para el <b>{diaCorto(t.plazo)}</b></>}</p>}
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

      {dueno && t.estado === 'por_aprobar' && <RespuestaDueno data={data} onCambio={cargar} />}
      {dueno && pendientesDueno.map(g => <GastoPendienteDueno key={g.id} g={g} onCambio={cargar} />)}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="card p-4 sm:p-5">
          <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Seguimiento</h2>
          <p className="text-xs text-ahg-text/55 mb-3">Todo lo que pasó, con fecha y hora. No se puede borrar.</p>
          <Seguimiento eventos={data.eventos} tarea={t} />
        </section>

        <section className="space-y-4">
          {data.gastos.length > 0 && (
            <div className="card p-4 sm:p-5">
              <h2 className="font-bold mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Gastos</h2>
              {data.gastos.map(g => (
                <div key={g.id} className="py-2 border-t border-ahg-accent/30 first:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium flex-1">{g.concepto} · {pesos(g.monto)}</span>
                    <Chip tono={ESTADO_GASTO[g.estado][0]}>{ESTADO_GASTO[g.estado][1]}</Chip>
                    {['aprobado_solo', 'aprobado'].includes(g.estado) && <Chip tono={g.con_comprobante ? 'verde' : 'rojo'}>{g.con_comprobante ? 'Con comprobante' : 'Falta comprobante'}</Chip>}
                  </div>
                  {g.respuesta && <p className="text-xs text-ahg-text/60 mt-1">{g.respondido_por_nombre}: {g.respuesta}</p>}
                  <div className="flex gap-2 flex-wrap mt-1.5">{g.adjuntos.map(a => <Adjunto key={a.id} a={a} />)}</div>
                </div>
              ))}
            </div>
          )}

          {['nueva', 'en_curso'].includes(t.estado) && (
            <div className="card p-4 sm:p-5">
              <h2 className="font-bold mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {dueno ? 'Lo que hace el encargado' : 'Qué hacés'}
              </h2>
              <AccionesEncargado data={data} opcionesGen={opcionesGen} onCambio={cargar} />
            </div>
          )}
          {t.estado === 'por_aprobar' && !dueno && (
            <div className="card p-4 text-sm text-ahg-text/70">Esperando la respuesta de los dueños hace {duracion(t.relojes.duenos_ms)}. Tu tiempo quedó frenado.</div>
          )}
          {t.estado === 'terminada' && (
            <div className="card p-4 text-sm">
              <Chip tono="verde">Terminada</Chip>{' '}
              {t.terminada_por_nombre ? `La aprobó ${t.terminada_por_nombre}` : 'Se aprobó sola por causa conocida'}: <b>{t.resultado}</b>
              {t.resultado_monto ? ` (${pesos(t.resultado_monto)})` : ''}.
            </div>
          )}
        </section>
      </div>

      {reporteAbierto && <DetalleReporte id={reporteAbierto} onCerrar={() => setReporteAbierto(null)} />}
    </div>
  );
}
