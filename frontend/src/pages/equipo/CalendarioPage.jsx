import { useState, useEffect } from 'react';
import api from '../../api';

const DIA_CORTO = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
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

// El mes se muestra partido en semanas de lunes a domingo, como la planilla que
// ya usan: una grilla de 31 columnas no se lee.
function semanasDe(mes) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const semanas = [];
  let actual = [];
  for (let d = 1; d <= ultimo; d++) {
    const fecha = new Date(y, m - 1, d);
    const dow = (fecha.getDay() + 6) % 7;         // 0 = lunes
    if (dow === 0 && actual.length) { semanas.push(actual); actual = []; }
    actual.push(fecha);
    if (d === ultimo) semanas.push(actual);
  }
  return semanas;
}

function Celda({ celda, posicion, fecha, empleados, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const emp = celda?.empleado_id ? empleados.find(e => e.id === celda.empleado_id) : null;
  const franco = celda?.estado === 'franco';

  // Un empleado asignado a una posición que lleva reporte, pero que no puede
  // cargarlo, es exactamente el caso que hay que ver antes de que llegue el día.
  const problema = emp && posicion.requiere_reporte && (!emp.carga_reporte || !emp.tiene_usuario);

  const fondo = franco ? 'bg-red-50 text-red-700 border-red-200'
    : emp ? (problema ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-green-50 text-green-800 border-green-200')
    : 'bg-white border-ahg-accent/30 text-ahg-text/25';

  function elegir(valor) {
    setAbierto(false);
    if (valor === 'franco')      onGuardar({ estado: 'franco', empleado_id: null });
    else if (valor === 'vaciar') onGuardar({ estado: 'sin_cubrir', empleado_id: null });
    else                         onGuardar({ estado: 'asignado', empleado_id: Number(valor) });
  }

  return (
    <td className="p-0 relative border border-ahg-accent/20">
      <button
        onClick={() => setAbierto(a => !a)}
        title={problema ? 'Esta persona no puede cargar el reporte de esta posición' : undefined}
        className={`w-full h-full min-h-[34px] px-1.5 py-1 text-[11px] leading-tight text-left border-l-2 ${fondo}
                    hover:brightness-95 transition-all`}
      >
        {franco ? 'Franco' : emp ? (
          <>
            {emp.nombre.split(' ')[0]}
            {problema && <span className="ml-0.5">⚠</span>}
            {emp.local_id_principal !== posicion.local_id && (
              <span className="block text-[9px] opacity-70">cubre</span>
            )}
          </>
        ) : '+'}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAbierto(false)} />
          <div className="absolute z-30 top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto
                          bg-white border border-ahg-accent/40 rounded-lg shadow-xl py-1">
            <button onClick={() => elegir('vaciar')}
                    className="w-full text-left px-3 py-1.5 text-xs text-ahg-text/50 hover:bg-ahg-bg">
              Dejar vacío
            </button>
            <button onClick={() => elegir('franco')}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
              Franco
            </button>
            <div className="border-t border-ahg-accent/20 my-1" />
            {empleados.map(e => {
              const ok = !posicion.requiere_reporte || (e.carga_reporte && e.tiene_usuario);
              return (
                <button key={e.id} onClick={() => elegir(e.id)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-ahg-bg flex items-center gap-1.5">
                  <span className="flex-1 truncate">
                    {e.nombre}
                    {e.puesto && <span className="text-ahg-text/40 capitalize"> · {e.puesto}</span>}
                  </span>
                  {!ok && <span className="text-amber-600" title="No puede cargar reporte">⚠</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </td>
  );
}

export default function CalendarioPage() {
  const [locales, setLocales] = useState([]);
  const [localId, setLocalId] = useState(null);
  const [mes, setMes] = useState(mesActual());
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    api.get('/locales').then(r => {
      const act = r.data.data.filter(l => l.activo);
      setLocales(act);
      if (act.length && !localId) setLocalId(act[0].id);
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
    try {
      const r = await api.put('/calendario/celda', { posicion_id, fecha, ...cambio });
      if (r.data.avisos?.length) setAviso(r.data.avisos[0].texto);
      else setAviso('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el turno');
    }
  }

  async function copiarSemana(lunesOrigen, lunesDestino) {
    try {
      const r = await api.post('/calendario/copiar-semana', {
        local_id: localId, desde: lunesOrigen, hasta: lunesDestino,
      });
      setAviso(`Se copiaron ${r.data.data.copiadas} turnos a la semana siguiente.`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo copiar la semana');
    }
  }

  const semanas = semanasDe(mes);
  const celdaDe = (posId, fecha) => d?.celdas.find(c => c.posicion_id === posId && c.fecha === fecha);

  // Cuántas celdas del mes están sin resolver, para saber si está listo.
  const totalCeldas = (d?.posiciones.length || 0) * new Date(...mes.split('-').map((v, i) => i ? +v : +v), 0).getDate();
  const cubiertas = d?.celdas.length || 0;

  const conProblema = d ? d.celdas.filter(c => {
    if (c.estado !== 'asignado' || !c.empleado_id) return false;
    const p = d.posiciones.find(x => x.id === c.posicion_id);
    const e = d.empleados.find(x => x.id === c.empleado_id);
    return p?.requiere_reporte && e && (!e.carga_reporte || !e.tiene_usuario);
  }) : [];

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
        {d && <span className="text-sm text-ahg-text/50 ml-auto">{cubiertas} turnos cargados</span>}
      </div>

      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}
      {aviso && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-amber-800 text-sm flex justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} className="font-bold">×</button>
        </div>
      )}

      {conProblema.length > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            {conProblema.length} turno{conProblema.length === 1 ? '' : 's'} asignado
            {conProblema.length === 1 ? '' : 's'} a alguien que no puede cargar el reporte
          </p>
          <p className="text-xs text-amber-700">
            Están marcados en ámbar con ⚠ en la grilla. Andá a Empleados, marcá a esa persona
            como que carga reporte, y creale un usuario desde Usuarios y accesos.
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
        semanas.map((semana, si) => {
          const lunes = fechaStr(semana[0]);
          const lunesSiguiente = semanas[si + 1] ? fechaStr(semanas[si + 1][0]) : null;
          const bloques = [...new Set(d.posiciones.map(p => p.turno))];

          return (
            <div key={lunes} className="card p-4">
              <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                <h3 className="font-bold text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Semana del {semana[0].getDate()} al {semana[semana.length - 1].getDate()}
                </h3>
                {lunesSiguiente && (
                  <button onClick={() => copiarSemana(lunes, lunesSiguiente)}
                          className="text-xs font-semibold text-ahg-primary hover:underline">
                    Copiar a la semana siguiente →
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: '640px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th className="text-left px-2 py-1.5 font-semibold text-ahg-text/40 text-[10px] uppercase tracking-wider w-28">
                        Puesto
                      </th>
                      <th className="text-left px-2 py-1.5 font-semibold text-ahg-text/40 text-[10px] w-20">
                        Horario
                      </th>
                      {semana.map(f => (
                        <th key={f.getDate()} className="px-1 py-1.5 text-center font-semibold text-ahg-text/50 capitalize">
                          <span className="block text-[10px] text-ahg-text/35">
                            {DIA_CORTO.format(f).replace('.', '')}
                          </span>
                          {f.getDate()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bloques.map(bloque => (
                      <>
                        <tr key={`b-${bloque}`}>
                          <td colSpan={2 + semana.length}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest
                                         text-ahg-primary bg-ahg-accent/15">
                            {bloque}
                          </td>
                        </tr>
                        {d.posiciones.filter(p => p.turno === bloque).map(p => (
                          <tr key={p.id}>
                            <td className="px-2 py-1 font-medium whitespace-nowrap">{p.nombre}</td>
                            <td className="px-2 py-1 text-ahg-text/40 tabular-nums whitespace-nowrap text-[10px]">
                              {p.hora_desde ? `${p.hora_desde}–${p.hora_hasta}` : '—'}
                            </td>
                            {semana.map(f => {
                              const fs = fechaStr(f);
                              return (
                                <Celda
                                  key={fs}
                                  celda={celdaDe(p.id, fs)}
                                  posicion={{ ...p, local_id: d.local.id }}
                                  fecha={fs}
                                  empleados={d.empleados}
                                  onGuardar={cambio => guardarCelda(p.id, fs, cambio)}
                                />
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
          );
        })
      )}

      <div className="flex flex-wrap gap-4 text-xs text-ahg-text/50">
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-green-50 border border-green-200 inline-block" />Cubierto
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300 inline-block" />No puede reportar
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block" />Franco
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm bg-white border border-ahg-accent/30 inline-block" />Sin cubrir
        </span>
      </div>
    </div>
  );
}
