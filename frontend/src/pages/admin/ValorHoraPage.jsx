import { useState, useEffect } from 'react';
import api from '../../api';
import { soloNumero } from '../reportes/campos';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const FECHA = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function ValorHoraPage() {
  const [valores, setValores] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]   = useState('');
  const [aviso, setAviso]   = useState('');
  const [editando, setEditando] = useState(null);   // "localId|puesto"
  const [monto, setMonto]   = useState('');

  function cargar() {
    setCargando(true);
    api.get('/consolidado/valor-hora')
      .then(r => { setValores(r.data.data.valores); setPuestos(r.data.data.puestos); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los valores'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  const actual = Object.fromEntries(valores.map(v => [`${v.local_id}|${v.puesto}`, v]));

  async function guardar(local_id, puesto) {
    if (!(Number(monto) > 0)) { setError('Poné un valor mayor a cero'); return; }
    try {
      await api.post('/consolidado/valor-hora', { local_id, puesto, valor_hora: Number(monto) });
      setAviso(`Valor hora de ${puesto} actualizado. Rige desde hoy; los días cerrados no cambian.`);
      setEditando(null); setMonto(''); setError('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    }
  }

  const sinCargar = puestos.filter(p => !actual[`${p.local_id}|${p.puesto}`]).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Valor hora
        </h1>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          Cuánto se paga la hora en cada puesto
        </p>
      </div>

      <p className="text-sm text-ahg-text/60">
        De acá sale el gasto de personal del consolidado y el KPI de horas sobre ventas.
        Cada cambio queda con su fecha: subir un valor no cambia lo que costaron los días
        que ya se cerraron.
      </p>

      {aviso && (
        <div className="card px-4 py-3 border-green-300 bg-green-50 text-green-800 text-sm flex justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} className="font-bold">×</button>
        </div>
      )}
      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {sinCargar > 0 && (
        <div className="card px-4 py-3 border-amber-300 bg-amber-50 text-sm text-amber-800">
          Hay <strong>{sinCargar}</strong> puesto{sinCargar === 1 ? '' : 's'} sin valor hora.
          Las horas de esa gente no se cuentan en el gasto de personal.
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-ahg-text/50">Cargando…</p>
      ) : !puestos.length ? (
        <div className="card p-8 text-center text-sm text-ahg-text/50">
          Todavía no hay empleados con puesto cargado. Asignales el puesto en Empleados.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-ahg-bg border-b border-ahg-accent/30">
              <tr>
                <th className="table-th">Local</th>
                <th className="table-th">Puesto</th>
                <th className="table-th text-right">Valor hora</th>
                <th className="table-th">Rige desde</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {puestos.map(p => {
                const clave = `${p.local_id}|${p.puesto}`;
                const v = actual[clave];
                const enEdicion = editando === clave;
                return (
                  <tr key={clave} className="border-b border-ahg-accent/20">
                    <td className="table-td">{p.local_nombre}</td>
                    <td className="table-td capitalize font-medium">{p.puesto}</td>
                    <td className="table-td text-right">
                      {enEdicion ? (
                        <input
                          className="input text-right tabular-nums w-28 ml-auto" inputMode="numeric" autoFocus
                          value={monto === '' ? '' : money.format(monto)}
                          onChange={e => setMonto(soloNumero(e.target.value))}
                          onKeyDown={e => e.key === 'Enter' && guardar(p.local_id, p.puesto)}
                        />
                      ) : v ? (
                        <span className="tabular-nums font-medium">$ {money.format(v.valor_hora)}</span>
                      ) : (
                        <span className="text-amber-600 text-sm">sin cargar</span>
                      )}
                    </td>
                    <td className="table-td text-xs text-ahg-text/50">
                      {v ? FECHA.format(new Date(`${v.vigente_desde.slice(0, 10)}T12:00:00`)) : '—'}
                    </td>
                    <td className="table-td text-right whitespace-nowrap">
                      {enEdicion ? (
                        <>
                          <button onClick={() => guardar(p.local_id, p.puesto)}
                                  className="text-sm font-medium text-ahg-primary hover:underline mr-3">
                            Guardar
                          </button>
                          <button onClick={() => { setEditando(null); setMonto(''); }}
                                  className="text-sm text-ahg-text/50 hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditando(clave); setMonto(v ? Number(v.valor_hora) : ''); setError(''); }}
                          className="text-sm font-medium text-ahg-primary hover:underline"
                        >
                          {v ? 'Cambiar' : 'Cargar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
