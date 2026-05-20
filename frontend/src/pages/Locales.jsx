import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const TIPOS = ['alfajores', 'cafeteria'];

function Modal({ local, onClose, onSaved }) {
  const isEdit = !!local?.id;
  const [form, setForm]     = useState({ codigo: '', nombre: '', tipo: 'alfajores', direccion: '', ...local });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (isEdit) await api.put(`/locales/${local.id}`, form);
      else        await api.post('/locales', form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-semibold text-stone-900">{isEdit ? 'Editar local' : 'Nuevo local'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          {!isEdit && (
            <div>
              <label className="label">Código (único)</label>
              <input className="input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="ej: amigorena" required />
            </div>
          )}
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Dirección</label>
            <input className="input" value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
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

export default function Locales() {
  const [locales, setLocales] = useState([]);
  const [modal, setModal]     = useState(null); // null | {} | {id,...}
  const [loading, setLoading] = useState(true);
  const { user }              = useAuth();
  const isAdmin               = user?.rol === 'admin';

  function load() {
    setLoading(true);
    api.get('/locales').then(r => setLocales(r.data.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleActivo(local) {
    await api.put(`/locales/${local.id}`, { activo: !local.activo });
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-900">Locales</h1>
        {isAdmin && (
          <button onClick={() => setModal({})} className="btn-primary">+ Nuevo local</button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-stone-400">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-stone-50">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Código</th>
                <th className="table-th">Tipo</th>
                <th className="table-th">Dirección</th>
                <th className="table-th">Estado</th>
                {isAdmin && <th className="table-th">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {locales.map(l => (
                <tr key={l.id} className="hover:bg-stone-50">
                  <td className="table-td font-medium">{l.nombre}</td>
                  <td className="table-td text-stone-500 font-mono text-xs">{l.codigo}</td>
                  <td className="table-td">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${l.tipo === 'cafeteria' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {l.tipo}
                    </span>
                  </td>
                  <td className="table-td text-stone-500">{l.direccion || '-'}</td>
                  <td className="table-td">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${l.activo ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                      {l.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="table-td">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(l)} className="text-xs text-ahg-secondary hover:underline">Editar</button>
                        <button onClick={() => toggleActivo(l)} className={`text-xs hover:underline ${l.activo ? 'text-red-500' : 'text-green-600'}`}>
                          {l.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <Modal local={modal?.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
