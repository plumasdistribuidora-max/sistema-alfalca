import { useEffect, useRef, useState } from 'react';
import api from '../../api';

function ResultBadge({ label, value, color }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm font-medium mt-0.5">{label}</p>
    </div>
  );
}

export default function VentasImportar() {
  const [locales, setLocales]   = useState([]);
  const [localId, setLocalId]   = useState('');
  const [file, setFile]         = useState(null);
  const [status, setStatus]     = useState('idle'); // idle | uploading | done | error
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef                 = useRef();

  useEffect(() => {
    api.get('/locales').then(r => {
      const activos = r.data.data.filter(l => l.activo);
      setLocales(activos);
      if (activos.length) setLocalId(String(activos[0].id));
    });
  }, []);

  function handleFileDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
  }

  function reset() {
    setFile(null); setStatus('idle'); setResult(null); setError(''); setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !localId) return;

    setStatus('uploading'); setError(''); setProgress(0);

    const fd = new FormData();
    fd.append('archivo', file);
    fd.append('local_id', localId);

    try {
      const res = await api.post('/ventas/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      setResult(res.data.data);
      setStatus('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al procesar el archivo');
      setStatus('error');
    }
  }

  const selectedLocal = locales.find(l => String(l.id) === localId);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-stone-900">Importar ventas desde Excel</h1>

      {status === 'done' && result ? (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">✓</span>
              <div>
                <p className="font-semibold text-stone-900">Import completado</p>
                <p className="text-sm text-stone-500">
                  {selectedLocal?.nombre} · {result.fecha_desde} → {result.fecha_hasta}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <ResultBadge label="Tickets"       value={result.tickets_insertados + result.tickets_actualizados} color="bg-stone-100 text-stone-800" />
              <ResultBadge label="Insertados"    value={result.tickets_insertados}   color="bg-green-100 text-green-800" />
              <ResultBadge label="Actualizados"  value={result.tickets_actualizados} color="bg-blue-100 text-blue-800" />
              <ResultBadge label="Ítems/Adiciones" value={result.items_insertados}  color="bg-violet-100 text-violet-800" />
              <ResultBadge label="Pagos"         value={result.pagos_insertados}     color="bg-indigo-100 text-indigo-800" />
              <ResultBadge label="Fiscales"      value={result.fiscales_insertados}  color="bg-sky-100 text-sky-800" />
              <ResultBadge label="Descuentos"    value={result.descuentos_insertados} color="bg-amber-100 text-amber-800" />
              <ResultBadge label="Productos catálogo" value={result.productos_nuevos_catalogo} color="bg-emerald-100 text-emerald-800" />
              <ResultBadge label="Docenas totales" value={result.docenas_totales_periodo > 0 ? result.docenas_totales_periodo.toFixed(2) : '—'} color="bg-purple-100 text-purple-800" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary">Importar otro archivo</button>
            <a href={`/ventas/dashboard?local_id=${localId}`} className="btn-primary">Ver dashboard del local →</a>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selector local */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-stone-800">1. Seleccioná el local</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {locales.map(l => (
                <label key={l.id} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors
                  ${String(l.id) === localId ? 'border-ahg-secondary bg-ahg-accent/10' : 'border-stone-200 hover:bg-stone-50'}`}>
                  <input type="radio" name="local" value={l.id} checked={String(l.id) === localId} onChange={e => setLocalId(e.target.value)} className="accent-ahg-primary" />
                  <div>
                    <p className="text-sm font-medium text-stone-800">{l.nombre}</p>
                    <p className="text-xs text-stone-400">{l.tipo}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Upload */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-stone-800">2. Subí el archivo Excel del POS</h2>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                ${file ? 'border-ahg-secondary bg-ahg-accent/10' : 'border-stone-300 hover:border-ahg-secondary hover:bg-stone-50'}`}
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileDrop} />
              {file ? (
                <div>
                  <p className="font-medium text-ahg-primary">{file.name}</p>
                  <p className="text-sm text-stone-400 mt-1">{(file.size / 1024).toFixed(0)} KB · listo para importar</p>
                  <button type="button" onClick={e => { e.stopPropagation(); reset(); }} className="mt-2 text-xs text-red-500 hover:underline">
                    Quitar archivo
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-4xl mb-2">↑</p>
                  <p className="font-medium text-stone-700">Arrastrá el archivo o hacé click para seleccionar</p>
                  <p className="text-sm text-stone-400 mt-1">.xlsx o .xls exportado desde Bistrosoft</p>
                </div>
              )}
            </div>

            <div className="bg-stone-50 rounded-lg px-4 py-3 text-xs text-stone-500 space-y-1">
              <p className="font-medium text-stone-600">Formato esperado:</p>
              <p>• El header real debe estar en la fila 4 (filas 1–3 son metadata del POS)</p>
              <p>• Columnas mínimas: Id, Fecha, Estado, Medio de Pago, Total, Fiscal, Camarero / Repartidor</p>
              <p>• Solo tickets con Estado = "Cerrada" cuentan como venta real</p>
            </div>
          </div>

          {/* Progress */}
          {status === 'uploading' && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-stone-700">Procesando...</p>
                <p className="text-sm text-stone-500">{progress}%</p>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-ahg-primary h-2 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full py-3 text-base"
            disabled={!file || !localId || status === 'uploading'}
          >
            {status === 'uploading' ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </form>
      )}
    </div>
  );
}
