import { useState, useEffect, useRef } from 'react';
import api from '../../api';

// Los productos que la cocina cuenta todos los días.
//
// Esta pantalla existe porque los datos con los que arrancó el maestro son una
// aproximación: los nombres los pasó Martín, pero la unidad, dónde vive cada uno y
// qué días se revisa se adivinaron. Cambiarlos acá cambia el formulario de cocina al
// instante, así que se corrige contra la heladera de verdad y no de memoria.
//
// Guarda sola, campo por campo, como el resto del sistema.

const DIAS = [
  { n: 1, l: 'L' }, { n: 2, l: 'M' }, { n: 3, l: 'M' }, { n: 4, l: 'J' },
  { n: 5, l: 'V' }, { n: 6, l: 'S' }, { n: 0, l: 'D' },
];
const TODOS   = [0, 1, 2, 3, 4, 5, 6];
const LUN_JUE = [1, 4];
const mismos = (a, b) => [...a].sort().join() === [...b].sort().join();

function Interruptor({ prendido, onChange, titulo }) {
  return (
    <button
      type="button" role="switch" aria-checked={prendido} aria-label={titulo}
      onClick={() => onChange(!prendido)}
      className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${prendido ? 'bg-green-600' : 'bg-ahg-accent'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${prendido ? 'left-5' : 'left-1'}`} />
    </button>
  );
}

export default function MaestroCocinaPage() {
  const [productos, setProductos] = useState([]);
  const [unidades, setUnidades]   = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo]         = useState({ proveedor: '', nombre: '' });
  const avisoRef = useRef(null);

  useEffect(() => { cargar(); }, []);

  function cargar() {
    setCargando(true);
    api.get('/maestros/cocina/productos')
      .then(r => { setProductos(r.data.data.productos); setUnidades(r.data.data.unidades); })
      .catch(() => setError('No se pudo traer el maestro'))
      .finally(() => setCargando(false));
  }

  // Se pinta el cambio antes de que conteste el servidor: editar veinticinco filas
  // esperando cada respuesta es insoportable. Si falla, se vuelve atrás.
  function guardar(id, campos) {
    const antes = productos;
    setProductos(ps => ps.map(p => (p.id === id ? { ...p, ...campos } : p)));
    setGuardando(true);
    api.put(`/maestros/cocina/productos/${id}`, campos)
      .then(r => setProductos(ps => ps.map(p => (p.id === id ? { ...p, ...r.data.data } : p))))
      .catch(e => {
        setProductos(antes);
        setError(e.response?.data?.error || 'No se pudo guardar');
        clearTimeout(avisoRef.current);
        avisoRef.current = setTimeout(() => setError(null), 4000);
      })
      .finally(() => setGuardando(false));
  }

  function diasDe(proveedor, dias) {
    setProductos(ps => ps.map(p => (p.proveedor === proveedor ? { ...p, dias_revision: dias } : p)));
    api.post('/maestros/cocina/productos/dias', { proveedor, dias }).catch(() => cargar());
  }

  function agregar(e) {
    e.preventDefault();
    if (!nuevo.proveedor.trim() || !nuevo.nombre.trim()) return;
    api.post('/maestros/cocina/productos', nuevo)
      .then(() => { setNuevo({ proveedor: nuevo.proveedor, nombre: '' }); cargar(); })
      .catch(e2 => setError(e2.response?.data?.error || 'No se pudo agregar'));
  }

  function borrar(p) {
    if (!confirm(`¿Sacar "${p.nombre}" de ${p.proveedor}?`)) return;
    api.delete(`/maestros/cocina/productos/${p.id}`)
      .then(r => {
        if (r.data.data.desactivado) setError('Ya tenía stock contado, así que quedó desactivado en vez de borrado.');
        cargar();
      })
      .catch(() => setError('No se pudo borrar'));
  }

  if (cargando) return <div className="p-6 text-sm text-ahg-text/50">Cargando…</div>;

  const proveedores = [];
  for (const p of productos) {
    const g = proveedores.find(x => x.nombre === p.proveedor);
    if (g) g.items.push(p); else proveedores.push({ nombre: p.proveedor, items: [p] });
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>Maestro de cocina</h1>
        <p className="text-sm text-ahg-text/60 mt-1">
          Lo que la cocina cuenta todos los días. Lo que cambies acá se ve en el formulario enseguida,
          sin tocar el sistema. <strong>Guarda solo.</strong> Un producto puede estar en el freezer,
          en la heladera, en el mostrador o en varios a la vez; el formulario muestra un casillero por cada uno.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
      )}

      {proveedores.map(g => (
        <div key={g.nombre} className="card p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ahg-accent/30">
            <span className="font-bold text-sm uppercase tracking-wide">{g.nombre}</span>
            <span className="text-xs text-ahg-text/40">{g.items.length} productos</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-ahg-text/50">Todo el proveedor:</span>
              <button type="button" onClick={() => diasDe(g.nombre, TODOS)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-ahg-accent hover:bg-ahg-accent/20">
                todos los días
              </button>
              <button type="button" onClick={() => diasDe(g.nombre, LUN_JUE)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-ahg-accent hover:bg-ahg-accent/20">
                lun y jue
              </button>
            </div>
          </div>

          <div className="hidden sm:flex px-4 py-2 bg-ahg-bg/60 text-[10px] font-bold uppercase tracking-wider text-ahg-text/50">
            <span className="flex-1">Producto</span>
            <span className="w-28">Se cuenta en</span>
            <span className="w-20 text-center">Freezer</span>
            <span className="w-20 text-center">Heladera</span>
            <span className="w-20 text-center">Mostrador</span>
            <span className="w-48">Qué días se revisa</span>
            <span className="w-8" />
          </div>

          {g.items.map(p => (
            <div key={p.id}
                 className={`flex flex-wrap sm:flex-nowrap items-center gap-2 px-4 py-2.5 border-b border-ahg-accent/20 last:border-b-0 ${p.activo ? '' : 'opacity-40'}`}>
              <input
                className="input text-sm flex-1 min-w-[140px]"
                value={p.nombre}
                onChange={e => setProductos(ps => ps.map(x => (x.id === p.id ? { ...x, nombre: e.target.value } : x)))}
                onBlur={e => e.target.value.trim() && guardar(p.id, { nombre: e.target.value.trim() })}
              />
              <select className="input text-sm w-28" value={p.unidad}
                      onChange={e => guardar(p.id, { unidad: e.target.value })}>
                {unidades.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <div className="w-20 flex justify-center">
                <Interruptor prendido={p.en_freezer} titulo={`${p.nombre} en freezer`}
                             onChange={v => guardar(p.id, { en_freezer: v })} />
              </div>
              <div className="w-20 flex justify-center">
                <Interruptor prendido={p.en_heladera} titulo={`${p.nombre} en heladera`}
                             onChange={v => guardar(p.id, { en_heladera: v })} />
              </div>
              <div className="w-20 flex justify-center">
                <Interruptor prendido={p.en_mostrador} titulo={`${p.nombre} en mostrador`}
                             onChange={v => guardar(p.id, { en_mostrador: v })} />
              </div>
              <div className="w-48 flex gap-1">
                {DIAS.map(d => {
                  const puesto = p.dias_revision.includes(d.n);
                  return (
                    <button
                      key={d.n} type="button" aria-pressed={puesto} aria-label={`día ${d.n}`}
                      onClick={() => guardar(p.id, {
                        dias_revision: puesto ? p.dias_revision.filter(x => x !== d.n) : [...p.dias_revision, d.n],
                      })}
                      className={`w-6 h-6 rounded text-[11px] font-bold ${puesto ? 'bg-ahg-primary text-white' : 'bg-ahg-bg text-ahg-text/40 border border-ahg-accent/50'}`}
                    >{d.l}</button>
                  );
                })}
              </div>
              <button type="button" onClick={() => borrar(p)} aria-label={`Sacar ${p.nombre}`}
                      className="w-8 text-red-500 text-lg leading-none hover:bg-red-50 rounded">×</button>
            </div>
          ))}
        </div>
      ))}

      <form onSubmit={agregar} className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold text-ahg-text/60 mb-1">Proveedor</label>
          <input className="input text-sm" list="proveedores-cocina" value={nuevo.proveedor}
                 onChange={e => setNuevo({ ...nuevo, proveedor: e.target.value })} placeholder="Club de Campo" />
          <datalist id="proveedores-cocina">
            {proveedores.map(g => <option key={g.nombre} value={g.nombre} />)}
          </datalist>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold text-ahg-text/60 mb-1">Producto</label>
          <input className="input text-sm" value={nuevo.nombre}
                 onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="MILA DE CERDO" />
        </div>
        <button type="submit" className="btn-primary text-sm">Agregar</button>
      </form>

      <p className="text-xs text-ahg-text/40">
        {guardando ? 'Guardando…' : 'Guardado.'} Un producto que ya tiene stock contado no se borra: queda desactivado,
        para que los conteos viejos sigan teniendo sentido.
      </p>
    </div>
  );
}
