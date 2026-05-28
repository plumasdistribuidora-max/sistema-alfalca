import { Fragment, useEffect, useState } from 'react';
import api from '../api';
import { formatDateTime, formatDate, formatNumber } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';

const STATUS_CLASS = {
  completado: 'bg-green-100 text-green-700',
  procesando: 'bg-yellow-100 text-yellow-700',
  error:      'bg-red-100 text-red-700',
};

const TIPO_LABEL = {
  ventas: 'Ventas',
  stock:  'Stock',
  gastos: 'Gastos',
};

function ModalBorrarA({ row, borrando, onCancel, onConfirm, onGoB }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
        <h2 className="text-lg font-bold text-stone-900">¿Quitar del historial?</h2>
        <p className="text-sm text-stone-600">
          Se eliminará el registro de este import de la lista.
          El archivo Excel guardado en R2 y los datos del período (tickets, ítems, pagos, etc.)
          {' '}<strong>se mantienen sin cambios</strong>.
        </p>
        <div className="bg-stone-50 rounded-lg px-4 py-3 text-xs text-stone-500 space-y-1">
          <p><span className="font-medium">Archivo:</span> {row.archivo_nombre}</p>
          <p><span className="font-medium">Local:</span> {row.local_nombre}</p>
          {row.fecha_desde && (
            <p><span className="font-medium">Período:</span> {formatDate(row.fecha_desde)} → {formatDate(row.fecha_hasta)}</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1" disabled={borrando}>
            Cancelar
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1" disabled={borrando}>
            {borrando ? 'Quitando…' : 'Quitar del historial'}
          </button>
        </div>
        <div className="text-center pt-1">
          <button onClick={onGoB} className="text-xs text-red-500 hover:underline" disabled={borrando}>
            Quiero borrar también los datos del período →
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalBorrarB({ row, borrando, onCancel, onConfirm }) {
  const [input, setInput] = useState('');
  const confirmado = input === 'BORRAR';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
        <h2 className="text-lg font-bold text-red-700">Borrado destructivo — Irreversible</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 space-y-2">
          <p className="font-semibold">Se eliminarán permanentemente:</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            <li>Todos los tickets del período importado</li>
            <li>Sus ítems, pagos, descuentos y datos fiscales</li>
            <li>El archivo Excel guardado en R2</li>
            <li>El registro del historial</li>
          </ul>
          <p className="font-semibold">Esta acción no se puede deshacer.</p>
        </div>
        <div className="bg-stone-50 rounded-lg px-4 py-3 text-xs text-stone-500 space-y-1">
          <p><span className="font-medium">Archivo:</span> {row.archivo_nombre}</p>
          <p><span className="font-medium">Local:</span> {row.local_nombre}</p>
          {row.fecha_desde && (
            <p><span className="font-medium">Período:</span> {formatDate(row.fecha_desde)} → {formatDate(row.fecha_hasta)}</p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700">
            Para confirmar, escribí <span className="font-mono font-bold">BORRAR</span>:
          </label>
          <input
            type="text"
            className="input w-full"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="BORRAR"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1" disabled={borrando}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmado || borrando}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
              ${confirmado && !borrando
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`}
          >
            {borrando ? 'Borrando…' : 'Borrar todo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistorialImports() {
  const { user } = useAuth();
  const [locales, setLocales]         = useState([]);
  const [data, setData]               = useState([]);
  const [localFiltro, setLocalFiltro] = useState('');
  const [loading, setLoading]         = useState(true);
  const [expandErr, setExpandErr]     = useState(null);
  const [modalA, setModalA]           = useState(null);
  const [modalB, setModalB]           = useState(null);
  const [borrando, setBorrando]       = useState(false);
  const [descargando, setDescargando] = useState(null);
  const [cancelando, setCancelando]   = useState(false);
  const [cancelMsg, setCancelMsg]     = useState(null);

  useEffect(() => {
    api.get('/locales').then(r => setLocales(r.data.data.filter(l => l.activo)));
  }, []);

  function load() {
    setLoading(true);
    api.get('/imports/historial')
      .then(r => setData(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDescargar(row) {
    if (!row.archivo_r2_key) return;
    setDescargando(row.id);
    try {
      const res = await api.get(`/imports/historial/${row.id}/descargar`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = row.archivo_nombre || `import-${row.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar el archivo.');
    } finally {
      setDescargando(null);
    }
  }

  async function ejecutarBorrado(nivel) {
    const row = nivel === 'A' ? modalA : modalB;
    setBorrando(true);
    try {
      await api.delete(`/imports/historial/${row.id}`, { params: { nivel } });
      setModalA(null);
      setModalB(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al borrar');
    } finally {
      setBorrando(false);
    }
  }

  async function cancelarTrabados() {
    setCancelando(true);
    setCancelMsg(null);
    try {
      const res = await api.patch('/ventas/imports/cancelar-procesando');
      setCancelMsg({ ok: true, text: `${res.data.cancelados} import(s) cancelados` });
      load();
    } catch (err) {
      setCancelMsg({ ok: false, text: err?.response?.data?.error || 'Error al cancelar' });
    } finally {
      setCancelando(false);
      setTimeout(() => setCancelMsg(null), 5000);
    }
  }

  const filtered = localFiltro
    ? data.filter(r => String(r.local_id) === localFiltro)
    : data;

  return (
    <div className="space-y-4 max-w-6xl">
      {modalA && (
        <ModalBorrarA
          row={modalA}
          borrando={borrando}
          onCancel={() => setModalA(null)}
          onConfirm={() => ejecutarBorrado('A')}
          onGoB={() => { setModalB(modalA); setModalA(null); }}
        />
      )}
      {modalB && (
        <ModalBorrarB
          row={modalB}
          borrando={borrando}
          onCancel={() => setModalB(null)}
          onConfirm={() => ejecutarBorrado('B')}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-stone-900">Historial de imports</h1>
        <div className="flex items-center gap-2">
          <select
            className="input text-sm w-52"
            value={localFiltro}
            onChange={e => setLocalFiltro(e.target.value)}
          >
            <option value="">Todos los locales</option>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <button onClick={load} className="btn-secondary text-sm">Actualizar</button>
          {user?.rol?.toLowerCase() === 'admin' && (
            <button
              onClick={cancelarTrabados}
              disabled={cancelando}
              title="Marca como error todos los imports que quedaron en estado 'procesando'"
              className="btn-secondary text-sm text-yellow-700 disabled:opacity-60"
            >
              {cancelando ? 'Cancelando…' : 'Cancelar trabados'}
            </button>
          )}
        </div>
      </div>

      {cancelMsg && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${
          cancelMsg.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {cancelMsg.ok ? '✓ ' : '✕ '}{cancelMsg.text}
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-stone-400">Cargando…</div>
        ) : (
          <table className="w-full">
            <thead className="bg-stone-50">
              <tr>
                <th className="table-th">Fecha</th>
                <th className="table-th">Tipo</th>
                <th className="table-th">Local</th>
                <th className="table-th">Archivo</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th text-right">Nuevas</th>
                <th className="table-th text-right">Actualizadas</th>
                <th className="table-th text-right">Errores</th>
                <th className="table-th">Período</th>
                <th className="table-th">Usuario</th>
                <th className="table-th">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map(row => (
                <Fragment key={row.id}>
                  <tr className="hover:bg-stone-50">
                    <td className="table-td whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</td>
                    <td className="table-td">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-stone-100 text-stone-700">
                        {TIPO_LABEL[row.tipo] || row.tipo}
                      </span>
                    </td>
                    <td className="table-td text-xs text-stone-500">{row.local_nombre}</td>
                    <td className="table-td max-w-xs">
                      <p className="text-xs text-stone-700 truncate" title={row.archivo_nombre}>
                        {row.archivo_nombre}
                      </p>
                    </td>
                    <td className="table-td">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_CLASS[row.status] || 'bg-stone-100 text-stone-500'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="table-td text-right text-sm">{formatNumber(row.filas_total)}</td>
                    <td className="table-td text-right text-sm text-green-700">{formatNumber(row.filas_insertadas)}</td>
                    <td className="table-td text-right text-sm text-blue-700">{formatNumber(row.filas_actualizadas)}</td>
                    <td className="table-td text-right">
                      {row.filas_error > 0 ? (
                        <button
                          onClick={() => setExpandErr(expandErr === row.id ? null : row.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          {formatNumber(row.filas_error)} ▾
                        </button>
                      ) : (
                        <span className="text-sm text-stone-400">0</span>
                      )}
                    </td>
                    <td className="table-td text-xs text-stone-500 whitespace-nowrap">
                      {row.fecha_desde && row.fecha_hasta
                        ? `${formatDate(row.fecha_desde)} → ${formatDate(row.fecha_hasta)}`
                        : '—'}
                    </td>
                    <td className="table-td text-xs text-stone-500">{row.usuario_nombre || '—'}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        {row.archivo_r2_key ? (
                          <button
                            onClick={() => handleDescargar(row)}
                            disabled={descargando === row.id}
                            className="text-xs text-ahg-primary hover:underline disabled:opacity-50 whitespace-nowrap"
                          >
                            {descargando === row.id ? 'Descargando…' : 'Descargar'}
                          </button>
                        ) : (
                          <span className="text-xs text-stone-300">Sin archivo</span>
                        )}
                        <button
                          onClick={() => setModalA(row)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandErr === row.id && row.error_detail && (
                    <tr>
                      <td colSpan={12} className="px-4 pb-3">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-mono overflow-x-auto">
                          <pre>{JSON.stringify(row.error_detail, null, 2)}</pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={12} className="table-td text-center text-stone-400 py-10">
                    Sin imports registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
