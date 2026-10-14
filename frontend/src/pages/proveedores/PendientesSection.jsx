import { useState, useEffect } from 'react';
import api from '../../api';
import { UNIDADES, precioPor } from '../../utils/unidades';
import {
  plata, money, Tile, ChipAntiguedad, ModalPago, Modal, Selector,
  hoyStr, diasHasta, fechaCorta, listaDias,
  NumeroFactura, partirNumero, armarNumero, numeroCompleto, ElegirFoto, VerFoto, AvisoRepetida,
} from './comunes';

// Lo que importa es cuántos días lleva cada factura sin pagar, contados desde su
// fecha. El vencimiento se calcula igual por atrás pero acá no se muestra: el dueño
// pidió sacarlo.
const DIAS_VIEJA = 30;

const FILTROS = [
  { id: 'todas',     label: 'Todas' },
  { id: 'viejas',    label: `Más de ${DIAS_VIEJA} días` },
  { id: 'parciales', label: 'Pagadas a medias' },
  { id: 'revisar',   label: 'Para revisar' },
];

// ── Factura cargada a mano, o editada ────────────────────────────────────────
// Para lo que no pasa por el formulario del turno: alquiler, servicios, una compra
// puntual del dueño. Con `inicial` es la misma pantalla para corregir una factura
// existente, venga del turno o de a mano.

function ModalFacturaManual({ proveedores, locales, inicial, onGuardar, onCerrar }) {
  const [f, setF] = useState(inicial ? {
    proveedor_id: inicial.proveedor_id || proveedores[0]?.id || '',
    local_id: inicial.local_id,
    numero: inicial.numero || '', fecha: inicial.fecha, total: inicial.total,
    items: inicial.items.length ? inicial.items : [{}],
  } : {
    proveedor_id: proveedores[0]?.id || '',
    local_id: locales[0]?.id || '',
    numero: '', fecha: hoyStr(), total: '', items: [{}],
  });
  // Una factura vieja sin número se abre con "no tiene número" tildado.
  const [numero, setNumero] = useState(
    inicial && !inicial.numero ? { pv: '', num: '', sin: true } : partirNumero(inicial?.numero)
  );
  const [foto, setFoto] = useState(null);
  const [repetidas, setRepetidas] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function editarItem(i, campo, v) {
    setF(x => ({ ...x, items: x.items.map((it, idx) => idx === i ? { ...it, [campo]: v } : it) }));
  }

  async function guardar(confirmar = false) {
    if (!inicial && !foto) { setError('Falta la foto de la factura'); return; }
    if (!numeroCompleto(numero)) { setError('Poné el punto de venta y el número, o tildá que no tiene número'); return; }
    if (!f.total) { setError('Falta el total de la factura'); return; }
    setGuardando(true);
    setError('');
    // Multipart: los datos van como JSON y la foto aparte. El vencimiento lo calcula
    // el servidor con el plazo de la ficha.
    const fd = new FormData();
    fd.append('datos', JSON.stringify({
      ...f,
      numero: armarNumero(numero),
      sin_numero: numero.sin,
      items: f.items.filter(i => i.producto?.trim()),
    }));
    if (foto) fd.append('foto', foto);
    if (confirmar) fd.append('confirmar_repetida', 'true');
    try {
      await onGuardar(fd);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.repetida) {
        setRepetidas(err.response.data.repetida);
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar la factura');
      }
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={inicial ? 'Corregir la factura' : 'Cargar una factura a mano'}
      subtitulo={inicial
        ? `${inicial.proveedor} · ${inicial.numero || 'sin número'}${inicial.pagado > 0 ? ` · ya lleva ${plata(inicial.pagado)} pagados` : ''}`
        : 'Para lo que no pasa por el formulario del turno'}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" disabled={guardando || !!repetidas} onClick={() => guardar(false)}>
            {guardando ? 'Guardando…' : inicial ? 'Guardar los cambios' : 'Guardar la factura'}
          </button>
        </>
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ElegirFoto archivo={foto} onElegir={setFoto} yaTiene={!!inicial?.tiene_foto} obligatoria={!inicial} />

      <div>
        <label className="label">Proveedor</label>
        <select
          className="input" value={f.proveedor_id}
          onChange={e => setF(x => ({ ...x, proveedor_id: e.target.value }))}
        >
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      <NumeroFactura valor={numero} onChange={v => { setNumero(v); setRepetidas(null); }} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Local</label>
          <select
            className="input" value={f.local_id}
            onChange={e => setF(x => ({ ...x, local_id: e.target.value }))}
          >
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha de la factura</label>
          <input
            type="date" className="input" value={f.fecha}
            onChange={e => { setF(x => ({ ...x, fecha: e.target.value })); setRepetidas(null); }}
          />
        </div>
      </div>

      <div>
        <label className="label">
          Detalle
          <span className="block text-xs font-normal text-ahg-text/50">
            Opcional. Es lo que después dice a cuánto estás pagando cada cosa
          </span>
        </label>
        <div className="space-y-2">
          {f.items.map((it, i) => (
            <div key={i} className="space-y-1">
              <input
                className="input text-sm w-full" placeholder="Producto"
                value={it.producto || ''} onChange={e => editarItem(i, 'producto', e.target.value)}
              />
              <div className="flex gap-1.5">
                <input
                  className="input text-sm w-20 text-right" inputMode="decimal" placeholder="cant"
                  value={it.cantidad ?? ''}
                  onChange={e => editarItem(i, 'cantidad', e.target.value.replace(',', '.'))}
                />
                <select
                  className="input text-sm w-24" value={it.unidad || 'u'}
                  onChange={e => editarItem(i, 'unidad', e.target.value)}
                >
                  {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
                <input
                  className="input text-sm flex-1 text-right" inputMode="numeric"
                  placeholder={`$ ${precioPor(it.unidad)}`}
                  value={it.precio_unit ?? ''}
                  onChange={e => editarItem(i, 'precio_unit', e.target.value.replace(/[^\d]/g, ''))}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setF(x => ({ ...x, items: [...x.items, {}] }))}
            className="w-full py-1.5 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg"
          >
            + Agregar renglón
          </button>
        </div>
      </div>

      <div>
        <label className="label">Total de la factura</label>
        <input
          className="input tabular-nums" inputMode="numeric"
          value={f.total === '' ? '' : money.format(f.total)}
          onChange={e => { setF(x => ({ ...x, total: Number(e.target.value.replace(/[^\d]/g, '')) || '' })); setRepetidas(null); }}
        />
      </div>

      {repetidas && (
        <AvisoRepetida repetidas={repetidas} guardando={guardando} onGuardarIgual={() => guardar(true)} />
      )}
    </Modal>
  );
}

// ── Listado ──────────────────────────────────────────────────────────────────

export default function PendientesSection({ proveedores, locales, onCambio }) {
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtro, setFiltro] = useState('todas');
  const [provFiltro, setProvFiltro] = useState('');
  const [localFiltro, setLocalFiltro] = useState('');

  const [pagando, setPagando] = useState(null);
  const [manual, setManual]   = useState(false);
  const [editando, setEditando] = useState(null);   // la factura con sus renglones

  // Las tildadas para pagar juntas. Se elige a mano, factura por factura.
  const [elegidas, setElegidas] = useState(new Set());
  const [pagandoVarias, setPagandoVarias] = useState(false);

  function cargar() {
    setCargando(true);
    api.get('/proveedores/facturas')
      .then(r => { setFacturas(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron traer las facturas'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function anotarPago(pagos) {
    await api.post('/proveedores/pagos', { pagos });
    setPagando(null);
    setPagandoVarias(false);
    setElegidas(new Set());
    cargar();
    onCambio?.();
  }

  function alternar(id) {
    setElegidas(prev => {
      const nueva = new Set(prev);
      if (nueva.has(id)) nueva.delete(id); else nueva.add(id);
      return nueva;
    });
  }

  async function guardarManual(fd) {
    await api.post('/proveedores/facturas', fd);
    setManual(false);
    cargar();
    onCambio?.();
  }

  async function abrirEdicion(f) {
    try {
      const r = await api.get(`/proveedores/facturas/${f.id}`);
      setEditando(r.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo abrir la factura');
    }
  }

  async function guardarEdicion(fd) {
    await api.put(`/proveedores/facturas/${editando.id}`, fd);
    setEditando(null);
    cargar();
    onCambio?.();
  }

  // "Es otra": el encargado miró las dos y no son la misma.
  async function esOtra(f) {
    try {
      await api.patch(`/proveedores/facturas/${f.id}/es-otra`);
      setError('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo marcar la factura');
    }
  }

  async function borrar(f) {
    const ok = window.confirm(
      `¿Borrar la factura ${f.numero || 'sin número'} de ${f.proveedor} por ${plata(f.total)}?\nNo se puede deshacer.`
    );
    if (!ok) return;
    try {
      await api.delete(`/proveedores/facturas/${f.id}`);
      setError('');
      cargar();
      onCambio?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar la factura');
    }
  }

  const antiguedad = f => -diasHasta(f.fecha);
  const viejas   = facturas.filter(f => antiguedad(f) > DIAS_VIEJA);
  const masVieja = facturas.reduce((m, f) => Math.max(m, antiguedad(f)), 0);
  const deuda    = facturas.reduce((s, f) => s + f.saldo, 0);
  const aRevisar = facturas.filter(f => f.repetida_de?.length);

  let lista = facturas;
  if (filtro === 'viejas')    lista = viejas;
  if (filtro === 'parciales') lista = facturas.filter(f => f.pagado > 0);
  if (filtro === 'revisar')   lista = aRevisar;
  if (provFiltro)  lista = lista.filter(f => String(f.proveedor_id) === String(provFiltro));
  if (localFiltro) lista = lista.filter(f => String(f.local_id) === String(localFiltro));

  // Tildar todas las que se ven con el filtro puesto, o destildarlas si ya están todas.
  const todasVisiblesElegidas = lista.length > 0 && lista.every(f => elegidas.has(f.id));
  function alternarVisibles() {
    setElegidas(prev => {
      const nueva = new Set(prev);
      if (todasVisiblesElegidas) lista.forEach(f => nueva.delete(f.id));
      else lista.forEach(f => nueva.add(f.id));
      return nueva;
    });
  }
  const seleccion = facturas.filter(f => elegidas.has(f.id));
  const totalElegido = seleccion.reduce((s, f) => s + f.saldo, 0);

  if (cargando) return <p className="text-sm text-ahg-text/50 p-4">Cargando facturas…</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile titulo="Deuda total" valor={plata(deuda)}
              detalle={`${facturas.length} factura${facturas.length === 1 ? '' : 's'} sin cerrar`} />
        <Tile titulo={`Más de ${DIAS_VIEJA} días`} tono="alerta"
              valor={plata(viejas.reduce((s, f) => s + f.saldo, 0))}
              detalle={`${viejas.length} factura${viejas.length === 1 ? '' : 's'} de hace más de un mes`} />
        <Tile titulo="La más vieja" tono="aviso"
              valor={masVieja ? `${masVieja} días` : '—'}
              detalle="sin pagar desde su fecha" />
        <Tile titulo="Para revisar" tono={aRevisar.length ? 'aviso' : 'bueno'}
              valor={aRevisar.length}
              detalle={aRevisar.length ? `posible${aRevisar.length === 1 ? '' : 's'} repetida${aRevisar.length === 1 ? '' : 's'}` : 'ninguna parece repetida'} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Selector
          opciones={FILTROS.map(o => (o.id === 'revisar' && aRevisar.length ? { ...o, label: `${o.label} (${aRevisar.length})` } : o))}
          valor={filtro} onChange={setFiltro}
        />
        <select className="input w-auto text-sm" value={provFiltro} onChange={e => setProvFiltro(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="input w-auto text-sm" value={localFiltro} onChange={e => setLocalFiltro(e.target.value)}>
          <option value="">Todos los locales</option>
          {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => setManual(true)} disabled={!proveedores.length}>
          + Cargar factura a mano
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ahg-accent/30">
              <th className="table-th w-8">
                <input
                  type="checkbox" className="w-4 h-4 accent-violet-900 align-middle"
                  checked={todasVisiblesElegidas} onChange={alternarVisibles}
                  aria-label="Tildar todas las facturas que se ven"
                  title="Tildar todas las que se ven"
                />
              </th>
              <th className="table-th">Proveedor</th>
              <th className="table-th">Factura</th>
              <th className="table-th">Local</th>
              <th className="table-th">Hace</th>
              <th className="table-th text-right">Total</th>
              <th className="table-th text-right">Pagado</th>
              <th className="table-th text-right">Saldo</th>
              <th className="table-th">De dónde salió</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map(f => (
              <tr key={f.id} className={`border-b border-ahg-accent/20 hover:bg-ahg-bg ${
                elegidas.has(f.id) ? 'bg-ahg-accent/10' : f.repetida_de?.length ? 'bg-amber-50' : ''
              }`}>
                <td className="table-td">
                  <input
                    type="checkbox" className="w-4 h-4 accent-violet-900 align-middle"
                    checked={elegidas.has(f.id)} onChange={() => alternar(f.id)}
                    aria-label={`Elegir la factura ${f.numero || 'sin número'} de ${f.proveedor}`}
                  />
                </td>
                <td className="table-td font-medium">
                  {f.proveedor}
                  <span className="block text-xs text-ahg-text/40">
                    cobra {listaDias(f.dias_pago)}
                  </span>
                </td>
                <td className="table-td">
                  {f.numero || <span className="text-ahg-text/30">sin número</span>}
                  {f.tiene_foto && <VerFoto facturaId={f.id} />}
                  <span className="block text-xs text-ahg-text/40">del {fechaCorta(f.fecha)}</span>
                  {f.repetida_de?.length > 0 && (
                    <span
                      className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300"
                      title={`Parece la misma que: ${f.repetida_de.map(o => `${o.numero || 'sin número'} del ${fechaCorta(o.fecha)} por ${plata(o.total)}`).join(' · ')}`}
                    >
                      ¿Repetida?
                    </span>
                  )}
                </td>
                <td className="table-td">{f.local_nombre}</td>
                <td className="table-td"><ChipAntiguedad fecha={f.fecha} /></td>
                <td className="table-td text-right tabular-nums">{plata(f.total)}</td>
                <td className="table-td text-right tabular-nums">
                  {f.pagado > 0
                    ? <span className="text-ahg-primary font-medium">{plata(f.pagado)}</span>
                    : <span className="text-ahg-text/30">—</span>}
                </td>
                <td className="table-td text-right tabular-nums font-semibold">{plata(f.saldo)}</td>
                <td className="table-td text-xs text-ahg-text/50">
                  {f.origen === 'formulario' ? 'Formulario' : f.origen === 'planilla' ? 'Planilla' : 'A mano'}
                  {f.origen === 'planilla'
                    ? <span className="block">{f.importado_de}</span>
                    : f.cargada_por && <span className="block">{f.cargada_por}</span>}
                </td>
                <td className="table-td text-right whitespace-nowrap">
                  <button className="btn-primary text-xs px-3 py-1.5" onClick={() => setPagando(f)}>
                    Anotar pago
                  </button>
                  <span className="block mt-1 text-xs">
                    {f.repetida_de?.length > 0 && (
                      <>
                        <button className="text-amber-800 font-semibold hover:underline" onClick={() => esOtra(f)}>
                          Es otra
                        </button>
                        <span className="text-ahg-text/30 mx-1.5">·</span>
                      </>
                    )}
                    <button className="text-ahg-primary font-semibold hover:underline" onClick={() => abrirEdicion(f)}>
                      Editar
                    </button>
                    <span className="text-ahg-text/30 mx-1.5">·</span>
                    <button className="text-red-600 font-semibold hover:underline" onClick={() => borrar(f)}>
                      Borrar
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {!lista.length && (
              <tr>
                <td colSpan={10} className="table-td text-center text-ahg-text/40 py-8">
                  No hay facturas con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {seleccion.length > 0 && (
        <div className="card p-4 flex items-center gap-4 flex-wrap sticky bottom-0 border-2 border-ahg-primary">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Elegidas</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {seleccion.length} <span className="text-sm font-semibold text-ahg-text/50">factura{seleccion.length === 1 ? '' : 's'}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">Total a pagar</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {plata(totalElegido)}
            </p>
          </div>
          <p className="text-xs text-ahg-text/50 max-w-xs">
            {new Set(seleccion.map(f => f.proveedor)).size === 1
              ? seleccion[0].proveedor
              : `${new Set(seleccion.map(f => f.proveedor)).size} proveedores`}
            {' '}· cada una sale con la forma de pago de su ficha.
          </p>
          <div className="flex-1" />
          <button className="btn-secondary" onClick={() => setElegidas(new Set())}>Destildar todo</button>
          <button className="btn-primary" onClick={() => setPagandoVarias(true)}>
            Anotar los pagos elegidos
          </button>
        </div>
      )}

      {pagando && (
        <ModalPago factura={pagando} onGuardar={anotarPago} onCerrar={() => setPagando(null)} />
      )}
      {pagandoVarias && (
        <ModalPago grupo={seleccion} onGuardar={anotarPago} onCerrar={() => setPagandoVarias(false)} />
      )}
      {editando && (
        <ModalFacturaManual
          proveedores={proveedores} locales={locales} inicial={editando}
          onGuardar={guardarEdicion} onCerrar={() => setEditando(null)}
        />
      )}

      {manual && (
        <ModalFacturaManual
          proveedores={proveedores} locales={locales}
          onGuardar={guardarManual} onCerrar={() => setManual(false)}
        />
      )}
    </div>
  );
}
