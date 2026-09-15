import { useState, useEffect } from 'react';
import api from '../../api';
import {
  plata, money, Tile, ChipVencimiento, ModalPago, Modal, Selector,
  hoyStr, sumarDias, fechaCorta, finDeSemana, listaDias,
} from './comunes';

const FILTROS = [
  { id: 'todas',     label: 'Todas' },
  { id: 'vencidas',  label: 'Vencidas' },
  { id: 'semana',    label: 'Vencen esta semana' },
  { id: 'parciales', label: 'Pagadas a medias' },
];

// ── Factura cargada a mano ───────────────────────────────────────────────────
// Para lo que no pasa por el formulario del turno: alquiler, servicios, una compra
// puntual del dueño.

function ModalFacturaManual({ proveedores, locales, onGuardar, onCerrar }) {
  const [f, setF] = useState({
    proveedor_id: proveedores[0]?.id || '',
    local_id: locales[0]?.id || '',
    numero: '', fecha: hoyStr(), total: '', items: [{}],
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const prov  = proveedores.find(p => String(p.id) === String(f.proveedor_id));
  const vence = prov ? sumarDias(f.fecha, prov.plazo_dias) : f.fecha;

  function editarItem(i, campo, v) {
    setF(x => ({ ...x, items: x.items.map((it, idx) => idx === i ? { ...it, [campo]: v } : it) }));
  }

  async function guardar() {
    if (!f.total) { setError('Falta el total de la factura'); return; }
    setGuardando(true);
    setError('');
    try {
      await onGuardar({
        ...f,
        vencimiento: vence,
        items: f.items.filter(i => i.producto?.trim()),
      });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la factura');
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo="Cargar una factura a mano"
      subtitulo="Para lo que no pasa por el formulario del turno"
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar la factura'}
          </button>
        </>
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <label className="label">Proveedor</label>
        <select
          className="input" value={f.proveedor_id}
          onChange={e => setF(x => ({ ...x, proveedor_id: e.target.value }))}
        >
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Número de factura</label>
          <input
            className="input" placeholder="A 0004-00013455" value={f.numero}
            onChange={e => setF(x => ({ ...x, numero: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Local</label>
          <select
            className="input" value={f.local_id}
            onChange={e => setF(x => ({ ...x, local_id: e.target.value }))}
          >
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Fecha de la factura</label>
          <input
            type="date" className="input" value={f.fecha}
            onChange={e => setF(x => ({ ...x, fecha: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Vence</label>
          <input className="input bg-ahg-bg" value={fechaCorta(vence)} readOnly />
          <p className="text-xs text-ahg-text/50 mt-1">
            {prov?.plazo_dias === 0 ? 'Cobra contado.' : `Sale de los ${prov?.plazo_dias} días de la ficha.`}
          </p>
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
            <div key={i} className="flex gap-1.5">
              <input
                className="input text-sm flex-1" placeholder="Producto"
                value={it.producto || ''} onChange={e => editarItem(i, 'producto', e.target.value)}
              />
              <input
                className="input text-sm w-16 text-right" inputMode="decimal" placeholder="cant"
                value={it.cantidad ?? ''}
                onChange={e => editarItem(i, 'cantidad', e.target.value.replace(',', '.'))}
              />
              <input
                className="input text-sm w-24 text-right" inputMode="numeric" placeholder="$ c/u"
                value={it.precio_unit ?? ''}
                onChange={e => editarItem(i, 'precio_unit', e.target.value.replace(/[^\d]/g, ''))}
              />
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
          onChange={e => setF(x => ({ ...x, total: Number(e.target.value.replace(/[^\d]/g, '')) || '' }))}
        />
      </div>
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

  // Las tildadas para pagar juntas. Se elige a mano, factura por factura, sin que el
  // vencimiento limite nada: la fecha en que "debería" pagarse es un dato, no una regla.
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

  async function guardarManual(f) {
    await api.post('/proveedores/facturas', f);
    setManual(false);
    cargar();
    onCambio?.();
  }

  const hoy  = hoyStr();
  const finS = finDeSemana();

  const vencidas = facturas.filter(f => f.vencimiento && f.vencimiento < hoy);
  const semana   = facturas.filter(f => f.vencimiento && f.vencimiento >= hoy && f.vencimiento <= finS);
  const deuda    = facturas.reduce((s, f) => s + f.saldo, 0);

  let lista = facturas;
  if (filtro === 'vencidas')  lista = vencidas;
  if (filtro === 'semana')    lista = semana;
  if (filtro === 'parciales') lista = facturas.filter(f => f.pagado > 0);
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
        <Tile titulo="Vencido" tono="alerta"
              valor={plata(vencidas.reduce((s, f) => s + f.saldo, 0))}
              detalle={`${vencidas.length} pasada${vencidas.length === 1 ? '' : 's'} de fecha`} />
        <Tile titulo="Vence esta semana" tono="aviso"
              valor={plata(semana.reduce((s, f) => s + f.saldo, 0))}
              detalle={`${semana.length} hasta el domingo`} />
        <Tile titulo="Proveedores con deuda" tono="normal"
              valor={new Set(facturas.map(f => f.proveedor)).size}
              detalle="de los que hay cargados" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Selector opciones={FILTROS} valor={filtro} onChange={setFiltro} />
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
              <th className="table-th">Vence</th>
              <th className="table-th text-right">Total</th>
              <th className="table-th text-right">Pagado</th>
              <th className="table-th text-right">Saldo</th>
              <th className="table-th">De dónde salió</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map(f => (
              <tr key={f.id} className={`border-b border-ahg-accent/20 hover:bg-ahg-bg ${elegidas.has(f.id) ? 'bg-ahg-accent/10' : ''}`}>
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
                  <span className="block text-xs text-ahg-text/40">del {fechaCorta(f.fecha)}</span>
                </td>
                <td className="table-td">{f.local_nombre}</td>
                <td className="table-td"><ChipVencimiento vencimiento={f.vencimiento} /></td>
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
                <td className="table-td text-right">
                  <button className="btn-primary text-xs px-3 py-1.5" onClick={() => setPagando(f)}>
                    Anotar pago
                  </button>
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
      {manual && (
        <ModalFacturaManual
          proveedores={proveedores} locales={locales}
          onGuardar={guardarManual} onCerrar={() => setManual(false)}
        />
      )}
    </div>
  );
}
