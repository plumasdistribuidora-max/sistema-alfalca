import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MaestroDocenasPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [estado,        setEstado]        = useState(null);
  const [estadoLoading, setEstadoLoading] = useState(true);

  const [file,      setFile]      = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const fileRef        = useRef();
  const uploadTimer    = useRef();

  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);
  const reloadTimer = useRef();

  useEffect(() => {
    if (user && user.rol?.toLowerCase() !== 'admin') navigate('/', { replace: true });
  }, [user]);

  function loadEstado() {
    setEstadoLoading(true);
    api.get('/maestros/docenas/estado')
      .then(r => setEstado(r.data))
      .catch(() => setEstado(null))
      .finally(() => setEstadoLoading(false));
  }

  useEffect(() => { loadEstado(); }, []);

  function pickFile(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setUploadMsg({ ok: false, text: 'Formato no válido. Solo se aceptan archivos .xlsx' });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadMsg({ ok: false, text: 'Archivo demasiado grande (máximo 10 MB)' });
      return;
    }
    setUploadMsg(null);
    setFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer?.files?.[0]);
  }

  function handleFileChange(e) {
    pickFile(e.target.files?.[0]);
  }

  function clearFile() {
    setFile(null);
    setUploadMsg(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleUpload() {
    if (!file || uploading) return;
    const ok = window.confirm('Esto reemplaza el maestro actual en R2. ¿Continuar?');
    if (!ok) return;

    setUploading(true);
    setUploadMsg(null);
    clearTimeout(uploadTimer.current);

    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post('/maestros/docenas/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data;
      setUploadMsg({
        ok:   true,
        text: `Archivo subido y maestro recargado. ${d.productos} productos / ${d.variantes} variantes cargadas.`,
        hint: 'Recordá re-importar ventas para aplicar el matching.',
      });
      clearFile();
      loadEstado();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Error al subir';
      setUploadMsg({ ok: false, text: msg });
    } finally {
      setUploading(false);
      uploadTimer.current = setTimeout(() => setUploadMsg(null), 10000);
    }
  }

  async function handleDownload() {
    try {
      const res = await api.get('/maestros/docenas/download', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'Maestro_Productos_Docenas_ALFALCA.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error al descargar: ' + (err?.response?.data?.error || err.message));
    }
  }

  async function handleReload() {
    setReloading(true);
    setReloadMsg(null);
    clearTimeout(reloadTimer.current);
    try {
      const res = await api.post('/maestros/docenas/reload');
      const d   = res.data;
      setReloadMsg({ ok: true, text: `Maestro recargado: ${d.productos} productos, ${d.variantes} variantes` });
      loadEstado();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Error al recargar';
      setReloadMsg({ ok: false, text: msg });
    } finally {
      setReloading(false);
      reloadTimer.current = setTimeout(() => setReloadMsg(null), 6000);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-stone-900">Maestro de docenas</h1>
        <p className="text-stone-500 text-sm mt-1 max-w-lg">
          Subí el Excel del maestro y el sistema actualiza el diccionario de equivalencias.
          Cada producto puede tener varias grafías (separadas por{' '}
          <code className="bg-stone-100 px-1 rounded text-xs">|</code>
          ) que matchean al mismo valor.
        </p>
      </div>

      {/* Estado actual */}
      <div className="card p-5">
        <h2 className="font-semibold text-stone-800 mb-4">Estado actual del maestro</h2>
        {estadoLoading ? (
          <p className="text-stone-400 text-sm">Cargando...</p>
        ) : estado ? (
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Productos</p>
              <p className="text-2xl font-bold text-stone-900">{estado.productos ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Variantes totales</p>
              <p className="text-2xl font-bold text-stone-900">{estado.variantes ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Última actualización</p>
              <p className="text-sm font-semibold text-stone-700 leading-snug">{fmtFecha(estado.ultima_actualizacion)}</p>
            </div>
          </div>
        ) : (
          <p className="text-red-500 text-sm">No se pudo obtener el estado del maestro.</p>
        )}
      </div>

      {/* Subir nuevo Excel */}
      <div className="card p-5">
        <h2 className="font-semibold text-stone-800 mb-1">Subir nuevo Excel</h2>
        <p className="text-xs text-stone-400 mb-4">
          Reemplaza el archivo actual en R2 y recarga el diccionario automáticamente.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4
            ${dragging
              ? 'border-violet-500 bg-violet-50'
              : file
                ? 'border-violet-400 bg-violet-50/60'
                : 'border-stone-300 hover:border-violet-400 hover:bg-stone-50'
            }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          {file ? (
            <>
              <p className="text-violet-700 font-semibold text-sm">{file.name}</p>
              <p className="text-xs text-stone-400 mt-1">
                {(file.size / 1024).toFixed(0)} KB · listo para subir
              </p>
            </>
          ) : (
            <>
              <p className="text-stone-400 text-sm">Arrastrá el archivo acá o hacé click para seleccionar</p>
              <p className="text-xs text-stone-300 mt-1">.xlsx · máx. 10 MB</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Subiendo a R2...
              </>
            ) : (
              'Subir y recargar'
            )}
          </button>
          {file && !uploading && (
            <button onClick={clearFile} className="text-sm text-stone-400 hover:text-stone-600 transition-colors">
              Cancelar
            </button>
          )}
        </div>

        {uploadMsg && (
          <div className={`mt-4 text-sm px-4 py-3 rounded-lg border ${
            uploadMsg.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {uploadMsg.ok ? '✓ ' : '✕ '}{uploadMsg.text}
            {uploadMsg.hint && (
              <span className="block mt-1 text-emerald-600 text-xs">{uploadMsg.hint}</span>
            )}
          </div>
        )}
      </div>

      {/* Otras acciones */}
      <div className="card p-5">
        <h2 className="font-semibold text-stone-800 mb-4">Otras acciones</h2>

        <div className="flex flex-wrap gap-6">
          {/* Descargar */}
          <div>
            <button onClick={handleDownload} className="btn-secondary text-sm flex items-center gap-2">
              ↓ Descargar Excel actual
            </button>
            <p className="text-xs text-stone-400 mt-1.5">Editá y volvé a subir para actualizar.</p>
          </div>

          {/* Recargar sin subir */}
          <div>
            <button
              onClick={handleReload}
              disabled={reloading}
              className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-60"
            >
              {reloading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  Recargando...
                </>
              ) : (
                '🔄 Recargar sin subir'
              )}
            </button>
            <p className="text-xs text-stone-400 mt-1.5">Solo si el archivo en R2 ya está actualizado.</p>
          </div>
        </div>

        {reloadMsg && (
          <div className={`mt-4 text-sm px-4 py-2.5 rounded-lg border ${
            reloadMsg.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {reloadMsg.ok ? '✓ ' : '✕ '}{reloadMsg.text}
          </div>
        )}
      </div>

    </div>
  );
}
