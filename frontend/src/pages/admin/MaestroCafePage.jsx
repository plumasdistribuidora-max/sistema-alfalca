import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { formatNumber, formatDate } from '../../utils/format';

// Gramos frecuentes, para cargar de un click. Los valores reales los define Martín
// producto por producto: esto es solo para no tipear.
const ATAJOS = [
  { label: 'No lleva', valor: 0,  hint: 'Medialunas, jugos, promos sin café' },
  { label: '7 g',      valor: 7,  hint: 'un espresso simple' },
  { label: '9 g',      valor: 9 },
  { label: '14 g',     valor: 14, hint: 'un doble' },
  { label: '18 g',     valor: 18 },
];

function fmtGramos(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n === 0) return 'No lleva';
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} g`;
}
const kg = v => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg`;

function hoyStr(delta = 0) {
  const t = new Date(); t.setDate(t.getDate() + delta);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
const FECHA_CORTA = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const fechaCorta = f => FECHA_CORTA.format(new Date(`${f}T12:00:00`));

// Lo pesado por los baristas contra lo que las ventas deberían haber consumido.
function Control({ pendientes }) {
  const [desde, setDesde] = useState(hoyStr(-13));
  const [hasta, setHasta] = useState(hoyStr());
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setFilas(null);
    api.get('/maestros/cafe/control', { params: { desde, hasta } })
      .then(r => { setFilas(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo armar el control'));
  }, [desde, hasta]);

  const conDatos = (filas || []).filter(f => f.real !== null && f.teorico !== null);
  const totReal = conDatos.reduce((s, f) => s + f.real, 0);
  const totTeo  = conDatos.reduce((s, f) => s + f.teorico, 0);
  const pct = (real, teo) => teo ? Math.round(((real - teo) / teo) * 100) : null;
  const tono = p => p === null ? 'text-stone-400' : Math.abs(p) <= 10 ? 'text-emerald-700' : Math.abs(p) <= 25 ? 'text-amber-700' : 'text-red-700';

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="font-semibold text-stone-800">Control: lo pesado contra lo vendido</h2>
          <p className="text-xs text-stone-400 max-w-2xl mt-0.5">
            <strong>Real</strong> es lo que consumió cada turno según el pesaje de los baristas (recibió menos entregó).
            <strong> Teórico</strong> es lo vendido ese día multiplicado por los gramos de este maestro.
            El corte entre mañana y tarde es la hora en que la barista de la tarde recibió el turno.
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {[['7 días', -6], ['14 días', -13], ['30 días', -29]].map(([l, d]) => (
            <button key={l} onClick={() => { setDesde(hoyStr(d)); setHasta(hoyStr()); }}
                    className="text-xs px-2.5 py-1.5 rounded border border-stone-200 text-stone-600 hover:border-violet-400">{l}</button>
          ))}
          <input type="date" className="input text-sm w-40" value={desde} onChange={e => setDesde(e.target.value)} />
          <span className="text-stone-400 text-sm">a</span>
          <input type="date" className="input text-sm w-40" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {pendientes > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Hay {pendientes} productos sin gramos: lo que se vendió de ellos suma 0 al teórico. Mientras tanto, el teórico queda corto.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!filas && !error && <p className="text-sm text-stone-400">Armando el control…</p>}
      {filas && !filas.length && <p className="text-sm text-stone-400">No hay ventas del café en ese período.</p>}
      {filas && filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-stone-400 uppercase tracking-wide border-b border-stone-200">
                <th className="text-left py-2 pr-3">Día</th>
                <th className="text-right py-2 px-3">Real</th>
                <th className="text-right py-2 px-3">Teórico</th>
                <th className="text-right py-2 px-3">Diferencia</th>
                <th className="text-left py-2 pl-3">Por turno (real / teórico)</th>
                <th className="text-right py-2 pl-3">Sin gramos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const p = f.real !== null && f.teorico !== null ? pct(f.real, f.teorico) : null;
                return (
                  <tr key={f.fecha} className="border-b border-stone-100">
                    <td className="py-2 pr-3 whitespace-nowrap capitalize">{fechaCorta(f.fecha)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{f.real === null ? <span className="text-stone-300 font-normal">sin pesaje</span> : kg(f.real)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{kg(f.teorico)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-semibold ${tono(p)}`}>
                      {f.diferencia === null ? '—' : `${f.diferencia > 0 ? '+' : ''}${kg(f.diferencia)}${p !== null ? ` (${p > 0 ? '+' : ''}${p}%)` : ''}`}
                    </td>
                    <td className="py-2 pl-3 text-xs text-stone-500">
                      {f.turnos.length ? f.turnos.map(t => (
                        <span key={t.turno} className="mr-3">{t.turno.toLowerCase()} {t.usuario ? `(${t.usuario}) ` : ''}<strong className="text-stone-700">{kg(t.real)}</strong> / {kg(t.teorico)}</span>
                      )) : '—'}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-xs text-stone-400">{f.sin_definir ? `${formatNumber(f.sin_definir)} u. · ${f.productos_sin_definir} prod.` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            {conDatos.length > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total ({conDatos.length} día{conDatos.length === 1 ? '' : 's'} con pesaje)</td>
                  <td className="py-2 px-3 text-right tabular-nums">{kg(Math.round(totReal * 100) / 100)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{kg(Math.round(totTeo * 100) / 100)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${tono(pct(totReal, totTeo))}`}>
                    {totReal - totTeo > 0 ? '+' : ''}{kg(Math.round((totReal - totTeo) * 100) / 100)}{totTeo ? ` (${pct(totReal, totTeo) > 0 ? '+' : ''}${pct(totReal, totTeo)}%)` : ''}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export default function MaestroCafePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [estado,  setEstado]  = useState(null);
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [msg,     setMsg]     = useState(null);

  const [busqueda,  setBusqueda]  = useState('');
  const [catFiltro, setCatFiltro] = useState('');
  const [guardando, setGuardando] = useState(null);
  const [borrador,  setBorrador]  = useState({});
  const [seleccion, setSeleccion] = useState(new Set());
  const [masivaValor, setMasivaValor] = useState('');
  const [masivaBusy,  setMasivaBusy]  = useState(false);

  const filtro = searchParams.get('estado') || 'pendientes';

  useEffect(() => {
    if (user && user.rol?.toLowerCase() !== 'admin') navigate('/', { replace: true });
  }, [user]);

  function cargar() {
    setLoading(true);
    Promise.all([api.get('/maestros/cafe/estado'), api.get('/maestros/cafe/lista')])
      .then(([e, l]) => { setEstado(e.data); setRows(l.data.data); setError(null); })
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { cargar(); }, []);

  const categorias = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const c = r.categoria || '(sin categoría)';
      const x = m.get(c) || { categoria: c, total: 0, pendientes: 0 };
      x.total++; if (r.pendiente) x.pendientes++;
      m.set(c, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter(r => {
      if (filtro === 'pendientes' && !r.pendiente) return false;
      if (filtro === 'llevan'     && !(r.gramos > 0)) return false;
      if (filtro === 'no_llevan'  && !(r.gramos === 0)) return false;
      if (catFiltro && (r.categoria || '(sin categoría)') !== catFiltro) return false;
      if (q && !r.nombre.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (Number(b.pendiente) - Number(a.pendiente)) || (b.unidades_90 - a.unidades_90) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [rows, filtro, busqueda, catFiltro]);

  function aplicarLocal(ids, gramos) {
    const set = new Set(ids);
    setRows(prev => prev.map(r => set.has(r.id) ? { ...r, gramos, pendiente: false, definido_por: user?.nombre, definido_at: new Date().toISOString() } : r));
  }

  async function guardar(row, valor) {
    const v = Number(String(valor).replace(',', '.'));
    if (valor === '' || valor === null || !isFinite(v) || v < 0) {
      setMsg({ ok: false, text: 'Ingresá los gramos (0 si el producto no lleva café).' });
      return;
    }
    setGuardando(row.id); setMsg(null);
    try {
      const res = await api.put(`/maestros/cafe/${row.id}`, { gramos: v });
      aplicarLocal([row.id], res.data.data.gramos);
      setBorrador(prev => { const n = { ...prev }; delete n[row.id]; return n; });
      setMsg({ ok: true, text: `${res.data.data.nombre}: ${fmtGramos(res.data.data.gramos)} guardado.` });
      api.get('/maestros/cafe/estado').then(e => setEstado(e.data)).catch(() => {});
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setGuardando(null);
    }
  }

  function toggleSel(id) {
    setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function aplicarASeleccion(valor) {
    const ids = [...seleccion];
    if (!ids.length) return;
    const v = Number(String(valor).replace(',', '.'));
    if (valor === '' || !isFinite(v) || v < 0) { setMsg({ ok: false, text: 'Ingresá los gramos (0 = no lleva café).' }); return; }
    if (!window.confirm(`Vas a asignar ${v === 0 ? '"No lleva café"' : `${v} g de café`} a ${ids.length} ${ids.length === 1 ? 'producto' : 'productos'}. ¿Seguir?`)) return;
    setMasivaBusy(true); setMsg(null);
    try {
      const res = await api.post('/maestros/cafe/bulk', { ids, gramos: v });
      aplicarLocal(ids, v);
      setMsg({ ok: true, text: `${res.data.actualizados} productos en ${fmtGramos(v)}.` });
      setSeleccion(new Set()); setMasivaValor('');
      api.get('/maestros/cafe/estado').then(e => setEstado(e.data)).catch(() => {});
    } catch (err) {
      setMsg({ ok: false, text: err?.response?.data?.error || err.message });
    } finally {
      setMasivaBusy(false);
    }
  }

  const pendientes = estado?.pendientes ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Maestro de café</h1>
        <p className="text-stone-500 text-sm mt-1 max-w-2xl">
          Cuántos gramos de café lleva cada producto de la cafetería. Con eso, lo que se vende cada
          día tiene un consumo teórico, y se compara contra lo que pesan los baristas al recibir y
          entregar el turno.
        </p>
      </div>

      {pendientes > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="font-semibold text-amber-900">{pendientes} {pendientes === 1 ? 'producto sin definir' : 'productos sin definir'}</p>
          <p className="text-sm text-amber-800 mt-1">
            Mientras estén pendientes suman <strong>0 gramos</strong> al teórico. Poné <strong>0</strong> si no lleva café
            (una medialuna, un jugo, una promo sin café) o cuántos gramos lleva cada unidad.
            Para ir rápido: buscá un texto que agrupe los que valen lo mismo, tildalos y asignales el valor de una.
          </p>
        </div>
      )}

      <div className="card p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { val: 'todos',      label: 'Productos del café', n: estado?.productos },
            { val: 'pendientes', label: 'Pendientes',  n: estado?.pendientes, color: pendientes > 0 ? 'text-amber-600' : 'text-emerald-600' },
            { val: 'llevan',     label: 'Llevan café', n: estado?.llevan },
            { val: 'no_llevan',  label: 'No llevan',   n: estado?.no_llevan },
          ].map(c => (
            <button key={c.val} onClick={() => setSearchParams(prev => { prev.set('estado', c.val); return prev; })}
                    className={`text-left rounded-lg px-3 py-2 border transition-colors ${filtro === c.val ? 'border-violet-400 bg-violet-50' : 'border-transparent hover:bg-stone-50 hover:border-stone-200'}`}>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color || 'text-stone-900'}`}>{c.n ?? '—'}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} className="input text-sm w-56">
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.categoria} value={c.categoria}>{c.categoria} ({filtro === 'pendientes' ? c.pendientes : c.total})</option>)}
        </select>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto..." className="input flex-1 min-w-[180px]" />
      </div>

      {msg && (
        <div className={`text-sm px-4 py-3 rounded-lg border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {msg.ok ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      {seleccion.size > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-violet-300 bg-violet-50 px-5 py-3 shadow-sm flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-violet-900 whitespace-nowrap">{seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}</span>
          <div className="flex flex-wrap gap-1.5">
            {ATAJOS.map(a => (
              <button key={a.label} title={a.hint} onClick={() => aplicarASeleccion(a.valor)} disabled={masivaBusy}
                      className="text-xs px-2.5 py-1.5 rounded border border-violet-300 bg-white text-violet-800 hover:bg-violet-100 disabled:opacity-50">{a.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input inputMode="decimal" value={masivaValor} onChange={e => setMasivaValor(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') aplicarASeleccion(masivaValor); }}
                   placeholder="gramos" className="input w-24 text-right text-sm" />
            <button onClick={() => aplicarASeleccion(masivaValor)} disabled={masivaBusy || masivaValor === ''} className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50">
              {masivaBusy ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
          <button onClick={() => setSeleccion(new Set())} className="text-xs text-violet-700 hover:text-violet-900 ml-auto">Limpiar selección</button>
        </div>
      )}

      <div className="card overflow-hidden">
        {!loading && !error && visibles.length > 0 && (
          <label className="flex items-center gap-3 px-5 py-3 border-b border-stone-200 bg-stone-50 cursor-pointer text-sm text-stone-600">
            <input type="checkbox" className="accent-violet-600 w-4 h-4"
                   checked={visibles.every(r => seleccion.has(r.id))}
                   onChange={e => {
                     const ids = visibles.map(r => r.id);
                     setSeleccion(prev => { const n = new Set(prev); e.target.checked ? ids.forEach(i => n.add(i)) : ids.forEach(i => n.delete(i)); return n; });
                   }} />
            Seleccionar los {visibles.length} productos de esta vista
          </label>
        )}
        {loading ? <p className="p-6 text-stone-400 text-sm">Cargando maestro...</p>
         : error ? <p className="p-6 text-red-600 text-sm">{error}</p>
         : !visibles.length ? <p className="p-6 text-stone-400 text-sm">{filtro === 'pendientes' ? '✓ No queda ningún producto sin definir.' : 'No hay productos que coincidan.'}</p>
         : (
          <div className="divide-y divide-stone-100">
            {visibles.map(row => {
              const editando = row.pendiente || borrador[row.id] !== undefined;
              const valor = borrador[row.id] ?? (row.gramos ?? '');
              return (
                <div key={row.id} className={`px-5 py-3.5 ${seleccion.has(row.id) ? 'bg-violet-50/60' : row.pendiente ? 'bg-amber-50/40' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <input type="checkbox" className="accent-violet-600 w-4 h-4 mt-1 shrink-0" checked={seleccion.has(row.id)} onChange={() => toggleSel(row.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-stone-900 text-sm">{row.nombre}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {row.categoria || 'Sin categoría'} · {formatNumber(row.unidades_90)} en 90 días · {formatNumber(row.unidades_vendidas)} en total
                        {row.ultima_venta && ` · última ${formatDate(row.ultima_venta)}`}
                      </p>
                      {!row.pendiente && !editando && row.definido_por && (
                        <p className="text-xs text-stone-400 mt-0.5">Definido por {row.definido_por}{row.definido_at ? ` el ${formatDate(row.definido_at)}` : ''}</p>
                      )}
                    </div>
                    {!editando ? (
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-sm font-semibold ${Number(row.gramos) === 0 ? 'text-stone-400' : 'text-stone-900'}`}>{fmtGramos(row.gramos)}</span>
                        <button onClick={() => setBorrador(p => ({ ...p, [row.id]: row.gramos ?? '' }))} className="text-xs text-violet-600 hover:text-violet-800">Cambiar</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          <input inputMode="decimal" value={valor} autoFocus={!row.pendiente}
                                 onChange={e => setBorrador(p => ({ ...p, [row.id]: e.target.value }))}
                                 onKeyDown={e => { if (e.key === 'Enter') guardar(row, valor); }}
                                 placeholder="gramos" className="input w-24 text-right" />
                          <span className="text-sm text-stone-400">g</span>
                          <button onClick={() => guardar(row, valor)} disabled={guardando === row.id} className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50">
                            {guardando === row.id ? 'Guardando...' : 'Guardar'}
                          </button>
                          {!row.pendiente && (
                            <button onClick={() => setBorrador(p => { const n = { ...p }; delete n[row.id]; return n; })} className="text-xs text-stone-400 hover:text-stone-600">Cancelar</button>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {ATAJOS.map(a => (
                            <button key={a.label} title={a.hint} onClick={() => guardar(row, a.valor)} disabled={guardando === row.id}
                                    className="text-xs px-2 py-1 rounded border border-stone-200 text-stone-600 hover:border-violet-400 hover:text-violet-700 disabled:opacity-50">{a.label}</button>
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

      <Control pendientes={pendientes} />
    </div>
  );
}
