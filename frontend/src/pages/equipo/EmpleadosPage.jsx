import { useEffect, useState } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { AREAS, AREA_LABEL, PUESTOS_POR_AREA, puestoReportaPorDefecto, esDeRed } from '../../utils/roles';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const soloNum = s => { const x = String(s ?? '').replace(/[^\d]/g, ''); return x === '' ? '' : Number(x); };

function Modal({ empleado, locales, onClose, onSaved }) {
  const esEdicion = !!empleado?.id;
  const [form, setForm] = useState({
    nombre: '', local_id_principal: locales[0]?.id || '',
    area: 'tienda', puesto: '', carga_reporte: true, ...empleado,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function cambiarPuesto(puesto) {
    setForm(f => ({ ...f, puesto, carga_reporte: puestoReportaPorDefecto(puesto) }));
  }
  function cambiarArea(area) {
    setForm(f => ({ ...f, area, puesto: '', carga_reporte: true }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      if (esEdicion) await api.put(`/empleados/${empleado.id}`, form);
      else           await api.post('/empleados', form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <form onSubmit={guardar} className="card w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {esEdicion ? 'Editar empleado' : 'Nuevo empleado'}
        </h2>
        {error && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

        <div>
          <label className="label">Nombre completo</label>
          <input className="input" value={form.nombre} required
                 onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
        </div>

        <div>
          <label className="label">Local</label>
          <select className="input" value={form.local_id_principal} required
                  onChange={e => setForm(f => ({ ...f, local_id_principal: e.target.value }))}>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Área</label>
            <select className="input" value={form.area} onChange={e => cambiarArea(e.target.value)}>
              {AREAS.map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Puesto</label>
            <select className="input" value={form.puesto || ''} onChange={e => cambiarPuesto(e.target.value)}>
              <option value="">Sin definir</option>
              {(PUESTOS_POR_AREA[form.area] || []).map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={`rounded-lg border p-3 ${form.carga_reporte ? 'border-ahg-accent/50 bg-ahg-accent/10' : 'border-stone-200 bg-stone-50'}`}>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.carga_reporte}
                   onChange={e => setForm(f => ({ ...f, carga_reporte: e.target.checked }))} />
            <span>
              <span className="block text-sm font-medium">Carga el reporte de su turno</span>
              <span className="block text-xs text-ahg-text/50 mt-0.5">
                {form.carga_reporte
                  ? 'Va a necesitar un usuario para entrar y completarlo.'
                  : 'No entra al sistema. Se le cargan horas y turnos igual.'}
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EmpleadosPage() {
  const { user } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [locales, setLocales]     = useState([]);
  const [filtro, setFiltro]       = useState('');
  const [modal, setModal]         = useState(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [editHora, setEditHora]   = useState(null);
  const [monto, setMonto]         = useState('');

  const puedeEditar = esDeRed(user);

  function cargar() {
    setCargando(true);
    Promise.all([
      api.get('/empleados', { params: filtro ? { local_id: filtro } : {} }),
      api.get('/locales'),
    ]).then(([e, l]) => {
      setEmpleados(e.data.data);
      setLocales(l.data.data.filter(x => x.activo));
      setError('');
    }).catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los empleados'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [filtro]);

  async function guardarHora(id) {
    if (!(Number(monto) > 0)) { setError('El valor tiene que ser mayor a cero'); return; }
    try {
      await api.put(`/empleados/${id}/valor-hora`, { valor_hora: Number(monto) });
      setEditHora(null); setMonto(''); setError('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el valor hora');
    }
  }

  async function alternarActivo(e) {
    await api.put(`/empleados/${e.id}`, { activo: !e.activo });
    cargar();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#45484c' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
              Alfalca · Equipo
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Empleados y horas
            </h1>
          </div>
          {puedeEditar && (
            <button onClick={() => setModal({})}
                    className="bg-white text-ahg-primary font-semibold px-4 py-2 rounded-lg text-sm hover:bg-white/90">
              + Nuevo empleado
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select className="input w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="">Todos los locales</option>
          {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <span className="text-sm text-ahg-text/50">
          {empleados.filter(e => e.activo).length} activos
        </span>
      </div>

      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="card overflow-x-auto">
        {cargando ? (
          <p className="p-8 text-center text-sm text-ahg-text/50">Cargando…</p>
        ) : !empleados.length ? (
          <p className="p-8 text-center text-sm text-ahg-text/50">Todavía no hay empleados cargados.</p>
        ) : (
          <table className="w-full">
            <thead className="bg-ahg-bg border-b border-ahg-accent/30">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Local</th>
                <th className="table-th">Puesto</th>
                <th className="table-th text-right">Valor hora</th>
                <th className="table-th">Acceso</th>
                {puedeEditar && <th className="table-th"></th>}
              </tr>
            </thead>
            <tbody>
              {empleados.map(e => (
                <tr key={e.id} className={`border-b border-ahg-accent/20 ${e.activo ? '' : 'opacity-50'}`}>
                  <td className="table-td font-medium">
                    {e.nombre}
                    {!e.activo && <span className="ml-2 text-xs text-red-600">inactivo</span>}
                  </td>
                  <td className="table-td text-ahg-text/70">{e.local_nombre}</td>
                  <td className="table-td text-ahg-text/70">
                    <span className="capitalize">{e.puesto || '—'}</span>
                    <span className="block text-xs text-ahg-text/40">{AREA_LABEL[e.area] || e.area}</span>
                  </td>
                  <td className="table-td text-right">
                    {editHora === e.id ? (
                      <span className="flex items-center gap-1.5 justify-end">
                        <input className="input w-24 text-right tabular-nums !py-1" autoFocus
                               inputMode="numeric"
                               value={monto === '' ? '' : money.format(monto)}
                               onChange={ev => setMonto(soloNum(ev.target.value))}
                               onKeyDown={ev => ev.key === 'Enter' && guardarHora(e.id)} />
                        <button onClick={() => guardarHora(e.id)}
                                className="text-xs font-semibold text-ahg-primary hover:underline">ok</button>
                        <button onClick={() => { setEditHora(null); setMonto(''); }}
                                className="text-xs text-ahg-text/40 hover:underline">✕</button>
                      </span>
                    ) : (
                      <button
                        disabled={!puedeEditar}
                        onClick={() => { setEditHora(e.id); setMonto(e.valor_hora ? Number(e.valor_hora) : ''); setError(''); }}
                        className={`tabular-nums ${e.valor_hora ? 'font-medium' : 'text-amber-600'} ${puedeEditar ? 'hover:text-ahg-primary hover:underline' : ''}`}>
                        {e.valor_hora ? `$ ${money.format(e.valor_hora)}` : 'sin cargar'}
                      </button>
                    )}
                  </td>
                  <td className="table-td text-xs">
                    {!e.carga_reporte ? (
                      <span className="inline-flex px-2 py-0.5 font-medium rounded-full bg-stone-100 text-stone-500">
                        No reporta
                      </span>
                    ) : e.usuario_email ? (
                      <span className="text-ahg-text/60">{e.usuario_email}</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 font-medium rounded-full bg-amber-100 text-amber-800">
                        Falta usuario
                      </span>
                    )}
                  </td>
                  {puedeEditar && (
                    <td className="table-td text-right whitespace-nowrap space-x-3">
                      <button onClick={() => setModal(e)}
                              className="text-sm text-ahg-primary font-medium hover:underline">Editar</button>
                      <button onClick={() => alternarActivo(e)}
                              className={`text-sm font-medium hover:underline ${e.activo ? 'text-red-600' : 'text-green-700'}`}>
                        {e.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <Modal empleado={modal?.id ? modal : null} locales={locales}
               onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar(); }} />
      )}
    </div>
  );
}
