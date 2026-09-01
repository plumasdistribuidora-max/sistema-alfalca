import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import { dibujarCalendario, bajarPng, textoDeEmpleado } from './exportarCalendario';

const DIA_INICIAL = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MES_LARGO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

function mesActual() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}
function correrMes(mes, delta) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fechaStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Todos los días del mes, con el dato de en qué semana cae cada uno: el corte de
// semana es lo único que hace legible una fila de 31 columnas.
function diasDe(mes) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const dias = [];
  let semana = 0;
  for (let n = 1; n <= ultimo; n++) {
    const fecha = new Date(y, m - 1, n);
    const dow = (fecha.getDay() + 6) % 7;          // 0 = lunes
    if (dow === 0 && n > 1) semana++;
    dias.push({ n, fecha, fs: fechaStr(fecha), dow, semana, finde: dow >= 5 });
  }
  return dias;
}

// Nombre corto para una celda de 46px. Cuando hay apellido siempre se muestra su
// inicial: en el café hay dos Patricias, y "Patric." para las dos no sirve de nada.
function corto(nombre) {
  const [pila, apellido] = nombre.trim().split(/\s+/);
  if (!apellido) return pila.length <= 8 ? pila : pila.slice(0, 7) + '.';
  const base = pila.length <= 5 ? pila : pila.slice(0, 5);
  return `${base} ${apellido[0]}.`;
}

export default function CalendarioPage() {
  const [locales, setLocales] = useState([]);
  const [localId, setLocalId] = useState(null);
  const [mes, setMes] = useState(mesActual());
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  // El selector se abre como capa fija: dentro del scroll horizontal se cortaría.
  const [selector, setSelector] = useState(null);
  const [exportar, setExportar] = useState(false);
  const [copiado, setCopiado] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get('/locales').then(r => {
      const act = r.data.data.filter(l => l.activo);
      setLocales(act);
      if (act.length) setLocalId(prev => prev ?? act[0].id);
    });
  }, []);

  function cargar() {
    if (!localId) return;
    setCargando(true);
    api.get(`/calendario/${localId}/${mes}`)
      .then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el calendario'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [localId, mes]);

  async function guardarCelda(posicion_id, fecha, cambio) {
    setSelector(null);
    try {
      const r = await api.put('/calendario/celda', { posicion_id, fecha, ...cambio });
      setAviso(r.data.avisos?.length ? r.data.avisos[0].texto : '');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el turno');
    }
  }

  async function copiarSemana(desde, hasta) {
    try {
      const r = await api.post('/calendario/copiar-semana', { local_id: localId, desde, hasta });
      setAviso(`Se copiaron ${r.data.data.copiadas} turnos a la semana siguiente.`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo copiar la semana');
    }
  }

  function exportarImagen(soloSemana) {
    const recorte = soloSemana != null ? dias.filter(x => x.semana === soloSemana) : dias;
    const titulo = soloSemana != null
      ? `Semana del ${recorte[0].n} al ${recorte[recorte.length - 1].n}`
      : null;
    const canvas = dibujarCalendario(d, recorte, titulo);
    const nombre = soloSemana != null
      ? `turnos-${d.local.nombre.split(' ')[0].toLowerCase()}-${mes}-semana-${soloSemana + 1}.png`
      : `turnos-${d.local.nombre.split(' ')[0].toLowerCase()}-${mes}.png`;
    bajarPng(canvas, nombre);
    setExportar(false);
  }

  async function copiarTexto(empleadoId) {
    const txt = textoDeEmpleado(d, dias, empleadoId);
    try { await navigator.clipboard.writeText(txt); } catch { /* sin portapapeles */ }
    setCopiado(empleadoId);
    setTimeout(() => setCopiado(null), 1800);
  }

  const dias = diasDe(mes);
  const celdaDe = (posId, fs) => d?.celdas.find(c => c.posicion_id === posId && c.fecha === fs);

  // Lunes de cada semana, para los botones de copiar del encabezado.
  const semanas = [];
  for (const dia of dias) {
    if (!semanas[dia.semana]) semanas[dia.semana] = { inicio: dia, dias: [] };
    semanas[dia.semana].dias.push(dia);
  }

  const conProblema = d ? d.celdas.filter(c => {
    if (c.estado !== 'asignado' || !c.empleado_id) return false;
    const p = d.posiciones.find(x => x.id === c.posicion_id);
    const e = d.empleados.find(x => x.id === c.empleado_id);
    return p?.requiere_reporte && e && (!e.carga_reporte || !e.tiene_usuario);
  }) : [];

  const sinCubrir = d ? d.posiciones.length * dias.length - d.celdas.length : 0;

  function abrirSelector(ev, posicion, fs) {
    const r = ev.currentTarget.getBoundingClientRect();
    setSelector({
      posicion, fs,
      top: Math.min(r.bottom + 4, window.innerHeight - 300),
      left: Math.min(r.left, window.innerWidth - 240),
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          Alfalca · Equipo
        </p>
        <h1 className="text-xl font-bold text-white capitalize mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Calendario de {MES_LARGO.format(new Date(`${mes}-15T12:00:00`))}
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select className="input w-auto text-sm" value={localId || ''}
                onChange={e => setLocalId(Number(e.target.value))}>
          {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <button onClick={() => setMes(correrMes(mes, -1))} className="btn-secondary !px-3 !py-1.5 text-sm">◀</button>
        <input type="month" className="input w-auto !py-1.5 text-sm" value={mes}
               onChange={e => e.target.value && setMes(e.target.value)} />
        <button onClick={() => setMes(correrMes(mes, 1))} className="btn-secondary !px-3 !py-1.5 text-sm">▶</button>
        {d && (
          <>
            <span className="text-sm text-ahg-text/50 ml-auto">
              {d.celdas.length} cargados
              {sinCubrir > 0 && <span className="text-ahg-text/40"> · {sinCubrir} sin cubrir</span>}
            </span>
            <button onClick={() => setExportar(true)} disabled={!d.celdas.length}
                    className="btn-primary !py-1.5 text-sm disabled:opacity-40">
              Exportar
            </button>
          </>
        )}
      </div>

      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}
      {aviso && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-amber-800 text-sm flex justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} className="font-bold flex-shrink-0">×</button>
        </div>
      )}

      {conProblema.length > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            {conProblema.length} turno{conProblema.length === 1 ? '' : 's'} del mes
            {conProblema.length === 1 ? ' está asignado' : ' están asignados'} a alguien que no puede cargar el reporte
          </p>
          <p className="text-xs text-amber-700">
            Están en ámbar con ⚠. Marcá a esa persona como que carga reporte en Empleados,
            y creale un usuario desde Usuarios y accesos.
          </p>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-ahg-text/50">Cargando…</p>
      ) : !d ? null : !d.posiciones.length ? (
        <div className="card p-8 text-center text-sm text-ahg-text/50">
          Este local todavía no tiene puestos configurados.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div ref={scrollRef} className="overflow-x-auto">
            <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                {/* Semanas, con el botón para copiar a la siguiente */}
                <tr>
                  <th className="sticky left-0 z-20 bg-ahg-bg" style={{ width: 118, minWidth: 118 }} />
                  <th className="sticky z-20 bg-ahg-bg" style={{ left: 118, width: 66, minWidth: 66 }} />
                  {semanas.map((s, i) => (
                    <th key={i} colSpan={s.dias.length}
                        className="px-1 py-1 text-[10px] font-semibold text-ahg-text/40 bg-ahg-bg
                                   border-l-2 border-ahg-accent/40 whitespace-nowrap">
                      {semanas[i + 1] ? (
                        <button
                          onClick={() => copiarSemana(s.inicio.fs, semanas[i + 1].inicio.fs)}
                          className="hover:text-ahg-primary hover:underline"
                          title="Copiar esta semana a la siguiente">
                          {s.dias[0].n}–{s.dias[s.dias.length - 1].n} · copiar →
                        </button>
                      ) : (
                        <span>{s.dias[0].n}–{s.dias[s.dias.length - 1].n}</span>
                      )}
                    </th>
                  ))}
                </tr>
                {/* Días */}
                <tr>
                  <th className="sticky left-0 z-20 bg-ahg-bg text-left px-2 py-1.5 font-semibold
                                 text-ahg-text/40 text-[10px] uppercase tracking-wider
                                 border-b border-ahg-accent/30">
                    Puesto
                  </th>
                  <th className="sticky z-20 bg-ahg-bg text-left px-2 py-1.5 font-semibold
                                 text-ahg-text/40 text-[10px] border-b border-ahg-accent/30
                                 border-r border-ahg-accent/30"
                      style={{ left: 118 }}>
                    Horario
                  </th>
                  {dias.map(dia => (
                    <th key={dia.n}
                        className={`px-0.5 py-1 text-center font-semibold border-b border-ahg-accent/30
                          ${dia.finde ? 'bg-ahg-accent/10 text-ahg-text/35' : 'text-ahg-text/50'}
                          ${dia.dow === 0 ? 'border-l-2 border-l-ahg-accent/40' : ''}`}
                        style={{ width: 46, minWidth: 46 }}>
                      <span className="block text-[9px] text-ahg-text/30">{DIA_INICIAL[dia.dow]}</span>
                      {dia.n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Set(d.posiciones.map(p => p.turno))].map(bloque => (
                  <>
                    <tr key={`b-${bloque}`}>
                      <td colSpan={2 + dias.length}
                          className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest
                                     text-ahg-primary bg-ahg-accent/15 sticky left-0">
                        {bloque}
                      </td>
                    </tr>
                    {d.posiciones.filter(p => p.turno === bloque).map(p => (
                      <tr key={p.id}>
                        <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium
                                       whitespace-nowrap border-b border-ahg-accent/20"
                            style={{ width: 118, minWidth: 118 }}>
                          {p.nombre}
                          {p.requiere_reporte && (
                            <span className="text-ahg-primary ml-1" title="Esta posición lleva reporte">•</span>
                          )}
                        </td>
                        <td className="sticky z-10 bg-white px-2 py-1 text-ahg-text/40 tabular-nums
                                       whitespace-nowrap text-[10px] border-b border-ahg-accent/20
                                       border-r border-ahg-accent/30"
                            style={{ left: 118, width: 66, minWidth: 66 }}>
                          {p.hora_desde ? `${p.hora_desde}–${p.hora_hasta}` : '—'}
                        </td>
                        {dias.map(dia => {
                          const celda = celdaDe(p.id, dia.fs);
                          const emp = celda?.empleado_id ? d.empleados.find(e => e.id === celda.empleado_id) : null;
                          const franco = celda?.estado === 'franco';
                          const problema = emp && p.requiere_reporte && (!emp.carga_reporte || !emp.tiene_usuario);
                          const cubre = emp && emp.local_id_principal !== d.local.id;

                          const fondo = franco ? 'bg-red-50 text-red-700'
                            : emp ? (problema ? 'bg-amber-100 text-amber-900' : 'bg-green-50 text-green-800')
                            : dia.finde ? 'bg-ahg-accent/5 text-ahg-text/20' : 'bg-white text-ahg-text/20';

                          return (
                            <td key={dia.n}
                                className={`p-0 border-b border-ahg-accent/20
                                  ${dia.dow === 0 ? 'border-l-2 border-l-ahg-accent/40' : 'border-l border-l-ahg-accent/10'}`}
                                style={{ width: 46, minWidth: 46 }}>
                              <button
                                onClick={ev => abrirSelector(ev, p, dia.fs)}
                                title={emp ? `${emp.nombre}${problema ? ' — no puede cargar el reporte' : ''}${cubre ? ' — cubre de otro local' : ''}` : undefined}
                                className={`w-full h-[30px] px-1 text-[10px] leading-none truncate
                                            hover:brightness-90 transition-all ${fondo}`}>
                                {franco ? 'Fr' : emp ? (
                                  <>
                                    {corto(emp.nombre)}
                                    {problema && '⚠'}
                                    {cubre && !problema && '*'}
                                  </>
                                ) : '+'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Exportar para mandar al grupo o a cada uno */}
      {exportar && d && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="card w-full max-w-md my-8 p-6 space-y-4">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Pasarle los turnos al equipo
            </h2>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ahg-text/40 mb-2">
                Imagen para el grupo
              </p>
              <button onClick={() => exportarImagen(null)} className="btn-primary w-full mb-2">
                Bajar el mes completo
              </button>
              <div className="grid grid-cols-2 gap-2">
                {semanas.map((s, i) => (
                  <button key={i} onClick={() => exportarImagen(i)} className="btn-secondary text-sm !py-1.5">
                    Semana {s.dias[0].n}–{s.dias[s.dias.length - 1].n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ahg-text/50 mt-2">
                El mes entero es una imagen ancha: se ve mejor en la computadora. Para mandar
                por WhatsApp conviene una semana.
              </p>
            </div>

            <div className="pt-3 border-t border-ahg-accent/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-ahg-text/40 mb-2">
                Texto para cada uno
              </p>
              <p className="text-xs text-ahg-text/50 mb-2">
                Solo sus turnos del mes, listo para pegar en un privado.
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {d.empleados
                  .filter(e => d.celdas.some(c => c.empleado_id === e.id))
                  .map(e => (
                    <button key={e.id} onClick={() => copiarTexto(e.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg
                                       border border-ahg-accent/40 hover:border-ahg-primary text-sm text-left">
                      <span className="truncate">{e.nombre}</span>
                      <span className={`text-xs font-semibold flex-shrink-0 ${
                        copiado === e.id ? 'text-green-600' : 'text-ahg-primary'}`}>
                        {copiado === e.id ? 'Copiado' : 'Copiar'}
                      </span>
                    </button>
                  ))}
                {!d.empleados.some(e => d.celdas.some(c => c.empleado_id === e.id)) && (
                  <p className="text-sm text-ahg-text/40 py-3 text-center">
                    Todavía no hay nadie asignado este mes.
                  </p>
                )}
              </div>
            </div>

            <button onClick={() => setExportar(false)} className="btn-secondary w-full">Cerrar</button>
          </div>
        </div>
      )}

      {/* Selector de persona, en capa fija para que el scroll no lo recorte */}
      {selector && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelector(null)} />
          <div className="fixed z-50 w-56 max-h-72 overflow-y-auto bg-white
                          border border-ahg-accent/40 rounded-lg shadow-xl py-1"
               style={{ top: selector.top, left: selector.left }}>
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ahg-text/40
                          border-b border-ahg-accent/20 mb-1">
              {selector.posicion.nombre} · {Number(selector.fs.slice(8))}
            </p>
            <button onClick={() => guardarCelda(selector.posicion.id, selector.fs, { estado: 'sin_cubrir', empleado_id: null })}
                    className="w-full text-left px-3 py-1.5 text-xs text-ahg-text/50 hover:bg-ahg-bg">
              Dejar vacío
            </button>
            <button onClick={() => guardarCelda(selector.posicion.id, selector.fs, { estado: 'franco', empleado_id: null })}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
              Franco
            </button>
            <div className="border-t border-ahg-accent/20 my-1" />
            {d?.empleados.map(e => {
              const ok = !selector.posicion.requiere_reporte || (e.carga_reporte && e.tiene_usuario);
              return (
                <button key={e.id}
                        onClick={() => guardarCelda(selector.posicion.id, selector.fs, { estado: 'asignado', empleado_id: e.id })}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-ahg-bg flex items-center gap-1.5">
                  <span className="flex-1 truncate">
                    {e.nombre}
                    {e.puesto && <span className="text-ahg-text/40 capitalize"> · {e.puesto}</span>}
                  </span>
                  {!ok && <span className="text-amber-600" title="No puede cargar el reporte de esta posición">⚠</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-ahg-text/50">
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-green-50 border border-green-200 inline-block" />Cubierto
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />⚠ No puede reportar
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block" />Franco
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-white border border-ahg-accent/30 inline-block" />Sin cubrir
        </span>
        <span>* cubre de otro local</span>
        <span><span className="text-ahg-primary">•</span> la posición lleva reporte</span>
      </div>
    </div>
  );
}
