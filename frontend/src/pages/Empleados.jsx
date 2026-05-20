import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function Modal({ empleado, locales, onClose, onSaved }) {
  const isEdit   = !!empleado?.id;
  const [form, setForm]     = useState({ nombre: '', nombre_pos: '', local_id_principal: locales[0]?.id || '', ...empleado });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (isEdit) await api.put(`/empleados/${empleado.id}`, form);
      else        await api.post('/empleados', form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-semibold text-stone-900">{isEdit ? 'Editar empleado' : 'Nuevo empleado'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="label">Nombre completo</label>
            <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Nombre en el POS <span className="text-stone-400 font-normal">(exacto, en minúsculas)</span></label>
            <input className="input font-mono" value={form.nombre_pos} onChange={e => setForm(f => ({ ...f, nombre_pos: e.target.value.toLowerCase() }))} placeholder="ej: cuca" required />
            <p className="text-xs text-stone-400 mt-1">Se usa para auto-matchear tickets. Debe coincidir exactamente con el valor en la columna Camarero del POS.</p>
          </div>
          <div>
            <label className="label">Local principal</label>
            <select className="input" value={form.local_id_principal} onChange={e => setForm(f => ({ ...f, local_id_principal: e.target.value }))} required>
              {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [locales, setLocales]     = useState([]);
  const [sinMatch, setSinMatch]   = useState({});
  const [localFiltro, setLocalFiltro] = useState('');
  const [modal, setModal]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const { user }                  = useAuth();
  const isAdmin                   = user?.rol === 'admin';

  function load() {
    setLoading(true);
    Promise.all([
      api.get('/empleados', { params: localFiltro ? { local_id: localFiltro } : {} }),
      api.get('/locales'),
    ]).then(([empRes, locRes]) => {
      setEmpleados(empRes.data.data);
      setLocales(locRes.data.data.filter(l => l.activo));
    }).finally(() => setLoading(false));
  }

  async function loadSinMatch() {
    const activeLocales = locales.filter(l => l.activo);
    const results = {};
    await Promise.all(activeLocales.map(async l => {
      const r = await api.get(`/empleados/sin-matchear/${l.id}`);
      if (r.data.data.length) results[l.id] = { local: l, nombres: r.data.data };
    }));
    setSinMatch(results);
  }

  useEffect(load, [localFiltro]);
  useEffect(() => { if (locales.length) loadSinMatch(); }, [locales]);

  async function toggleActivo(emp) {
    await api.put(`/empleados/${emp.id}`, { activo: !emp.activo });
    load();
  }

  const sinMatchEntries = Object.values(sinMatch);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-stone-900">Empleados</h1>
        <div className="flex gap-2">
          <select className="input w-auto text-sm" value={localFiltro} onChange={e => setLocalFiltro(e.target.value)}>
            <option value="">Todos los locales</option>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          {isAdmin && <button onClick={() => setModal({})} className="btn-primary">+ Nuevo empleado</button>}
        </div>
      </div>

      {/* Sin matchear */}
      {sinMatchEntries.length > 0 && (
        <div className="card border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800 mb-3">
            ⚠ Nombres en el POS sin empleado asignado
          </p>
          <div className="space-y-2">
            {sinMatchEntries.map(({ local, nombres }) => (
              <div key={local.id}>
                <p className="text-xs font-medium text-amber-700 mb-1">{local.nombre}</p>
                <div className="flex flex-wrap gap-2">
                  {nombres.map(n => (
                    <button
                      key={n}
                      onClick={() => setModal({ nombre_pos: n, local_id_principal: local.id })}
                      className="inline-flex items-center gap-1 bg-white border border-amber-300 text-amber-800 text-xs px-2 py-1 rounded-full hover:bg-amber-100 transition-colors"
                    >
                      <span className="font-mono">{n}</span>
                      <span>→ Crear</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-stone-400">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-stone-50">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Nombre POS</th>
                <th className="table-th">Local</th>
                <th className="table-th">Estado</th>
                {isAdmin && <th className="table-th">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {empleados.map(e => (
                <tr key={e.id} className="hover:bg-stone-50">
                  <td className="table-td font-medium">{e.nombre}</td>
                  <td className="table-td font-mono text-xs text-stone-500">{e.nombre_pos}</td>
                  <td className="table-td text-stone-600">{e.local_nombre}</td>
                  <td className="table-td">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${e.activo ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="table-td">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(e)} className="text-xs text-ahg-secondary hover:underline">Editar</button>
                        <button onClick={() => toggleActivo(e)} className={`text-xs hover:underline ${e.activo ? 'text-red-500' : 'text-green-600'}`}>
                          {e.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!empleados.length && (
                <tr><td colSpan={5} className="table-td text-center text-stone-400 py-8">Sin empleados cargados. Importá un Excel primero.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <Modal
          empleado={modal?.id ? modal : (modal?.nombre_pos ? modal : null)}
          locales={locales}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); loadSinMatch(); }}
        />
      )}
    </div>
  );
}
