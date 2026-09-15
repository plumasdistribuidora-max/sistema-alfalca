import { useState } from 'react';

// Piezas que comparten las cuatro solapas de proveedores.

export const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const plata = v => `$ ${money.format(Math.round(Number(v) || 0))}`;

// Los mismos medios que Cash Flow, más cheque. El código es el que guarda la base.
export const MEDIOS = [
  { id: 'santander', label: 'Santander' },
  { id: 'mp',        label: 'Mercado Pago' },
  { id: 'galicia',   label: 'Galicia' },
  { id: 'efectivo',  label: 'Efectivo' },
  { id: 'cheque',    label: 'Cheque' },
];
export const medioLabel = id => MEDIOS.find(m => m.id === id)?.label || id || '—';

export const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Las fechas viajan como 'YYYY-MM-DD' y se comparan como texto. Construir un Date
// con ese string lo interpreta en UTC y en Argentina corre un día para atrás, así
// que todas estas funciones parten el string a mano.
export function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
export function aDate(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}
export function sumarDias(iso, n) {
  const d = aDate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const fechaCorta = iso => {
  if (!iso) return '—';
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
};
export const fechaLarga = iso => {
  if (!iso) return '—';
  const d = aDate(iso);
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
};
export const diasHasta = iso => Math.round((aDate(iso) - aDate(hoyStr())) / 86400000);

export const listaDias = dias => {
  const d = (dias || []).map(Number).sort();
  if (!d.length) return 'sin días cargados';
  if (d.length >= 6) return 'cualquier día';
  return d.map(x => DIAS_CORTO[x].toLowerCase()).join(' y ');
};

export function proximoDiaPago(dias, desde = hoyStr()) {
  const lista = (dias || []).map(Number);
  if (!lista.length) return null;
  for (let i = 0; i < 14; i++) {
    const f = sumarDias(desde, i);
    if (lista.includes(aDate(f).getDay())) return f;
  }
  return null;
}

// ── Presentación ─────────────────────────────────────────────────────────────

// Cuántos días lleva la factura sin pagarse, contados desde su fecha. Es lo que el
// dueño mira para decidir qué pagar: no el vencimiento.
export function ChipAntiguedad({ fecha }) {
  if (!fecha) return <span className="text-ahg-text/30">—</span>;
  const d = -diasHasta(fecha);
  const base = 'inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap';
  const tono = d > 30 ? 'bg-red-50 text-red-700 border-red-200'
             : d > 7  ? 'bg-amber-50 text-amber-700 border-amber-200'
             :          'bg-green-50 text-green-700 border-green-200';
  const texto = d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`;
  return <span className={`${base} ${tono}`}>{texto}</span>;
}

export function ChipDias({ dias }) {
  const marcados = (dias || []).map(Number);
  return (
    <span className="inline-flex gap-0.5" title={`Cobra ${listaDias(dias)}`}>
      {[1, 2, 3, 4, 5, 6].map(d => (
        <span
          key={d}
          className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center border ${
            marcados.includes(d)
              ? 'bg-ahg-primary text-white border-ahg-primary'
              : 'bg-ahg-bg text-ahg-text/40 border-ahg-accent/40'
          }`}
        >
          {DIAS_CORTO[d][0]}
        </span>
      ))}
    </span>
  );
}

export function ChipMedio({ medio }) {
  return (
    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-ahg-accent/20 text-ahg-primary border border-ahg-accent/50">
      {medioLabel(medio)}
    </span>
  );
}

export function Tile({ titulo, valor, detalle, tono = 'normal' }) {
  const borde = {
    normal: 'border-l-ahg-accent',
    alerta: 'border-l-red-500',
    aviso:  'border-l-amber-500',
    bueno:  'border-l-green-600',
  }[tono];
  const color = {
    normal: 'text-ahg-text', alerta: 'text-red-700', aviso: 'text-amber-700', bueno: 'text-green-700',
  }[tono];

  return (
    <div className={`card p-3.5 border-l-4 ${borde}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ahg-text/40">{titulo}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`} style={{ fontFamily: 'Nunito, sans-serif' }}>
        {valor}
      </p>
      {detalle && <p className="text-xs text-ahg-text/50 mt-0.5">{detalle}</p>}
    </div>
  );
}

export function Selector({ opciones, valor, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
            valor === o.id
              ? 'bg-ahg-primary text-white border-ahg-primary'
              : 'bg-white text-ahg-text/60 border-ahg-accent/50 hover:border-ahg-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ titulo, subtitulo, children, onCerrar, pie }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-3 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md my-4 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-ahg-accent/30">
          <h2 className="text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</h2>
          {subtitulo && <p className="text-xs text-ahg-text/50 mt-0.5">{subtitulo}</p>}
        </div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="px-5 py-3 border-t border-ahg-accent/30 bg-ahg-bg flex gap-2 justify-end">{pie}</div>
      </div>
    </div>
  );
}

// ── Modal de pago ────────────────────────────────────────────────────────────
// Sirve para una factura suelta (desde el listado) y para varias juntas (desde el
// plan). En el segundo caso el monto no se edita: se paga el saldo completo.

export function ModalPago({ factura, grupo, onGuardar, onCerrar }) {
  const unaSola = !!factura;
  const saldoTotal = unaSola
    ? factura.saldo
    : grupo.reduce((s, f) => s + f.saldo, 0);

  const [monto, setMonto]   = useState(String(Math.round(saldoTotal)));
  const [fecha, setFecha]   = useState(hoyStr());
  const [medio, setMedio]   = useState(unaSola ? factura.medio_pago : (grupo[0]?.medio_pago || 'santander'));
  const [comp, setComp]     = useState('');
  const [guardando, setGuardando] = useState(false);

  const montoNum = Number(String(monto).replace(/[^\d]/g, '')) || 0;
  const resto    = saldoTotal - montoNum;

  const diaOk = unaSola && (factura.dias_pago || []).map(Number).includes(aDate(fecha).getDay());
  const proximo = unaSola ? proximoDiaPago(factura.dias_pago, fecha) : null;

  async function guardar() {
    setGuardando(true);
    try {
      if (unaSola) {
        await onGuardar([{ factura_id: factura.id, monto: montoNum, fecha, medio, comprobante: comp }]);
      } else {
        // Cada factura con la forma de pago de su proveedor: en un mismo plan puede
        // haber uno que cobra por transferencia y otro en efectivo.
        await onGuardar(grupo.map(f => ({
          factura_id: f.id, monto: f.saldo, fecha, medio: f.medio_pago, comprobante: '',
        })));
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={unaSola ? 'Anotar un pago' : 'Anotar los pagos elegidos'}
      subtitulo={unaSola
        ? `${factura.proveedor} · ${factura.numero || 'sin número'} · ${factura.local_nombre || ''}`
        : `${grupo.length} factura${grupo.length === 1 ? '' : 's'} de ${new Set(grupo.map(f => f.proveedor)).size} proveedor${new Set(grupo.map(f => f.proveedor)).size === 1 ? '' : 'es'}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={guardando || (unaSola && montoNum <= 0)}
            onClick={guardar}
          >
            {guardando ? 'Guardando…' : unaSola ? 'Guardar el pago' : 'Anotar los pagos'}
          </button>
        </>
      }
    >
      <div className="rounded-lg bg-ahg-bg border border-ahg-accent/40 px-3 py-2.5 flex justify-between text-sm">
        <span className="text-ahg-text/60">{unaSola ? 'Saldo de esta factura' : 'Total a anotar'}</span>
        <strong className="tabular-nums">{plata(saldoTotal)}</strong>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {unaSola && (
          <div>
            <label className="label">Cuánto pagás</label>
            <input
              className="input tabular-nums" inputMode="numeric"
              value={montoNum === 0 ? '' : money.format(montoNum)}
              onChange={e => setMonto(e.target.value)}
            />
            <p className="text-xs text-ahg-text/50 mt-1">
              {montoNum <= 0 ? 'Poné cuánto pagás.'
                : resto > 0 ? `Pago parcial: quedan ${plata(resto)} pendientes.`
                : resto === 0 ? 'Con esto la factura queda saldada.'
                : `Es ${plata(-resto)} más que el saldo.`}
            </p>
          </div>
        )}
        <div className={unaSola ? '' : 'col-span-2'}>
          <label className="label">Cuándo</label>
          <input type="date" className="input" value={fecha} onChange={e => setFecha(e.target.value)} />
          {!unaSola && (
            <p className="text-xs text-ahg-text/50 mt-1">
              El día de cobro es orientativo: se anota con la fecha que pongas.
            </p>
          )}
          {unaSola && (
            <p className={`text-xs mt-1 ${diaOk ? 'text-green-700' : 'text-amber-700'}`}>
              {diaOk
                ? 'Es día de cobro de este proveedor.'
                : `Cobra ${listaDias(factura.dias_pago)}${proximo ? ` · el próximo es el ${fechaLarga(proximo)}` : ''}. Igual podés pagar hoy.`}
            </p>
          )}
        </div>
      </div>

      {unaSola ? (
        <div>
          <label className="label">Cómo se pagó</label>
          <Selector opciones={MEDIOS} valor={medio} onChange={setMedio} />
          <p className="text-xs text-ahg-text/50 mt-1">
            Viene marcada la forma de pago de la ficha del proveedor.
          </p>
        </div>
      ) : (
        <div>
          <label className="label">Cada uno con su forma de pago</label>
          <div className="rounded-lg border border-ahg-accent/40 divide-y divide-ahg-accent/30">
            {Object.entries(grupo.reduce((acc, f) => {
              acc[f.proveedor] = acc[f.proveedor] || { medio: f.medio_pago, total: 0 };
              acc[f.proveedor].total += f.saldo;
              return acc;
            }, {})).map(([nombre, d]) => (
              <div key={nombre} className="flex gap-2 px-3 py-2 text-sm">
                <span className="flex-1 font-medium truncate">{nombre}</span>
                <span className="text-ahg-text/50">{medioLabel(d.medio)}</span>
                <span className="tabular-nums font-semibold">{plata(d.total)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-ahg-text/50 mt-1">
            Sale de la ficha de cada proveedor. Si alguno se pagó distinto, se corrige después desde Pagos hechos.
          </p>
        </div>
      )}

      {unaSola && (
        <div>
          <label className="label">
            Número de transferencia o cheque
            <span className="text-xs font-normal text-ahg-text/50"> (opcional)</span>
          </label>
          <input className="input" value={comp} onChange={e => setComp(e.target.value)} placeholder="Ej: 418-2290" />
        </div>
      )}
    </Modal>
  );
}
