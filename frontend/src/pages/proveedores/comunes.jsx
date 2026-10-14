import { useState, useEffect } from 'react';
import api from '../../api';
import { comprimir } from '../../utils/fotos';

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

// El último día de cobro hasta hoy (o hoy mismo, si cobra hoy). Es la fecha con que
// arranca un pago: casi siempre se anota después de pagar, y el 11/10/2026, un domingo,
// se anotaron 47 pagos del viernes con fecha domingo porque la fecha venía en "hoy".
export function ultimoDiaCobro(dias, hasta = hoyStr()) {
  const lista = (dias || []).map(Number);
  if (!lista.length) return hasta;
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(hasta, -i);
    if (lista.includes(aDate(f).getDay())) return f;
  }
  return hasta;
}

// ── Número de factura ────────────────────────────────────────────────────────
// Dos casilleros, punto de venta y número, y el servidor completa los ceros: así
// no conviven "0027-0001368", "002700013674" y "00274-00013611" para la misma cosa.

export function partirNumero(numero) {
  if (!numero) return { pv: '', num: '', sin: false };
  const s = String(numero).trim();
  let m = /^\D*(\d{1,5})\D+(\d{1,8})\D*$/.exec(s);
  if (m) return { pv: m[1], num: m[2], sin: false };
  m = /^(\d{4,5})(\d{8})$/.exec(s);
  if (m) return { pv: m[1], num: m[2], sin: false };
  // Lo que no se puede partir ("Nota de pedido", "4.252E+11") se muestra para que
  // lo corrijan a mano.
  return { pv: '', num: '', sin: false, antes: s };
}

export const armarNumero = v => (v.sin ? '' : `${v.pv}-${v.num}`);
export const numeroCompleto = v => v.sin || (v.pv !== '' && Number(v.num) > 0);

export function NumeroFactura({ valor, onChange }) {
  const set = (campo, x) => onChange({ ...valor, [campo]: x });
  return (
    <div>
      <label className="label">Número de factura</label>
      <div className={`flex items-center gap-1.5 ${valor.sin ? 'opacity-40' : ''}`}>
        <input
          className="input w-20 text-center tabular-nums" inputMode="numeric" placeholder="0027"
          aria-label="Punto de venta" maxLength={5} disabled={valor.sin}
          value={valor.pv} onChange={e => set('pv', e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-ahg-text/40">-</span>
        <input
          className="input flex-1 tabular-nums" inputMode="numeric" placeholder="00013674"
          aria-label="Número" maxLength={8} disabled={valor.sin}
          value={valor.num} onChange={e => set('num', e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <p className="text-xs text-ahg-text/50 mt-1">
        Punto de venta y número, como vienen en la factura. Los ceros de adelante los completa el sistema.
      </p>
      {valor.antes && !valor.sin && (
        <p className="text-xs text-amber-700 mt-1">Estaba cargado como "{valor.antes}". Pasalo a los dos casilleros.</p>
      )}
      <label className="flex items-center gap-2 mt-1.5 text-sm text-ahg-text/70">
        <input type="checkbox" className="w-4 h-4" checked={valor.sin} onChange={e => set('sin', e.target.checked)} />
        No tiene número (nota de pedido, remito)
      </label>
    </div>
  );
}

// ── Foto de la factura ───────────────────────────────────────────────────────

// El casillero para sacar o elegir la foto. La achica antes de devolverla, como las
// fotos del reporte, para que suba aunque la señal sea mala.
export function ElegirFoto({ archivo, onElegir, yaTiene = false, obligatoria = true }) {
  const [vista, setVista] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!archivo) { setVista(null); return undefined; }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  async function elegir(file) {
    setProcesando(true);
    setError('');
    try {
      onElegir(await comprimir(file));
    } catch (err) {
      setError(err.message || 'No se pudo leer la foto');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <label className="label">
        Foto de la factura
        {obligatoria && !yaTiene && <span className="text-xs font-normal text-ahg-text/50"> (obligatoria)</span>}
      </label>
      <label className={`flex items-center gap-3 p-3 rounded-lg border border-dashed cursor-pointer hover:bg-ahg-accent/10 ${
        archivo ? 'border-ahg-accent bg-white' : 'border-ahg-primary bg-ahg-bg'
      } ${procesando ? 'opacity-50 pointer-events-none' : ''}`}>
        {vista
          ? <img src={vista} alt="" className="w-12 h-16 object-cover rounded border border-ahg-accent/40" />
          : <span className="w-12 h-16 rounded border border-ahg-accent/40 bg-white flex items-center justify-center text-2xl text-ahg-primary">+</span>}
        <span className="flex-1 text-sm">
          <span className="font-semibold text-ahg-primary">
            {procesando ? 'Preparando la foto…' : archivo ? 'Cambiar la foto' : yaTiene ? 'Reemplazar la foto' : 'Sacar foto de la factura'}
          </span>
          <span className="block text-xs text-ahg-text/50">
            {archivo ? 'Lista para guardar'
              : yaTiene ? 'Ya tiene foto: dejala como está o cambiala'
              : obligatoria ? 'Que se vea entera, derecha y con buena luz'
              : 'Esta factura no tiene foto: podés agregarla ahora'}
          </span>
        </span>
        <input
          type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { if (e.target.files?.[0]) elegir(e.target.files[0]); e.target.value = ''; }}
        />
      </label>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// "foto" al lado del número: abre la imagen grande. Se baja con axios porque un
// <img src> no manda el token.
export function VerFoto({ facturaId }) {
  const [abierta, setAbierta] = useState(false);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierta) return undefined;
    let vivo = true;
    let creada = null;
    api.get(`/proveedores/facturas/${facturaId}/foto`, { responseType: 'blob' })
      .then(r => { if (!vivo) return; creada = URL.createObjectURL(r.data); setUrl(creada); })
      .catch(() => { if (vivo) setError('No se pudo traer la foto'); });
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); setUrl(null); setError(''); };
  }, [abierta, facturaId]);

  useEffect(() => {
    if (!abierta) return undefined;
    const tecla = e => { if (e.key === 'Escape') setAbierta(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta]);

  return (
    <>
      <button
        type="button" onClick={e => { e.stopPropagation(); setAbierta(true); }}
        className="ml-1.5 text-xs font-semibold text-ahg-primary hover:underline whitespace-nowrap"
      >
        foto
      </button>
      {abierta && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3"
          onMouseDown={e => { e.stopPropagation(); setAbierta(false); }}
        >
          {url && <img src={url} alt="Foto de la factura" className="max-w-full max-h-full rounded-lg" />}
          {!url && <p className="text-white text-sm">{error || 'Cargando la foto…'}</p>}
          <button
            type="button" className="absolute top-3 right-3 bg-white/90 text-ahg-text w-9 h-9 rounded-full text-xl"
            aria-label="Cerrar" onClick={() => setAbierta(false)}
          >×</button>
        </div>
      )}
    </>
  );
}

// ── Aviso de repetida ────────────────────────────────────────────────────────
// Lo que contesta el servidor cuando la factura que se está guardando se parece a
// otra. No frena: con "Es otra, guardar igual" se guarda.
export function AvisoRepetida({ repetidas, onGuardarIgual, guardando }) {
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900 space-y-2">
      <p className="font-semibold">¿No es la misma que esta?</p>
      <ul className="space-y-1">
        {repetidas.map(r => (
          <li key={r.id} className="text-xs">
            {r.numero || 'sin número'} del {fechaCorta(r.fecha)} por <strong>{plata(r.total)}</strong>
            {' '}· la cargó {r.origen}{r.local_nombre ? ` en ${r.local_nombre}` : ''}
            {' '}· {r.pagado >= r.total - 0.5 ? 'ya pagada' : r.pagado > 0 ? 'pagada en parte' : 'sin pagar'}
          </li>
        ))}
      </ul>
      <p className="text-xs">
        Si es la misma, cancelá: ya está cargada. Si es otra (otra entrega, otro pedido), guardala igual.
      </p>
      <button type="button" className="btn-secondary text-xs px-3 py-1.5" disabled={guardando} onClick={onGuardarIgual}>
        Es otra, guardar igual
      </button>
    </div>
  );
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
      <p className={`text-xl sm:text-2xl font-bold tabular-nums whitespace-nowrap mt-1 ${color}`} style={{ fontFamily: 'Nunito, sans-serif' }}>
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
  // Arranca en el último día de cobro (de cualquiera de los proveedores, si son varios).
  const diasCobro = unaSola
    ? factura.dias_pago
    : [...new Set(grupo.flatMap(f => (f.dias_pago || []).map(Number)))];
  const fechaSugerida = ultimoDiaCobro(diasCobro);
  const [fecha, setFecha]   = useState(fechaSugerida);
  const [medio, setMedio]   = useState(unaSola ? factura.medio_pago : (grupo[0]?.medio_pago || 'santander'));
  // En el pago de varias, la forma de pago se elige por proveedor. Arranca en la de
  // la ficha, pero es solo un punto de partida: lo que importa es con qué se pagó.
  const [mediosPorProveedor, setMediosPorProveedor] = useState(() =>
    unaSola ? {} : Object.fromEntries(grupo.map(f => [f.proveedor, f.medio_pago || 'santander'])));
  const [comp, setComp]     = useState('');
  // Una transferencia cubre todas las facturas de un proveedor: el número se escribe
  // una vez por proveedor y va en cada pago.
  const [compPorProveedor, setCompPorProveedor] = useState({});
  const [guardando, setGuardando] = useState(false);

  // El casillero va sin centavos, pero 306 facturas los tienen: si se deja el saldo
  // completo, se manda el saldo exacto para que la factura no quede con $ 0,20 abierta.
  const montoEscrito = Number(String(monto).replace(/[^\d]/g, '')) || 0;
  const montoNum = montoEscrito === Math.round(saldoTotal) ? saldoTotal : montoEscrito;
  const resto    = Math.round(saldoTotal - montoNum);

  const diaOk = unaSola && (factura.dias_pago || []).map(Number).includes(aDate(fecha).getDay());
  const proveedoresGrupo = unaSola ? [] : [...new Set(grupo.map(f => f.proveedor))];
  const sinComprobante = unaSola
    ? (medio !== 'efectivo' && !comp.trim())
    : proveedoresGrupo.filter(p => (mediosPorProveedor[p] || 'santander') !== 'efectivo' && !(compPorProveedor[p] || '').trim());
  const faltaComprobante = unaSola ? sinComprobante : sinComprobante.length > 0;
  const proximo = unaSola ? proximoDiaPago(factura.dias_pago, fecha) : null;

  async function guardar() {
    setGuardando(true);
    try {
      if (unaSola) {
        await onGuardar([{ factura_id: factura.id, monto: montoNum, fecha, medio, comprobante: comp }]);
      } else {
        // Cada factura con la forma de pago que se eligió para su proveedor: en un
        // mismo plan puede haber uno por transferencia y otro en efectivo.
        await onGuardar(grupo.map(f => ({
          factura_id: f.id, monto: f.saldo, fecha, medio: mediosPorProveedor[f.proveedor] || f.medio_pago,
          comprobante: (mediosPorProveedor[f.proveedor] || f.medio_pago) === 'efectivo' ? '' : (compPorProveedor[f.proveedor] || '').trim(),
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
            disabled={guardando || (unaSola && montoNum <= 0) || faltaComprobante}
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
              value={montoEscrito === 0 ? '' : money.format(montoEscrito)}
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
              {fecha === fechaSugerida && fecha !== hoyStr()
                ? `Viene puesto el ${fechaLarga(fecha)}, el último día de cobro. Si pagaste otro día, cambiala.`
                : 'Se anota con la fecha que pongas.'}
            </p>
          )}
          {unaSola && (
            <p className={`text-xs mt-1 ${diaOk ? 'text-green-700' : 'text-amber-700'}`}>
              {fecha === fechaSugerida && fecha !== hoyStr()
                ? `Viene puesto el ${fechaLarga(fecha)}, su último día de cobro. Si pagaste otro día, cambiala.`
                : diaOk
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
            Elegí con qué se pagó. Viene marcada la habitual del proveedor, pero se cambia acá.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="label">Con qué se pagó cada uno</label>
            <select
              className="text-xs text-ahg-text/60 bg-transparent border-0 p-0 cursor-pointer"
              value=""
              onChange={e => { const m = e.target.value; if (m) setMediosPorProveedor(x => Object.fromEntries(Object.keys(x).map(k => [k, m]))); }}
            >
              <option value="">todos con…</option>
              {MEDIOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-ahg-accent/40 divide-y divide-ahg-accent/30">
            {Object.entries(grupo.reduce((acc, f) => {
              acc[f.proveedor] = acc[f.proveedor] || { total: 0, n: 0 };
              acc[f.proveedor].total += f.saldo;
              acc[f.proveedor].n += 1;
              return acc;
            }, {})).map(([nombre, d]) => (
              <div key={nombre} className="px-3 py-2 text-sm space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium truncate">
                    {nombre}
                    <span className="block text-xs font-normal text-ahg-text/50">{d.n} factura{d.n === 1 ? '' : 's'}</span>
                  </span>
                  <select
                    className="input !py-1 !px-2 !w-auto text-xs"
                    value={mediosPorProveedor[nombre] || 'santander'}
                    onChange={e => setMediosPorProveedor(x => ({ ...x, [nombre]: e.target.value }))}
                  >
                    {MEDIOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <span className="tabular-nums font-semibold w-24 text-right">{plata(d.total)}</span>
                </div>
                {(mediosPorProveedor[nombre] || 'santander') !== 'efectivo' && (
                  <input
                    className={`input !py-1 text-xs ${sinComprobante.includes(nombre) ? 'border-amber-400' : ''}`}
                    placeholder={(mediosPorProveedor[nombre] === 'cheque') ? 'Número de cheque' : 'Número de transferencia'}
                    value={compPorProveedor[nombre] || ''}
                    onChange={e => setCompPorProveedor(x => ({ ...x, [nombre]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <p className={`text-xs mt-1 ${faltaComprobante ? 'text-amber-700' : 'text-ahg-text/50'}`}>
            {faltaComprobante
              ? `Falta el número de transferencia o cheque de ${sinComprobante.join(', ')}.`
              : 'Viene marcada la forma habitual de cada ficha; cambiala si hoy se pagó distinto.'}
          </p>
        </div>
      )}

      {unaSola && (
        <div>
          <label className="label">
            Número de transferencia o cheque
            <span className="text-xs font-normal text-ahg-text/50">{medio === 'efectivo' ? ' (no hace falta en efectivo)' : ' (obligatorio)'}</span>
          </label>
          <input className="input" value={comp} onChange={e => setComp(e.target.value)} placeholder="Ej: 418-2290" />
        </div>
      )}
    </Modal>
  );
}
