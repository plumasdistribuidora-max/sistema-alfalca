import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { formatNumber, formatDate } from '../../utils/format';

// Valores frecuentes, para cargar de un click en vez de tipear la fracción.
const ATAJOS = [
  { label: 'No suma',   valor: 0,      hint: 'Alimendos, insumos, packaging' },
  { label: '1 alfajor', valor: 1 / 12, hint: 'unidad suelta' },
  { label: '½ docena',  valor: 0.5 },
  { label: '1 docena',  valor: 1 },
  { label: '1½ docena', valor: 1.5 },
  { label: '2 docenas', valor: 2 },
];

function fmtDocenas(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n === 0) return 'No suma';
  return n.toLocaleString('es-AR', { maximumFractionDigits: 4 });
}

export default function MaestroDocenasPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [estado,  setEstado]  = useState(null);
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [msg,     setMsg]     = useState(null);

  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(null); // id en curso
  const [borrador,  setBorrador]  = useState({});   // id → valor tipeado

  const [categorias,  setCategorias]  = useState([]);
  const [catFiltro,   setCatFiltro]   = useState('');       // filtro del listado
  const [seleccion,   setSeleccion]   = useState(new Set()); // ids tildados
  const [masivaValor, setMasivaValor] = useState('');
  const [masivaBusy,  setMasivaBusy]  = useState(false);

  const filtro = searchParams.get('estado') || 'pendientes';

  useEffect(() => {
    if (user && user.rol?.toLowerCase() !== 'admin') navigate('/', { replace: true });
  }, [user]);

  function cargar() {
    setLoading(true);
    Promise.all([
      api.get('/maestros/docenas/estado'),
      api.get('/maestros/docenas/lista'),
      api.get('/maestros/docenas/categorias'),
    ])
      .then(([e, l, c]) => {
        setEstado(e.data);
        setRows(l.data.data);
        setCategorias(c.data.data);
        setError(null);
      })
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter(r => {
      if (filtro === 'pendientes' && !r.pendiente) return false;
      if (filtro === 'definidos'  && r.pendiente)  return false;
      if (catFiltro && (r.categoria || '(sin categoría)') !== catFiltro) return false;
      if (q && !r.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filtro, busqueda, catFiltro]);

  async function guardar(row, valor) {
    if (valor === null || valor === '' || isNaN(Number(valor))) {
      setMsg({ ok: false, text: 'Ingresá un número (usá 0 si el producto no suma docenas).' });
      return;
    }
    setGuardando(row.id);
    setMsg(null);
    try {
      const res = await api.put(`/maestros/docenas/${row.id}`, { docenas: Number(valor) });
      const d = res.data.data;
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, docenas: d.docenas, pendiente: false, origen: 'manual',
            definido_por: user?.nombre, definido_at: new Date().toISOString() }
        : r));
      setBorrador(prev => { const n = { ...prev }; delete n[row.id]; return n; });
      setEstado(prev => prev && row.pendiente
        ? { ...prev, pendientes: Math.max(0, prev.pendientes - 1),
            suman: prev.suman + (d.docenas > 0 ? 1 : 0),
            no_suman: prev.no_suman + (d.docenas === 0 ? 1 : 0) }
        : prev);
      setMsg({
        ok: true,
        text: d.ventas_recalculadas > 0
          ? `${d.nombre}: ${fmtDocenas(d.docenas)} · ${formatNumber(d.ventas_recalculadas)} ventas del histórico recalculadas.`
          : `${d.nombre}: ${fmtDocenas(d.docenas)} guardado.`,
      });
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setGuardando(null);
    }
  }

  function toggleSel(id) {
    setSeleccion(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // Aplica un valor a todos los productos tildados. La selección la arma el
  // usuario, no la categoría: dentro de una misma categoría conviven productos
  // que valen 1 docena, media y un alfajor suelto.
  async function aplicarASeleccion(valor) {
    const ids = [...seleccion];
    if (!ids.length) return;
    const v = Number(valor);
    if (valor === '' || !isFinite(v) || v < 0) {
      setMsg({ ok: false, text: 'Ingresá un número (0 = no suma docenas).' });
      return;
    }
    if (!window.confirm(
      `Vas a asignar ${v === 0 ? '"No suma"' : `${v} docenas`} a ${ids.length} ` +
      `${ids.length === 1 ? 'producto' : 'productos'}.\n\n` +
      'Su histórico de ventas se recalcula con ese valor. ¿Seguir?'
    )) return;

    setMasivaBusy(true);
    setMsg(null);
    try {
      const res = await api.post('/maestros/docenas/bulk', {
        ids, docenas: v, solo_pendientes: false,
      });
      setMsg({
        ok: true,
        text: `${res.data.actualizados} productos en ${v === 0 ? 'No suma' : `${v} docenas`} · ` +
              `${formatNumber(res.data.ventas_recalculadas)} ventas del histórico recalculadas.`,
      });
      setSeleccion(new Set());
      setMasivaValor('');
      cargar();
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setMasivaBusy(false);
    }
  }

  const [recalculando, setRecalculando] = useState(false);

  async function recalcularTodo() {
    if (!window.confirm(
      'Reaplica los valores del maestro sobre todas las ventas ya importadas.\n' +
      'Corre esto una vez cuando termines de definir los pendientes. ¿Seguir?'
    )) return;
    setRecalculando(true);
    setMsg(null);
    try {
      const res = await api.post('/maestros/docenas/recalcular');
      setMsg({ ok: true, text: `${formatNumber(res.data.ventas_recalculadas)} ventas recalculadas con los valores actuales del maestro.` });
      cargar();
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setRecalculando(false);
    }
  }

  const pendientes = estado?.pendientes ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">

      <div>
        <h1 className="text-xl font-bold text-stone-900">Maestro de docenas</h1>
        <p className="text-stone-500 text-sm mt-1 max-w-2xl">
          Acá vive el equivalente en docenas de cada producto. Ya no hay Excel: lo que
          definís acá se aplica a las ventas nuevas y también recalcula el histórico
          de ese producto.
        </p>
      </div>

      {/* Alerta de pendientes */}
      {pendientes > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="font-semibold text-amber-900">
            {pendientes} {pendientes === 1 ? 'producto sin definir' : 'productos sin definir'}
          </p>
          <p className="text-sm text-amber-800 mt-1">
            Mientras estén pendientes suman <strong>0 docenas</strong> y los reportes quedan
            cortos. Poné <strong>0</strong> si es de Alimendos o no suma, o cuántas docenas
            equivale.
          </p>
          <p className="text-sm text-amber-800 mt-2">
            Para ir rápido: filtrá por categoría o buscá un texto que agrupe productos que
            valen lo mismo (por ejemplo <em>“media docena”</em>), tildá los que corresponda
            — destildando los que no, como un insumo o un estuche — y asignales el valor
            de una sola vez.
          </p>
        </div>
      )}

      {/* Contadores */}
      <div className="card p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Productos</p>
            <p className="text-2xl font-bold text-stone-900">{estado?.productos ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Pendientes</p>
            <p className={`text-2xl font-bold ${pendientes > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {estado?.pendientes ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Suman docenas</p>
            <p className="text-2xl font-bold text-stone-900">{estado?.suman ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">No suman</p>
            <p className="text-2xl font-bold text-stone-900">{estado?.no_suman ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-stone-200 overflow-hidden text-sm">
          {[
            ['pendientes', `Pendientes${pendientes ? ` (${pendientes})` : ''}`],
            ['definidos',  'Definidos'],
            ['todos',      'Todos'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSearchParams(prev => { prev.set('estado', val); return prev; })}
              className={`px-4 py-2 transition-colors ${
                filtro === val ? 'bg-violet-600 text-white font-semibold' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          className="input text-sm w-52"
        >
          <option value="">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.categoria} value={c.categoria}>
              {c.categoria} ({filtro === 'pendientes' ? c.pendientes : c.total})
            </option>
          ))}
        </select>

        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="input flex-1 min-w-[180px]"
        />

        <a
          href="#"
          onClick={async (e) => {
            e.preventDefault();
            const res = await api.get('/maestros/docenas/export', { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'maestro-docenas.csv'; a.click();
            URL.revokeObjectURL(url);
          }}
          className="text-sm text-violet-600 hover:text-violet-800 whitespace-nowrap"
        >
          ↓ Exportar CSV
        </a>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-3 rounded-lg border ${
          msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                 : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {msg.ok ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      {/* Barra de acción de la selección */}
      {seleccion.size > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-violet-300 bg-violet-50 px-5 py-3
                        shadow-sm flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-violet-900 whitespace-nowrap">
            {seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}
          </span>

          <div className="flex flex-wrap gap-1.5">
            {ATAJOS.map(a => (
              <button
                key={a.label}
                title={a.hint}
                onClick={() => aplicarASeleccion(a.valor)}
                disabled={masivaBusy}
                className="text-xs px-2.5 py-1.5 rounded border border-violet-300 bg-white
                           text-violet-800 hover:bg-violet-100 transition-colors disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.0001"
              min="0"
              value={masivaValor}
              onChange={e => setMasivaValor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') aplicarASeleccion(masivaValor); }}
              placeholder="otro"
              className="input w-24 text-right text-sm"
            />
            <button
              onClick={() => aplicarASeleccion(masivaValor)}
              disabled={masivaBusy || masivaValor === ''}
              className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
            >
              {masivaBusy ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>

          <button
            onClick={() => setSeleccion(new Set())}
            className="text-xs text-violet-700 hover:text-violet-900 ml-auto"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* Listado */}
      <div className="card overflow-hidden">
        {!loading && !error && visibles.length > 0 && (
          <label className="flex items-center gap-3 px-5 py-3 border-b border-stone-200 bg-stone-50
                            cursor-pointer text-sm text-stone-600">
            <input
              type="checkbox"
              className="accent-violet-600 w-4 h-4"
              checked={visibles.every(r => seleccion.has(r.id))}
              onChange={e => {
                const ids = visibles.map(r => r.id);
                setSeleccion(prev => {
                  const n = new Set(prev);
                  e.target.checked ? ids.forEach(i => n.add(i)) : ids.forEach(i => n.delete(i));
                  return n;
                });
              }}
            />
            Seleccionar los {visibles.length} productos de esta vista
            <span className="text-xs text-stone-400">
              — filtrá o buscá para agrupar los que valen lo mismo
            </span>
          </label>
        )}
        {loading ? (
          <p className="p-6 text-stone-400 text-sm">Cargando maestro...</p>
        ) : error ? (
          <p className="p-6 text-red-600 text-sm">{error}</p>
        ) : !visibles.length ? (
          <p className="p-6 text-stone-400 text-sm">
            {filtro === 'pendientes'
              ? '✓ No queda ningún producto sin definir.'
              : 'No hay productos que coincidan con la búsqueda.'}
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {visibles.map(row => {
              const editando = row.pendiente || borrador[row.id] !== undefined;
              const valor = borrador[row.id] ?? (row.docenas ?? '');
              return (
                <div key={row.id} className={`px-5 py-4 ${
                  seleccion.has(row.id) ? 'bg-violet-50/60' : row.pendiente ? 'bg-amber-50/40' : ''
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <input
                      type="checkbox"
                      className="accent-violet-600 w-4 h-4 mt-1 shrink-0"
                      checked={seleccion.has(row.id)}
                      onChange={() => toggleSel(row.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-stone-900 text-sm">{row.nombre}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {row.categoria || 'Sin categoría'}
                        {' · '}
                        {formatNumber(row.unidades_vendidas)} unidades vendidas
                        {row.ultima_venta && ` · última ${formatDate(row.ultima_venta)}`}
                      </p>
                      {!row.pendiente && !editando && (
                        <p className="text-xs text-stone-400 mt-0.5">
                          Definido{row.definido_por ? ` por ${row.definido_por}` : ''}
                          {row.definido_at ? ` el ${formatDate(row.definido_at)}` : ''}
                        </p>
                      )}
                    </div>

                    {!editando ? (
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-sm font-semibold ${
                          Number(row.docenas) === 0 ? 'text-stone-400' : 'text-stone-900'
                        }`}>
                          {fmtDocenas(row.docenas)}
                        </span>
                        <button
                          onClick={() => setBorrador(p => ({ ...p, [row.id]: row.docenas ?? '' }))}
                          className="text-xs text-violet-600 hover:text-violet-800"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={valor}
                            autoFocus={!row.pendiente}
                            onChange={e => setBorrador(p => ({ ...p, [row.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') guardar(row, valor); }}
                            placeholder="docenas"
                            className="input w-28 text-right"
                          />
                          <button
                            onClick={() => guardar(row, valor)}
                            disabled={guardando === row.id}
                            className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
                          >
                            {guardando === row.id ? 'Guardando...' : 'Guardar'}
                          </button>
                          {!row.pendiente && (
                            <button
                              onClick={() => setBorrador(p => { const n = { ...p }; delete n[row.id]; return n; })}
                              className="text-xs text-stone-400 hover:text-stone-600"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {ATAJOS.map(a => (
                            <button
                              key={a.label}
                              title={a.hint}
                              onClick={() => guardar(row, a.valor)}
                              disabled={guardando === row.id}
                              className="text-xs px-2 py-1 rounded border border-stone-200 text-stone-600
                                         hover:border-violet-400 hover:text-violet-700 transition-colors
                                         disabled:opacity-50"
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mantenimiento */}
      <div className="card p-5">
        <h2 className="font-semibold text-stone-800 mb-1">Recalcular todo el histórico</h2>
        <p className="text-xs text-stone-400 mb-3 max-w-xl">
          Al guardar un producto su histórico ya se recalcula solo. Esto es para pasar
          una vez sobre todas las ventas y dejarlas alineadas con los valores actuales
          del maestro — útil después de definir varios pendientes de una sentada.
        </p>
        {pendientes > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 max-w-xl">
            Bloqueado mientras queden pendientes. Como los pendientes valen 0, correrlo
            ahora pondría en cero las ventas históricas de esos {pendientes} productos.
          </p>
        )}
        <button
          onClick={recalcularTodo}
          disabled={recalculando || pendientes > 0}
          className="btn-secondary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {recalculando ? 'Recalculando...' : 'Recalcular histórico completo'}
        </button>
      </div>

    </div>
  );
}
