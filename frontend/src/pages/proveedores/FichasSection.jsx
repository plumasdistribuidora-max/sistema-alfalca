import { useState } from 'react';
import api from '../../api';
import {
  plata, Modal, Selector, MEDIOS, ChipDias, ChipMedio, DIAS_CORTO,
  fechaCorta, listaDias,
} from './comunes';

// El maestro de proveedores. Lo carga el encargado una sola vez: de acá sale la
// lista que ve el turno cuando carga una factura, la forma de pago que viene
// marcada al pagar, y el plazo con el que se calcula cada vencimiento.

const PLAZOS = [0, 7, 15, 21, 30, 45, 60];

function ModalProveedor({ proveedor, onGuardar, onCerrar }) {
  const [f, setF] = useState({
    nombre:     proveedor?.nombre || '',
    medio_pago: proveedor?.medio_pago || 'santander',
    dias_pago:  proveedor?.dias_pago?.map(Number) || [],
    plazo_dias: proveedor?.plazo_dias ?? 30,
    nota:       proveedor?.nota || '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function alternarDia(d) {
    setF(x => ({
      ...x,
      dias_pago: x.dias_pago.includes(d) ? x.dias_pago.filter(y => y !== d) : [...x.dias_pago, d],
    }));
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await onGuardar(f);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el proveedor');
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
      subtitulo="Se carga una sola vez. Después el turno lo elige de la lista."
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar proveedor'}
          </button>
        </>
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <label className="label">Nombre</label>
        <input
          className="input" value={f.nombre} placeholder="Ej: Lácteos Cuyo"
          onChange={e => setF(x => ({ ...x, nombre: e.target.value }))}
        />
      </div>

      <div>
        <label className="label">Forma de pago habitual</label>
        <Selector opciones={MEDIOS} valor={f.medio_pago} onChange={v => setF(x => ({ ...x, medio_pago: v }))} />
        <p className="text-xs text-ahg-text/50 mt-1">
          Es la que viene marcada al anotarle un pago. Se puede cambiar en el momento.
        </p>
      </div>

      <div>
        <label className="label">Días en que cobra</label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => alternarDia(d)}
              className={`w-12 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                f.dias_pago.includes(d)
                  ? 'bg-ahg-primary text-white border-ahg-primary'
                  : 'bg-white text-ahg-text/50 border-ahg-accent/50 hover:border-ahg-primary'
              }`}
            >
              {DIAS_CORTO[d]}
            </button>
          ))}
        </div>
        <p className="text-xs text-ahg-text/50 mt-1">
          Con esto el sistema avisa si estás por pagarle un día que no cobra.
        </p>
      </div>

      <div>
        <label className="label">Plazo de la factura</label>
        <select
          className="input" value={f.plazo_dias}
          onChange={e => setF(x => ({ ...x, plazo_dias: Number(e.target.value) }))}
        >
          {PLAZOS.map(p => (
            <option key={p} value={p}>{p === 0 ? 'Contado' : `${p} días`}</option>
          ))}
        </select>
        <p className="text-xs text-ahg-text/50 mt-1">
          Con esto se calcula solo el vencimiento de cada factura que carga el turno.
        </p>
      </div>

      <div>
        <label className="label">
          Nota o contacto <span className="text-xs font-normal text-ahg-text/50">(opcional)</span>
        </label>
        <input
          className="input" value={f.nota} placeholder="Ej: pedidos por WhatsApp, pasa martes y viernes"
          onChange={e => setF(x => ({ ...x, nota: e.target.value }))}
        />
      </div>
    </Modal>
  );
}

export default function FichasSection({ proveedores, cargando, onCambio }) {
  const [editando, setEditando] = useState(null);   // proveedor | 'nuevo' | null
  const [error, setError] = useState('');

  async function guardar(datos) {
    if (editando === 'nuevo') await api.post('/proveedores', datos);
    else await api.put(`/proveedores/${editando.id}`, datos);
    setEditando(null);
    onCambio?.();
  }

  async function borrar(p) {
    if (!confirm(`¿Sacar a ${p.nombre} de la lista?`)) return;
    try {
      const r = await api.delete(`/proveedores/${p.id}`);
      if (r.data.data?.desactivado) {
        setError(`${p.nombre} tiene ${r.data.data.facturas} facturas cargadas, así que quedó desactivado en vez de borrado: no le aparece más al turno, pero el histórico se mantiene.`);
      } else {
        setError('');
      }
      onCambio?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar el proveedor');
    }
  }

  if (cargando) return <p className="text-sm text-ahg-text/50 p-4">Cargando proveedores…</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{error}</p>}

      <div className="card p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
            La lista que ve el turno
          </h2>
          <p className="text-xs text-ahg-text/50 mt-0.5">
            Quien carga el reporte no escribe el nombre del proveedor: lo elige de acá. Por eso
            cada uno se carga una sola vez, con su forma de pago y los días en que cobra.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditando('nuevo')}>+ Nuevo proveedor</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {proveedores.map(p => (
          <div key={p.id} className={`card p-4 ${p.activo ? '' : 'opacity-60'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <h3 className="font-bold truncate" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {p.nombre}
                </h3>
                <p className="text-xs text-ahg-text/50">
                  {p.plazo_dias === 0 ? 'Contado' : `${p.plazo_dias} días de plazo`}
                  {!p.activo && ' · desactivado'}
                </p>
              </div>
              <button
                onClick={() => setEditando(p)}
                className="ml-auto text-xs font-semibold text-ahg-primary hover:underline"
              >
                Editar
              </button>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <ChipMedio medio={p.medio_pago} />
              <ChipDias dias={p.dias_pago} />
            </div>

            <p
              className={`text-2xl font-bold tabular-nums mt-3 ${p.deuda > 0 ? 'text-ahg-text' : 'text-green-700'}`}
              style={{ fontFamily: 'Nunito, sans-serif' }}
            >
              {plata(p.deuda)}
            </p>
            <p className="text-xs text-ahg-text/50">
              {p.deuda > 0
                ? `en ${p.facturas_abiertas} factura${p.facturas_abiertas === 1 ? '' : 's'}`
                : 'al día'}
              {p.vencidas > 0 && (
                <span className="text-red-600 font-semibold"> · {p.vencidas} vencida{p.vencidas === 1 ? '' : 's'}</span>
              )}
            </p>

            <dl className="grid grid-cols-2 gap-y-1 mt-3 text-xs">
              <dt className="text-ahg-text/50">Próximo vencimiento</dt>
              <dd className="text-right font-medium">{fechaCorta(p.proximo_vencimiento)}</dd>
              <dt className="text-ahg-text/50">Cobra</dt>
              <dd className="text-right font-medium">{listaDias(p.dias_pago)}</dd>
              <dt className="text-ahg-text/50">Le pagamos</dt>
              <dd className="text-right font-medium tabular-nums">{plata(p.pagado_historico)}</dd>
            </dl>

            {p.nota && <p className="text-xs text-ahg-text/40 mt-2 italic">{p.nota}</p>}

            <button
              onClick={() => borrar(p)}
              className="text-xs text-red-500 hover:underline mt-3"
            >
              Sacar de la lista
            </button>
          </div>
        ))}

        {!proveedores.length && (
          <div className="card p-8 text-center text-ahg-text/40 sm:col-span-2 lg:col-span-3">
            Todavía no hay proveedores cargados. Empezá por los que más te compran.
          </div>
        )}
      </div>

      {editando && (
        <ModalProveedor
          proveedor={editando === 'nuevo' ? null : editando}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
