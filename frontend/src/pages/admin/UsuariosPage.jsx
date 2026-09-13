import { useState, useEffect } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import {
  ROLES, ROL_LABEL, ROL_DESCRIPCION, ROL_POR_AREA,
  AREA_LABEL, rolLabel, esDueno,
} from '../../utils/roles';

const VACIO = {
  email: '', password: '', nombre: '', rol: ROLES.EMPLEADO_TIENDA,
  empleado_id: '', locales_permitidos: [],
};

function Badge({ rol }) {
  const color = {
    [ROLES.ADMIN]:             'bg-ahg-primary text-white',
    [ROLES.ENCARGADO_GENERAL]: 'bg-ahg-secondary text-white',
    [ROLES.EMPLEADO_TIENDA]:   'bg-ahg-accent/40 text-ahg-primary',
    [ROLES.ENCARGADO_CAFE]:    'bg-amber-100 text-amber-800',
    [ROLES.ENCARGADO_COCINA]:  'bg-emerald-100 text-emerald-800',
  }[rol] || 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {rolLabel(rol)}
    </span>
  );
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const [usuarios,  setUsuarios]  = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [locales,   setLocales]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [aviso,     setAviso]     = useState('');

  const [form,      setForm]      = useState(VACIO);
  const [editando,  setEditando]  = useState(null);   // id o null
  const [abierto,   setAbierto]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);

  // Reset de contraseña
  const [resetId,   setResetId]   = useState(null);
  const [resetPass, setResetPass] = useState('');

  const rolesDisponibles = Object.values(ROLES)
    .filter(r => r !== ROLES.ADMIN || esDueno(user));

  async function cargar() {
    setLoading(true);
    try {
      const [u, e, l] = await Promise.all([
        api.get('/usuarios', { params: { incluir_inactivos: verInactivos } }),
        api.get('/empleados'),
        api.get('/locales'),
      ]);
      setUsuarios(u.data.data);
      setEmpleados(e.data.data);
      setLocales(l.data.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [verInactivos]);

  function nuevo() {
    setForm(VACIO);
    setEditando(null);
    setAbierto(true);
    setError('');
  }

  function editar(u) {
    setForm({
      email: u.email, password: '', nombre: u.nombre, rol: u.rol,
      empleado_id: u.empleado_id || '',
      locales_permitidos: u.locales_permitidos || [],
    });
    setEditando(u.id);
    setAbierto(true);
    setError('');
  }

  // Al elegir un empleado, propone el rol y el local que le corresponden por su área.
  function elegirEmpleado(id) {
    const emp = empleados.find(e => String(e.id) === String(id));
    setForm(f => ({
      ...f,
      empleado_id: id,
      rol:    emp && !editando ? (ROL_POR_AREA[emp.area] || f.rol) : f.rol,
      nombre: emp && !f.nombre ? emp.nombre : f.nombre,
      locales_permitidos: emp ? [emp.local_id_principal] : f.locales_permitidos,
    }));
  }

  function toggleLocal(id) {
    setForm(f => ({
      ...f,
      locales_permitidos: f.locales_permitidos.includes(id)
        ? f.locales_permitidos.filter(x => x !== id)
        : [...f.locales_permitidos, id],
    }));
  }

  async function guardar(ev) {
    ev.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const payload = {
        nombre: form.nombre,
        rol:    form.rol,
        empleado_id: form.empleado_id || null,
        locales_permitidos: form.locales_permitidos,
      };
      if (editando) {
        await api.put(`/usuarios/${editando}`, { ...payload, email: form.email });
        setAviso(`Usuario de ${form.nombre} actualizado`);
      } else {
        await api.post('/usuarios', { ...payload, email: form.email, password: form.password });
        setAviso(`${form.nombre} ya puede entrar con ${form.email}`);
      }
      setAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarPassword(ev) {
    ev.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.patch(`/usuarios/${resetId}/password`, { password: resetPass });
      setAviso('Contraseña cambiada. Pasásela a la persona por un canal seguro.');
      setResetId(null);
      setResetPass('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contraseña');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(u) {
    const accion = u.activo ? 'dar de baja' : 'reactivar';
    if (!confirm(`¿Seguro que querés ${accion} el acceso de ${u.nombre}?`)) return;
    try {
      if (u.activo) await api.delete(`/usuarios/${u.id}`);
      else          await api.put(`/usuarios/${u.id}`, { activo: true });
      setAviso(`Acceso de ${u.nombre} ${u.activo ? 'dado de baja' : 'reactivado'}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No se pudo ${accion}`);
    }
  }

  // Los que no cargan reporte no necesitan usuario, así que ni aparecen en la lista.
  const empleadosLibres = empleados.filter(
    e => e.activo && e.carga_reporte && (!e.usuario_id || String(e.id) === String(form.empleado_id))
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Usuarios y accesos
            </h1>
            <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
              Quién entra al sistema y qué puede ver
            </p>
          </div>
          <button onClick={nuevo} className="bg-white text-ahg-primary font-semibold px-4 py-2 rounded-lg text-sm hover:bg-white/90">
            + Nuevo usuario
          </button>
        </div>
      </div>

      {aviso && (
        <div className="card px-4 py-3 border-green-300 bg-green-50 text-green-800 text-sm flex justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} className="font-bold">×</button>
        </div>
      )}
      {error && !abierto && !resetId && (
        <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <label className="flex items-center gap-2 text-sm text-ahg-text/70">
        <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
        Mostrar también los dados de baja
      </label>

      {/* Listado */}
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-ahg-text/50">Cargando…</p>
        ) : !usuarios.length ? (
          <p className="p-6 text-sm text-ahg-text/50">Todavía no hay usuarios cargados.</p>
        ) : (
          <table className="w-full">
            <thead className="bg-ahg-bg border-b border-ahg-accent/30">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Email</th>
                <th className="table-th">Rol</th>
                <th className="table-th">Local</th>
                <th className="table-th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className={`border-b border-ahg-accent/20 ${u.activo ? '' : 'opacity-50'}`}>
                  <td className="table-td font-medium">
                    {u.nombre}
                    {!u.activo && <span className="ml-2 text-xs text-red-600">de baja</span>}
                    {u.id === user?.id && <span className="ml-2 text-xs text-ahg-text/40">vos</span>}
                  </td>
                  <td className="table-td text-ahg-text/70">{u.email}</td>
                  <td className="table-td"><Badge rol={u.rol} /></td>
                  <td className="table-td text-ahg-text/70">
                    {u.local_nombre || (u.rol === ROLES.ADMIN || u.rol === ROLES.ENCARGADO_GENERAL
                      ? 'Toda la red' : '—')}
                    {u.empleado_area && (
                      <span className="block text-xs text-ahg-text/40">{AREA_LABEL[u.empleado_area]}</span>
                    )}
                  </td>
                  <td className="table-td text-right whitespace-nowrap space-x-3">
                    <button onClick={() => editar(u)} className="text-ahg-primary text-sm font-medium hover:underline">
                      Editar
                    </button>
                    <button onClick={() => { setResetId(u.id); setResetPass(''); setError(''); }}
                            className="text-ahg-primary text-sm font-medium hover:underline">
                      Contraseña
                    </button>
                    {u.id !== user?.id && (
                      <button onClick={() => cambiarEstado(u)}
                              className={`text-sm font-medium hover:underline ${u.activo ? 'text-red-600' : 'text-green-700'}`}>
                        {u.activo ? 'Dar de baja' : 'Reactivar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal alta / edición */}
      {abierto && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center p-4 overflow-y-auto">
          <form onSubmit={guardar} className="card w-full max-w-lg p-6 my-8 space-y-4">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {editando ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>

            {error && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

            <div>
              <label className="label">Empleado</label>
              <select className="input" value={form.empleado_id} onChange={e => elegirEmpleado(e.target.value)}>
                <option value="">Sin empleado asociado (dueño o encargado general)</option>
                {empleadosLibres.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} — {e.local_nombre} · {AREA_LABEL[e.area] || e.area}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ahg-text/50 mt-1">
                Atarlo a un empleado hace que el reporte quede firmado con su nombre.
                Solo aparecen los que todavía no tienen usuario.
              </p>
            </div>

            <div>
              <label className="label">Nombre</label>
              <input className="input" value={form.nombre} required
                     onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>

            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} required
                     onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              {editando && (
                <p className="text-xs text-ahg-text/50 mt-1">
                  Si lo cambiás, la persona entra con el mail nuevo desde la próxima vez.
                </p>
              )}
            </div>

            {!editando && (
              <div>
                <label className="label">Contraseña inicial</label>
                <input className="input" type="text" value={form.password} required minLength={8}
                       onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <p className="text-xs text-ahg-text/50 mt-1">
                  Mínimo 8 caracteres. Se la pasás a la persona y la puede cambiar después.
                </p>
              </div>
            )}

            <div>
              <label className="label">Rol</label>
              <select className="input" value={form.rol}
                      onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                {rolesDisponibles.map(r => (
                  <option key={r} value={r}>{ROL_LABEL[r]}</option>
                ))}
              </select>
              <p className="text-xs text-ahg-text/50 mt-1">{ROL_DESCRIPCION[form.rol]}</p>
            </div>

            <div>
              <label className="label">Locales a los que accede</label>
              <div className="space-y-1.5">
                {locales.map(l => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox"
                           checked={form.locales_permitidos.includes(l.id)}
                           onChange={() => toggleLocal(l.id)} />
                    {l.nombre}
                  </label>
                ))}
              </div>
              <p className="text-xs text-ahg-text/50 mt-1">
                Los dueños y el encargado general ven los cinco sin importar lo que marques acá.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={guardando} className="btn-primary">
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal contraseña */}
      {resetId && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <form onSubmit={cambiarPassword} className="card w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Cambiar contraseña
            </h2>
            {error && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
            <div>
              <label className="label">Contraseña nueva</label>
              <input className="input" type="text" value={resetPass} required minLength={8}
                     onChange={e => setResetPass(e.target.value)} />
              <p className="text-xs text-ahg-text/50 mt-1">Mínimo 8 caracteres.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setResetId(null)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={guardando} className="btn-primary">
                {guardando ? 'Cambiando…' : 'Cambiar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
