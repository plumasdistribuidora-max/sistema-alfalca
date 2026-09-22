import { useState, useEffect } from 'react';
import api from '../../api';
import { fotosPesaje, totalPesaje, kg, campoParaTurno } from './pesaje';

// Renderizado de cada tipo de campo de una plantilla de reporte.
// La plantilla es data: agregar una pregunta no toca este archivo salvo que sea
// de un tipo nuevo.

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export function soloNumero(str) {
  const limpio = String(str ?? '').replace(/[^\d]/g, '');
  return limpio === '' ? '' : Number(limpio);
}

function Etiqueta({ campo }) {
  return (
    <span className="block text-sm font-semibold text-ahg-text mb-1.5">
      {campo.label}
      {campo.requerido && <span className="text-red-500 ml-0.5">*</span>}
      {campo.ayuda && (
        <span className="block text-xs font-normal text-ahg-text/50 mt-0.5">{campo.ayuda}</span>
      )}
    </span>
  );
}

function Segmentado({ opciones, valor, onChange }) {
  return (
    <div className="flex gap-2">
      {opciones.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold border transition-colors ${
            valor === o
              ? 'bg-ahg-primary text-white border-ahg-primary'
              : 'bg-white text-ahg-text/70 border-ahg-accent/50 hover:border-ahg-primary'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// Un dato de un renglón de detalle. Casi siempre es texto; el monto de un gasto se
// escribe con teclado numérico y puntos de miles, y el tipo se elige de una lista.
function Subcampo({ sc, valor, onChange }) {
  if (sc.tipo === 'moneda') {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ahg-text/40 text-sm">$</span>
        <input
          className="input text-sm pl-7 tabular-nums" inputMode="numeric" placeholder={sc.label}
          value={valor === '' || valor == null ? '' : money.format(valor)}
          onChange={e => onChange(soloNumero(e.target.value))}
        />
      </div>
    );
  }
  if (sc.tipo === 'seleccion') {
    return (
      <select className="input text-sm" value={valor || ''} onChange={e => onChange(e.target.value)}>
        <option value="">{sc.label}…</option>
        {(sc.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      className="input text-sm" placeholder={sc.label}
      value={valor || ''} onChange={e => onChange(e.target.value)}
    />
  );
}

function Filas({ items, subcampos, onChange, textoAgregar }) {
  const lista = items || [];

  function editar(i, codigo, valor) {
    const copia = lista.map((f, idx) => (idx === i ? { ...f, [codigo]: valor } : f));
    onChange(copia);
  }
  function borrar(i) { onChange(lista.filter((_, idx) => idx !== i)); }
  function agregar()  { onChange([...lista, {}]); }

  return (
    <div className="space-y-2">
      {lista.map((fila, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1.5">
            {subcampos.map(sc => <Subcampo key={sc.codigo} sc={sc} valor={fila[sc.codigo]} onChange={v => editar(i, sc.codigo, v)} />)}
          </div>
          <button
            type="button"
            onClick={() => borrar(i)}
            aria-label="Quitar"
            className="text-red-500 text-xl leading-none px-2 py-1 hover:bg-red-50 rounded"
          >×</button>
        </div>
      ))}
      <button
        type="button"
        onClick={agregar}
        className="w-full py-2 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10"
      >
        + {textoAgregar}
      </button>
    </div>
  );
}

function HorasEquipo({ valor, equipo, onChange }) {
  const filas = valor || [];
  const usados = new Set(filas.map(f => String(f.empleado_id)));

  function editar(i, campo, v) {
    onChange(filas.map((f, idx) => (idx === i ? { ...f, [campo]: v } : f)));
  }

  const total = filas.reduce((s, f) => s + (Number(f.horas) || 0), 0);

  return (
    <div className="space-y-2">
      {filas.map((fila, i) => (
        <div key={i} className="flex gap-2">
          <select
            className="input text-sm flex-1"
            value={fila.empleado_id || ''}
            onChange={e => editar(i, 'empleado_id', e.target.value)}
          >
            <option value="">Elegí a la persona</option>
            {equipo
              .filter(e => !usados.has(String(e.id)) || String(e.id) === String(fila.empleado_id))
              .map(e => (
                <option key={e.id} value={e.id}>
                  {e.nombre}{e.puesto ? ` · ${e.puesto}` : ''}{e.del_local === false ? ` (${e.local_nombre})` : ''}
                </option>
              ))}
          </select>
          <input
            className="input text-sm w-20 text-right"
            inputMode="decimal"
            placeholder="hs"
            value={fila.horas ?? ''}
            onChange={e => editar(i, 'horas', e.target.value.replace(',', '.'))}
          />
          <button
            type="button"
            onClick={() => onChange(filas.filter((_, idx) => idx !== i))}
            aria-label="Quitar"
            className="text-red-500 text-xl leading-none px-2 hover:bg-red-50 rounded"
          >×</button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...filas, {}])}
        className="w-full py-2 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10"
      >
        + Agregar persona
      </button>

      {filas.length > 0 && (
        <p className="text-xs text-ahg-text/50 text-right">
          Total del turno: <strong className="text-ahg-text">{total.toFixed(1)} h</strong>
        </p>
      )}
    </div>
  );
}

// Un <img src> no manda el header Authorization, y el endpoint de la foto lo pide.
// Por eso se baja con axios (que ya inyecta el token) y se muestra como blob.
export function FotoAdjunta({ id }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let vivo = true;
    let creada = null;
    api.get(`/reportes/adjuntos/${id}`, { responseType: 'blob' })
      .then(r => {
        if (!vivo) return;
        creada = URL.createObjectURL(r.data);
        setUrl(creada);
      })
      .catch(() => {});
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [id]);

  return url
    ? <img src={url} alt="" className="w-full h-full object-cover" />
    : <div className="w-full h-full bg-ahg-accent/20" />;
}

function Fotos({ campo, adjuntos, onSubir, onBorrar, subiendo }) {
  const mias  = adjuntos.filter(a => a.campo_codigo === campo.codigo);
  const tope  = campo.max || 3;
  const puede = mias.length < tope;

  return (
    <div className="flex gap-2 flex-wrap">
      {mias.map(a => (
        <div key={a.id} className="relative w-24 h-32 rounded-lg overflow-hidden border border-ahg-accent/40">
          <FotoAdjunta id={a.id} />
          <button
            type="button"
            onClick={() => onBorrar(a.id)}
            aria-label="Borrar foto"
            className="absolute top-1 right-1 bg-black/60 text-white w-6 h-6 rounded-full text-sm leading-none"
          >×</button>
        </div>
      ))}

      {puede && (
        <label className={`w-24 h-32 rounded-lg border border-dashed border-ahg-accent flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-ahg-accent/10 ${subiendo ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-2xl text-ahg-primary leading-none">{subiendo ? '…' : '+'}</span>
          <span className="text-[11px] text-ahg-text/50 text-center px-1">
            {subiendo ? 'Subiendo' : 'Sacar foto'}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) onSubir(campo.codigo, e.target.files[0]); e.target.value = ''; }}
          />
        </label>
      )}
    </div>
  );
}

function Facturas({ facturas, onAgregar, onBorrar }) {
  return (
    <div className="space-y-2">
      {facturas.map(f => (
        <div key={f.id} className="flex items-start gap-2 p-3 rounded-lg border border-ahg-accent/40 bg-white">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ahg-text">{f.proveedor}</p>
            <p className="text-xs text-ahg-text/50">
              {f.numero || 'sin número'} · {(f.items || []).length} renglón{(f.items || []).length === 1 ? '' : 'es'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">$ {money.format(f.total)}</p>
            <button type="button" onClick={() => onBorrar(f.id)} className="text-xs text-red-500 hover:underline">
              Quitar
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={onAgregar}
        className="w-full py-2 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10"
      >
        + Cargar factura
      </button>
    </div>
  );
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const fechaCorta = f => FECHA_CORTA.format(new Date(`${f}T12:00:00`));

// Check de vencimientos: el producto sale del maestro y la persona carga la fecha
// impresa en el paquete. Los días los calcula el sistema, acá para mostrarlos en vivo
// y en el backend para el cierre — las dos cuentas van contra la fecha del reporte,
// no contra hoy.
//
// Valor: { hubo, hay, items: [{ producto_id, cantidad, vence }] }
function diasHasta(vence, fecha) {
  if (!vence || !fecha) return null;
  return Math.round((Date.parse(`${vence}T12:00:00`) - Date.parse(`${fecha}T12:00:00`)) / 86400000);
}

function Vencimientos({ campo, valor, productos, fecha, onChange }) {
  const v = valor || {};
  const conPregunta = Boolean(campo.pregunta_lista);
  const muestraLista = v.hubo && (conPregunta ? v.hay === true : true);
  const lista = v.items || [];

  const setItems = items => onChange({ ...v, items });
  const editar = (i, c, val) => setItems(lista.map((f, idx) => idx === i ? { ...f, [c]: val } : f));

  return (
    <>
      <Segmentado
        opciones={['Sí', 'No']}
        valor={v.hubo === true ? 'Sí' : v.hubo === false ? 'No' : null}
        onChange={o => {
          if (o !== 'Sí') return onChange({ hubo: false, items: [] });
          onChange(conPregunta
            ? { hubo: true, hay: v.hay, items: v.items || [] }
            : { hubo: true, items: v.items?.length ? v.items : [{}] });
        }}
      />

      {v.hubo && conPregunta && (
        <div className="mt-3">
          <p className="text-sm font-medium text-ahg-text mb-1.5">{campo.pregunta_lista}</p>
          <Segmentado
            opciones={['Sí', 'No']}
            valor={v.hay === true ? 'Sí' : v.hay === false ? 'No' : null}
            onChange={o => onChange({ ...v, hay: o === 'Sí', items: o === 'Sí' ? (v.items?.length ? v.items : [{}]) : [] })}
          />
        </div>
      )}

      {muestraLista && (
        <div className="mt-3 pl-3 border-l-2 border-amber-400 space-y-2">
          <p className="text-xs font-semibold text-amber-700">{campo.label_lista}</p>

          {lista.map((fila, i) => {
            const dias = diasHasta(fila.vence, fecha);
            const tono = dias == null ? 'text-ahg-text/40'
              : dias < 0 ? 'text-red-700 font-semibold'
              : dias <= 7 ? 'text-red-700 font-semibold'
              : dias <= 15 ? 'text-amber-700 font-semibold'
              : 'text-ahg-text/60';
            return (
              <div key={i} className="rounded-lg border border-ahg-accent/60 p-2.5 space-y-2">
                <div className="flex gap-2 items-start">
                  <select
                    className="input text-sm flex-1"
                    value={fila.producto_id || ''}
                    onChange={e => editar(i, 'producto_id', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Elegí el producto…</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <button
                    type="button" onClick={() => setItems(lista.filter((_, idx) => idx !== i))}
                    aria-label="Quitar producto"
                    className="text-red-500 text-xl leading-none px-2 py-1 hover:bg-red-50 rounded"
                  >×</button>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs font-semibold text-ahg-text/60 w-28 flex-shrink-0" htmlFor={`cant${i}`}>
                    ¿Cuántos hay?
                  </label>
                  <input
                    id={`cant${i}`} className="input text-sm flex-1 tabular-nums" inputMode="numeric"
                    placeholder="unidades"
                    value={fila.cantidad ?? ''}
                    onChange={e => editar(i, 'cantidad', soloNumero(e.target.value))}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs font-semibold text-ahg-text/60 w-28 flex-shrink-0" htmlFor={`vence${i}`}>
                    Fecha del paquete
                  </label>
                  <input
                    id={`vence${i}`} type="date" className="input text-sm flex-1"
                    value={fila.vence || ''} onChange={e => editar(i, 'vence', e.target.value)}
                  />
                </div>
                <p className={`text-xs text-right ${tono}`}>
                  {fila.cantidad ? `${fila.cantidad} ${fila.cantidad === 1 ? 'unidad' : 'unidades'} · ` : ''}
                  {dias == null ? 'cargá la fecha y te digo los días'
                    : dias < 0 ? `ya venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`
                    : dias === 0 ? 'vence hoy'
                    : `faltan ${dias} día${dias === 1 ? '' : 's'}`}
                </p>
              </div>
            );
          })}

          <button
            type="button" onClick={() => setItems([...lista, {}])}
            className="w-full py-2 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10"
          >
            + Agregar producto
          </button>
        </div>
      )}
    </>
  );
}

// El control de stock de cocina: un número por lote y por lugar.
//
// Un producto vive en dos lados —freezer es la reserva, heladera es lo que está listo
// para hoy— y adentro conviven lotes con vencimientos distintos. Por eso no alcanza
// con un número por producto.
//
// Las fechas vienen puestas y los casilleros arrancan VACÍOS a propósito: tipear
// fechas es lento y se presta a errores, pero si el que cuenta ve cuánto debería
// haber, escribe ese número y el control no sirve para nada.
//
// Valor: { lineas: [{ producto_id, lote_id?, vence?, freezer, heladera }] }
const fechaCortita = f => (f ? f.split('-').reverse().slice(0, 2).join('/') : '');

function StockCocina({ valor, productos, repaso, turno, onChange }) {
  const lineas = (valor && Array.isArray(valor.lineas)) ? valor.lineas : [];
  // Tres casos distintos y que no se pueden pisar: un lote conocido (lote_id), el
  // lote "sin fecha" (vence null) y un renglón nuevo que todavía no tiene fecha ('').
  const clave = l => `${l.producto_id}:${l.lote_id ?? 'n' + (l.vence ?? 'sf')}`;
  const porClave = new Map(lineas.map(l => [clave(l), l]));

  function set(producto_id, lote, campo, v) {
    const k = `${producto_id}:${lote.lote_id ?? 'n' + (lote.vence ?? 'sf')}`;
    const otras = lineas.filter(l => clave(l) !== k);
    const actual = porClave.get(k) || { producto_id, lote_id: lote.lote_id ?? null, vence: lote.vence ?? null };
    onChange({ lineas: [...otras, { ...actual, [campo]: v }] });
  }
  // Cambiar la fecha cambia la clave del renglón, así que lo ya contado se mueve con
  // ella. Sin esto, poner la fecha después de contar borraba los números.
  function cambiarFecha(producto_id, lote, nueva) {
    const k = `${producto_id}:${lote.lote_id ?? 'n' + (lote.vence ?? 'sf')}`;
    const otras = lineas.filter(l => clave(l) !== k);
    const actual = porClave.get(k) || { producto_id, lote_id: null };
    onChange({ lineas: [...otras, { ...actual, lote_id: null, vence: nueva }] });
  }

  function agregarFecha(producto_id) {
    onChange({ lineas: [...lineas, { producto_id, lote_id: null, vence: '', freezer: '', heladera: '' }] });
  }
  function quitar(l) {
    onChange({ lineas: lineas.filter(x => clave(x) !== clave(l)) });
  }

  // A la mañana se cuenta todo; a la tarde solo los pocos que vale la pena mirar de
  // nuevo. Repetir los 25 sale peor y no aporta: lo que importa es si algo quedó
  // raspando o está por vencer.
  const esRepaso = turno && turno !== 'Mañana';
  const motivos = new Map((repaso || []).map(r => [r.id, r.motivo]));
  const visibles = esRepaso ? productos.filter(p => motivos.has(p.id)) : productos;

  if (!productos.length) {
    return <p className="text-sm text-ahg-text/50">Hoy no toca revisar stock.</p>;
  }
  if (esRepaso && !visibles.length) {
    return (
      <p className="text-sm text-ahg-text/60 rounded-lg border border-green-300 bg-green-50 p-3">
        Hoy no hay nada para repasar: no hay nada por vencer ni nada que se esté por acabar.
      </p>
    );
  }

  // Los productos vienen ordenados por proveedor; se agrupan para que se cuente
  // recorriendo la heladera de a un proveedor por vez.
  const grupos = [];
  for (const p of visibles) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.proveedor === p.proveedor) ultimo.items.push(p);
    else grupos.push({ proveedor: p.proveedor, items: [p] });
  }

  const casillero = (p, lote, campo) => {
    const l = porClave.get(`${p.id}:${lote.lote_id ?? 'n' + (lote.vence ?? 'sf')}`);
    return (
      <input
        className="input text-sm text-right tabular-nums w-full"
        inputMode="decimal" placeholder="0"
        value={l?.[campo] ?? ''}
        onChange={e => set(p.id, lote, campo, e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
      />
    );
  };

  return (
    <div className="space-y-3">
      {grupos.map(g => (
        <div key={g.proveedor} className="rounded-lg border border-ahg-accent/60 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ahg-text/70 pb-2 mb-1 border-b border-ahg-accent/40">
            {g.proveedor} <span className="font-normal text-ahg-text/40">· {g.items.length} productos</span>
          </p>

          {g.items.map(p => {
            const nuevas = lineas.filter(l => l.producto_id === p.id && !l.lote_id && typeof l.vence === 'string');
            const lotes = [
              ...p.lotes.map(x => ({ lote_id: x.lote_id, vence: x.vence, conocido: true })),
              // Sin lotes conocidos —el primer día, o un producto que se acabó— se abre
              // un renglón pidiendo la fecha: lo que está en la heladera la tiene
              // impresa en el paquete, así que se carga y a partir de ahí ya viene sola.
              ...(p.lotes.length || nuevas.length ? [] : [{ lote_id: null, vence: '', conocido: false }]),
              ...nuevas.map(l => ({ lote_id: null, vence: l.vence, conocido: false })),
            ];
            return (
              <div key={p.id} className="py-2.5 border-b border-ahg-accent/20 last:border-b-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold">{p.nombre}</span>
                  <span className="text-xs text-ahg-text/40">{p.unidad}</span>
                </div>
                {esRepaso && motivos.get(p.id) && (
                  <p className="text-xs text-amber-700 mt-0.5">{motivos.get(p.id)}</p>
                )}

                <div className="grid grid-cols-[1fr_1fr] gap-2 mt-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ahg-text/50 mb-1">Freezer</p>
                    {!p.en_freezer && <p className="text-xs text-ahg-text/30 py-1">No se guarda acá</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ahg-text/50 mb-1">Heladera</p>
                    {!p.en_heladera && <p className="text-xs text-ahg-text/30 py-1">No se guarda acá</p>}
                  </div>
                </div>

                {lotes.map((lote, i) => (
                  <div key={lote.lote_id || `n${i}`} className="flex items-center gap-2 mt-1.5">
                    {lote.conocido ? (
                      <span className="text-xs text-ahg-text/70 w-16 flex-shrink-0 tabular-nums">
                        {lote.vence ? fechaCortita(lote.vence) : 'sin fecha'}
                      </span>
                    ) : lote.vence === null ? (
                      <span className="text-xs w-32 flex-shrink-0 flex items-center gap-1.5">
                        <span className="text-ahg-text/50">sin fecha</span>
                        <button type="button" onClick={() => cambiarFecha(p.id, lote, '')}
                                className="font-semibold text-ahg-primary underline">poner</button>
                      </span>
                    ) : (
                      <span className="w-32 flex-shrink-0">
                        <input
                          type="date" className="input text-xs w-full"
                          value={lote.vence || ''}
                          onChange={e => cambiarFecha(p.id, lote, e.target.value)}
                        />
                        <button type="button" onClick={() => cambiarFecha(p.id, lote, null)}
                                className="text-[10px] text-ahg-text/40 underline mt-0.5">no tiene fecha</button>
                      </span>
                    )}
                    <div className="flex-1 min-w-0">{p.en_freezer ? casillero(p, lote, 'freezer') : null}</div>
                    <div className="flex-1 min-w-0">{p.en_heladera ? casillero(p, lote, 'heladera') : null}</div>
                    {!lote.conocido && (
                      <button type="button" aria-label="Quitar fecha"
                              onClick={() => quitar({ producto_id: p.id, lote_id: null, vence: lote.vence ?? '' })}
                              className="text-red-500 text-lg leading-none px-1">×</button>
                    )}
                  </div>
                ))}

                <button
                  type="button" onClick={() => agregarFecha(p.id)}
                  className="mt-2 w-full py-1.5 text-xs font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg"
                >
                  + otra fecha de vencimiento
                </button>
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-xs text-ahg-text/40">
        {esRepaso
          ? 'Solo estos. El resto ya se contó a la mañana y no hace falta repetirlo.'
          : 'El primer día cargá la fecha que dice el paquete. Después ya viene puesta y solo ponés cuántos hay.'}
      </p>
    </div>
  );
}

// Cuánto puede medir un problema. Igual que en el backend: lo que no entra en un
// renglón corto casi siempre son dos problemas metidos en uno.
const LARGO_MAXIMO = 120;

// Parte un texto en los problemas que parece tener. "luces, piso y vidrio roto" son
// tres cosas que se arreglan por separado, con tres personas distintas y en tres
// momentos distintos; juntas en un renglón no se pueden seguir.
function partirEnProblemas(texto) {
  return String(texto || '')
    .split(/\s*[,;]\s*|\s+y\s+|\s+e\s+|\.\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3);
}

// Mantenimiento con seguimiento. Lo que ya está reportado en el local aparece solo y
// el turno dice si se solucionó o sigue igual; abajo agrega lo nuevo, de a un problema
// por renglón y eligiendo qué cosa es.
//
// El rubro se elige una sola vez, cuando el problema nace: al día siguiente el ítem ya
// aparece arriba como pendiente y nadie lo vuelve a clasificar. Por eso dos personas no
// pueden ponerle rubros distintos a la misma cosa.
//
// El valor:
//   { seguimiento: { [item_id]: 'sigue' | 'resuelto' },
//     nuevos: [{ texto, rubro_id, rubro_otro?, item_id? }] }
// Un reporte viejo puede traer un texto suelto: se muestra como primer renglón nuevo.
function Mantenimiento({ valor, pendientes, rubros, onChange }) {
  const v = typeof valor === 'string'
    ? { seguimiento: {}, nuevos: valor.trim() ? [{ texto: valor }] : [] }
    : (valor || {});
  const seguimiento = v.seguimiento || {};
  const nuevos = v.nuevos || [];

  // Los renglones donde la persona ya dijo "es uno solo": no se le vuelve a insistir.
  const [unoSolo, setUnoSolo] = useState({});

  const setSeg = (id, resp) => onChange({ ...v, seguimiento: { ...seguimiento, [id]: resp } });
  const setNuevos = lista => onChange({ ...v, seguimiento, nuevos: lista });
  const editar = (i, campo, valorCampo) => setNuevos(nuevos.map((x, idx) => idx === i ? { ...x, [campo]: valorCampo } : x));
  const quitar = i => setNuevos(nuevos.filter((_, idx) => idx !== i));

  // Al separar, el rubro que ya eligió se queda con el primer pedazo. Los demás salen
  // sin rubro a propósito: cada problema es una cosa distinta y hay que elegirla.
  function separar(i) {
    const fila = nuevos[i];
    const partes = partirEnProblemas(fila.texto);
    const abiertos = partes.map((texto, k) => k === 0
      ? { ...fila, texto }
      : { texto, rubro_id: null, rubro_otro: '' });
    setNuevos([...nuevos.slice(0, i), ...abiertos, ...nuevos.slice(i + 1)]);
  }

  return (
    <div className="space-y-3">
      {pendientes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700">Pendiente en este local — ¿cómo está hoy?</p>
          {pendientes.map(p => {
            const resp = seguimiento[String(p.id)];
            return (
              <div key={p.id} className={`rounded-lg border p-3 ${resp === 'resuelto' ? 'border-green-300 bg-green-50' : resp === 'sigue' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                {p.rubro && (
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-ahg-primary text-white rounded px-1.5 py-0.5 mb-1">
                    {p.rubro}
                  </span>
                )}
                <p className="text-sm text-ahg-text">{p.texto}</p>
                <p className="text-xs text-ahg-text/50 mt-0.5">
                  {p.reportado_por ? `${p.reportado_por} · ` : ''}{fechaCorta(p.fecha)}
                </p>
                {p.plan && (
                  <p className="text-xs text-ahg-text/70 mt-1.5 pl-2 border-l-2 border-ahg-accent">
                    Encargado: {p.plan}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  {[['resuelto', 'Ya se solucionó'], ['sigue', 'Sigue igual']].map(([k, label]) => (
                    <button
                      key={k} type="button" onClick={() => setSeg(p.id, k)}
                      className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold border transition-colors ${
                        resp === k
                          ? k === 'resuelto' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-ahg-text/70 border-ahg-accent/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {nuevos.length > 0 && (
          <p className="text-xs font-semibold text-ahg-text/60">{pendientes.length ? 'Nuevo de hoy' : 'Novedades de hoy'} · un problema por renglón</p>
        )}
        {nuevos.map((x, i) => {
          const rubro  = rubros.find(r => r.id === x.rubro_id);
          const partes = partirEnProblemas(x.texto);
          const avisa  = partes.length > 1 && !unoSolo[i];
          return (
            <div key={x.item_id || `n${i}`} className="rounded-lg border border-ahg-accent/60 p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-ahg-text/60">¿Qué cosa?</p>
                <button type="button" onClick={() => quitar(i)} aria-label="Quitar problema"
                        className="text-red-500 text-xl leading-none px-1.5 -mt-1 hover:bg-red-50 rounded">×</button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {rubros.map(r => (
                  <button
                    key={r.id} type="button" aria-pressed={x.rubro_id === r.id}
                    onClick={() => editar(i, 'rubro_id', r.id)}
                    className={`py-2 px-1 rounded-lg text-xs font-medium border transition-colors ${
                      x.rubro_id === r.id
                        ? 'bg-ahg-primary text-white border-ahg-primary font-semibold'
                        : 'bg-white text-ahg-text border-ahg-accent/50'
                    }`}
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>

              {rubro?.es_otro && (
                <input
                  className="input text-sm"
                  placeholder="¿Qué cosa es? Una palabra: sombrillas, abrochadora…"
                  value={x.rubro_otro || ''}
                  onChange={e => editar(i, 'rubro_otro', e.target.value)}
                />
              )}

              <div>
                <label className="text-xs font-semibold text-ahg-text/60 block mb-1">¿Qué le pasa?</label>
                <input
                  className="input text-sm"
                  placeholder="Corto y concreto: 5 focos quemados en el salón"
                  maxLength={LARGO_MAXIMO}
                  autoFocus={i === nuevos.length - 1 && !x.texto}
                  value={x.texto || ''} onChange={e => editar(i, 'texto', e.target.value)}
                />
                <p className="text-[11px] text-ahg-text/40 text-right mt-1 tabular-nums">
                  {(x.texto || '').length} / {LARGO_MAXIMO}
                </p>
              </div>

              {avisa && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                  <p className="text-xs text-red-700">
                    Parece que son {partes.length} problemas. Cada uno se arregla distinto, así que van en renglones separados.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => separar(i)}
                            className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">
                      Separar en {partes.length} renglones
                    </button>
                    <button type="button" onClick={() => setUnoSolo(u => ({ ...u, [i]: true }))}
                            className="py-1.5 px-3 rounded-lg border border-red-300 text-red-700 text-xs font-semibold">
                      Es uno solo
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button" onClick={() => setNuevos([...nuevos, { texto: '', rubro_id: null, rubro_otro: '' }])}
          className="w-full py-2 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10"
        >
          + {pendientes.length || nuevos.length ? 'Agregar otro problema' : 'Reportar algo de mantenimiento'}
        </button>
        {!pendientes.length && !nuevos.length && (
          <p className="text-xs text-ahg-text/40">No hay nada pendiente en este local. Si no hubo novedades, dejalo así.</p>
        )}
      </div>
    </div>
  );
}

// Pesaje de café: bolsa abierta (en la balanza) y bolsas cerradas (las del depósito),
// cada una con su foto. Valor: { abierta_kg, cerradas_kg }
function KgInput({ valor, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2">
      <input
        className="input tabular-nums text-right flex-1" inputMode="decimal" placeholder={placeholder || '0,0'}
        value={valor ?? ''}
        onChange={e => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
      />
      <span className="text-sm text-ahg-text/60">kg</span>
    </div>
  );
}

function PesajeCafe({ campo, valor, onChange, ctx }) {
  const v = valor || {};
  const fotos = fotosPesaje(campo.codigo);
  const set = parcial => onChange({ ...v, ...parcial });
  const total = totalPesaje(v);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium mb-1">Kilos en la bolsa abierta</p>
        <p className="text-xs text-ahg-text/50 mb-1.5">Con la tolva vacía, en la balanza de cocina. Foto de la balanza.</p>
        <KgInput valor={v.abierta_kg} onChange={x => set({ abierta_kg: x })} />
        <div className="mt-2">
          <Fotos campo={{ codigo: fotos.abierta, max: 2 }} adjuntos={ctx.adjuntos} onSubir={ctx.onSubirFoto}
                 onBorrar={ctx.onBorrarFoto} subiendo={ctx.subiendo === fotos.abierta} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Kilos de café en bolsas cerradas</p>
        <p className="text-xs text-ahg-text/50 mb-1.5">Las del depósito. Sumá lo que dice cada bolsa. Foto de las bolsas.</p>
        <KgInput valor={v.cerradas_kg} onChange={x => set({ cerradas_kg: x })} />
        <div className="mt-2">
          <Fotos campo={{ codigo: fotos.cerradas, max: 3 }} adjuntos={ctx.adjuntos} onSubir={ctx.onSubirFoto}
                 onBorrar={ctx.onBorrarFoto} subiendo={ctx.subiendo === fotos.cerradas} />
        </div>
      </div>
      {total !== null && (
        <div className="rounded-lg border border-ahg-accent bg-ahg-accent/10 p-3">
          <p className="text-sm">Café en total: <strong className="text-ahg-primary">{kg(total)}</strong> ({kg(v.abierta_kg)} en la bolsa abierta + {kg(v.cerradas_kg)} en cerradas).</p>
        </div>
      )}
    </div>
  );
}

export default function Campo({ campo: campoPlantilla, valor, onChange, ctx }) {
  // Los textos pueden cambiar según el turno elegido (el pesaje de la mañana es "al
  // empezar el día"; el de la tarde, "al terminar").
  const campo = campoParaTurno(campoPlantilla, ctx?.turno);
  const set = v => onChange(campo.codigo, v);

  let control;
  switch (campo.tipo) {
    case 'seleccion':
      control = <Segmentado opciones={campo.opciones || []} valor={valor} onChange={set} />;
      break;

    case 'numero':
      control = (
        <input
          className="input" inputMode="numeric" value={valor ?? ''}
          onChange={e => set(soloNumero(e.target.value))}
        />
      );
      break;

    case 'moneda':
      control = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ahg-text/40 text-sm">$</span>
          <input
            className="input pl-7 tabular-nums" inputMode="numeric"
            value={valor === '' || valor == null ? '' : money.format(valor)}
            onChange={e => set(soloNumero(e.target.value))}
          />
        </div>
      );
      break;

    case 'decimal':
      control = (
        <input
          className="input tabular-nums" inputMode="decimal" placeholder="0,0"
          value={valor ?? ''}
          onChange={e => set(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
        />
      );
      break;

    case 'si_no':
      control = (
        <Segmentado
          opciones={['Sí', 'No']}
          valor={valor === true ? 'Sí' : valor === false ? 'No' : null}
          onChange={o => set(o === 'Sí')}
        />
      );
      break;

    case 'texto_largo':
      control = (
        <textarea
          className="input min-h-[70px]" rows={3}
          placeholder={campo.placeholder || 'Sin novedades'}
          value={valor || ''} onChange={e => set(e.target.value)}
        />
      );
      break;

    case 'si_no_lista': {
      const v = valor || {};
      // Con pregunta intermedia, el "Sí" de arriba solo dice que se hizo el control
      // ("¿Hiciste el check?"); la lista aparece recién si la segunda también es sí
      // ("¿Hay productos por vencer?"). Sin pregunta intermedia, el sí ya abre la lista.
      const conPregunta = Boolean(campo.pregunta_lista);
      const muestraLista = v.hubo && (conPregunta ? v.hay === true : true);
      control = (
        <>
          <Segmentado
            opciones={['Sí', 'No']}
            valor={v.hubo === true ? 'Sí' : v.hubo === false ? 'No' : null}
            onChange={o => {
              if (o !== 'Sí') return set({ hubo: false, items: [] });
              set(conPregunta ? { hubo: true, hay: v.hay, items: v.items || [] } : { hubo: true, items: v.items?.length ? v.items : [{}] });
            }}
          />
          {v.hubo && conPregunta && (
            <div className="mt-3">
              <p className="text-sm font-medium text-ahg-text mb-1.5">{campo.pregunta_lista}</p>
              <Segmentado
                opciones={['Sí', 'No']}
                valor={v.hay === true ? 'Sí' : v.hay === false ? 'No' : null}
                onChange={o => set({ ...v, hay: o === 'Sí', items: o === 'Sí' ? (v.items?.length ? v.items : [{}]) : [] })}
              />
            </div>
          )}
          {muestraLista && (
            <div className="mt-3 pl-3 border-l-2 border-amber-400">
              <p className="text-xs font-semibold text-amber-700 mb-2">{campo.label_lista}</p>
              <Filas
                items={v.items} subcampos={campo.subcampos || []}
                onChange={items => set({ ...v, items })}
                textoAgregar="Agregar"
              />
            </div>
          )}
        </>
      );
      break;
    }

    case 'horas_empleados':
      control = <HorasEquipo valor={valor} equipo={ctx.equipo} onChange={set} />;
      break;

    case 'checklist': {
      const marcados = valor || [];
      control = (
        <div className="space-y-1.5">
          {(campo.items || []).map(item => (
            <label key={item} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-ahg-accent/40 bg-white text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={marcados.includes(item)}
                onChange={e => set(e.target.checked ? [...marcados, item] : marcados.filter(x => x !== item))}
              />
              {item}
            </label>
          ))}
        </div>
      );
      break;
    }

    case 'foto':
      control = (
        <Fotos
          campo={campo} adjuntos={ctx.adjuntos} onSubir={ctx.onSubirFoto}
          onBorrar={ctx.onBorrarFoto} subiendo={ctx.subiendo === campo.codigo}
        />
      );
      break;

    case 'facturas':
      control = (
        <Facturas
          facturas={ctx.facturas} onAgregar={ctx.onAgregarFactura} onBorrar={ctx.onBorrarFactura}
        />
      );
      break;

    case 'mantenimiento':
      control = (
        <Mantenimiento
          valor={valor}
          pendientes={ctx.mantenimientoPendientes || []}
          rubros={ctx.mantenimientoRubros || []}
          onChange={set}
        />
      );
      break;

    case 'vencimientos':
      control = (
        <Vencimientos
          campo={campo} valor={valor} fecha={ctx.fecha}
          productos={ctx.vencimientoProductos || []} onChange={set}
        />
      );
      break;

    case 'stock_cocina':
      control = (
        <StockCocina
          valor={valor} productos={ctx.cocinaStock || []} repaso={ctx.cocinaRepaso || []}
          turno={ctx.turno} onChange={set}
        />
      );
      break;

    case 'pesaje_cafe':
      control = <PesajeCafe campo={campo} valor={valor} onChange={set} ctx={ctx} />;
      break;

    default:
      control = (
        <input className="input" value={valor || ''} onChange={e => set(e.target.value)} />
      );
  }

  return (
    <div className="mb-5">
      <Etiqueta campo={campo} />
      {control}
    </div>
  );
}
