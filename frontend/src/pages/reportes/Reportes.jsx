import { useState, useEffect } from 'react';
import api from '../../api';
import DetalleReporte from './DetalleReporte';
import CierreDelDia from './CierreDelDia';

const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function correrDia(fecha, delta) {
  const [y, m, d] = fecha.split('-').map(Number);
  const x = new Date(y, m - 1, d + delta);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// El color dice el estado de un vistazo; la palabra lo dice sin depender del color.
const ESTADO = {
  sin_cargar: { txt: 'Sin cargar',  clase: 'bg-stone-100 text-stone-500 border-stone-200' },
  borrador:   { txt: 'Empezado',    clase: 'bg-stone-100 text-stone-600 border-stone-300' },
  enviado:    { txt: 'Presentado',  clase: 'bg-amber-100 text-amber-800 border-amber-300' },
  observado:  { txt: 'Devuelto',    clase: 'bg-red-100 text-red-700 border-red-300' },
  aprobado:   { txt: 'Aprobado',    clase: 'bg-green-100 text-green-700 border-green-300' },
};

function Slot({ slot, onAbrir }) {
  const e = ESTADO[slot.estado] || ESTADO.sin_cargar;
  const abrible = !!slot.reporte;
  const etiqueta = slot.plantilla_codigo === 'cocina' ? 'Cocina' :
                   slot.plantilla_codigo === 'cafe'   ? 'Café'   : 'Tienda';

  return (
    <button
      onClick={() => abrible && onAbrir(slot.reporte.id)}
      disabled={!abrible}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors
        ${abrible ? 'bg-white border-ahg-accent/40 hover:border-ahg-primary cursor-pointer'
                  : 'bg-ahg-bg border-dashed border-ahg-accent/40 cursor-default'}`}
    >
      <span className="text-xs font-semibold text-ahg-text/50 w-32 flex-shrink-0">
        {etiqueta} · {slot.turno}
      </span>
      <span className="flex-1 min-w-0 text-sm truncate">
        {slot.reporte ? (
          <>
            {slot.reporte.usuario_nombre}
            {slot.reporte.usuario_puesto && (
              <span className="text-ahg-text/40 capitalize"> · {slot.reporte.usuario_puesto}</span>
            )}
          </>
        ) : (
          <span className="text-ahg-text/30">nadie lo cargó</span>
        )}
      </span>
      {slot.reporte?.fotos > 0 && (
        <span className="text-xs text-ahg-text/40 flex-shrink-0">
          {slot.reporte.fotos} foto{slot.reporte.fotos === 1 ? '' : 's'}
          {slot.reporte.facturas > 0 && ` · ${slot.reporte.facturas} fact.`}
        </span>
      )}
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${e.clase}`}>
        {e.txt}
      </span>
    </button>
  );
}

export default function Reportes() {
  const [fecha, setFecha] = useState(hoyStr());
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);

  function cargar() {
    setCargando(true);
    api.get('/reportes/dia', { params: { fecha } })
      .then(r => { setD(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el día'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fecha]);

  const cerrado = d?.consolidado?.estado === 'cerrado';
  const faltan = d ? d.totales.esperados - d.totales.recibidos : 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          Alfalca · Reportes
        </p>
        <h1 className="text-xl font-bold text-white capitalize mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {FECHA_LARGA.format(new Date(`${fecha}T12:00:00`))}
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFecha(correrDia(fecha, -1))} className="btn-secondary !px-3 !py-1.5 text-sm">◀</button>
        <input type="date" className="input w-auto !py-1.5 text-sm" value={fecha}
               onChange={e => e.target.value && setFecha(e.target.value)} />
        {fecha < hoyStr() && (
          <button onClick={() => setFecha(correrDia(fecha, 1))} className="btn-secondary !px-3 !py-1.5 text-sm">▶</button>
        )}
        {d && (
          <span className="text-sm text-ahg-text/60 ml-auto">
            {d.totales.recibidos} de {d.totales.esperados} reportes
            {faltan > 0 && <strong className="text-amber-700"> · faltan {faltan}</strong>}
          </span>
        )}
      </div>

      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {cargando ? (
        <p className="text-sm text-ahg-text/50">Cargando…</p>
      ) : !d ? null : (
        <>
          {/* El reporte del Encargado, arriba de todo */}
          <div className={`card p-5 border-2 ${cerrado ? 'border-green-300' : 'border-ahg-primary'}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">
                  Reporte del Encargado General
                </p>
                <h2 className="font-bold text-lg" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Consolidado del día
                </h2>
                <p className="text-sm text-ahg-text/60 mt-0.5">
                  {cerrado
                    ? 'Cerrado y enviado a los dueños.'
                    : faltan > 0
                      ? `No se puede cerrar hasta que lleguen los ${faltan} reportes que faltan.`
                      : 'Están todos los reportes. Listo para verificar y cerrar.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  cerrado ? 'bg-green-100 text-green-700 border-green-300'
                  : d.consolidado ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-stone-100 text-stone-500 border-stone-200'}`}>
                  {cerrado ? 'Cerrado' : d.consolidado ? 'Empezado' : 'Sin empezar'}
                </span>
                <button onClick={() => setCierreAbierto(a => !a)} className="btn-primary !py-1.5">
                  {cierreAbierto ? 'Cerrar' : 'Abrir'}
                </button>
              </div>
            </div>

            {cierreAbierto && (
              <div className="mt-5 pt-5 border-t border-ahg-accent/30">
                <CierreDelDia fecha={fecha} onCambio={cargar} />
              </div>
            )}
          </div>

          {/* Local por local, con los slots que deberían estar */}
          {d.locales.map(l => (
            <div key={l.local_id} className="card p-4">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h3 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{l.nombre}</h3>
                <span className={`text-xs font-semibold ${
                  l.esperados === 0 ? 'text-ahg-text/30'
                  : l.recibidos === l.esperados ? 'text-green-600' : 'text-amber-700'}`}>
                  {l.esperados === 0 ? 'sin gente que reporte' : `${l.recibidos} de ${l.esperados}`}
                </span>
              </div>

              {l.esperados === 0 ? (
                <p className="text-sm text-ahg-text/40">
                  Todavía no hay empleados con acceso cargando reportes en este local.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {l.slots.map((s, i) => (
                    <Slot key={i} slot={s} onAbrir={setAbierto} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {abierto && (
        <DetalleReporte id={abierto} onCerrar={() => setAbierto(null)} onRevisado={cargar} />
      )}
    </div>
  );
}
