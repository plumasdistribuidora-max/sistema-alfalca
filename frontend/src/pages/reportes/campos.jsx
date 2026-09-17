import { useState, useEffect } from 'react';
import api from '../../api';
import { fotosPesaje, totalPesaje, kg, hora, resumenEntrega } from './etapas';

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

// Mantenimiento con seguimiento. Lo que ya está reportado en el local aparece solo y
// el turno dice si se solucionó o sigue igual; abajo agrega lo nuevo. El valor:
//   { seguimiento: { [item_id]: 'sigue' | 'resuelto' }, nuevos: [{ texto, item_id? }] }
// Un reporte viejo puede traer un texto suelto: se muestra como primer renglón nuevo.
function Mantenimiento({ valor, pendientes, onChange }) {
  const v = typeof valor === 'string'
    ? { seguimiento: {}, nuevos: valor.trim() ? [{ texto: valor }] : [] }
    : (valor || {});
  const seguimiento = v.seguimiento || {};
  const nuevos = v.nuevos || [];

  const setSeg = (id, resp) => onChange({ ...v, seguimiento: { ...seguimiento, [id]: resp } });
  const setNuevos = lista => onChange({ ...v, seguimiento, nuevos: lista });
  const editar = (i, texto) => setNuevos(nuevos.map((x, idx) => idx === i ? { ...x, texto } : x));
  const quitar = i => setNuevos(nuevos.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {pendientes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700">Pendiente en este local — ¿cómo está hoy?</p>
          {pendientes.map(p => {
            const resp = seguimiento[String(p.id)];
            return (
              <div key={p.id} className={`rounded-lg border p-3 ${resp === 'resuelto' ? 'border-green-300 bg-green-50' : resp === 'sigue' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
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
          <p className="text-xs font-semibold text-ahg-text/60">{pendientes.length ? 'Nuevo de hoy' : 'Novedades de hoy'}</p>
        )}
        {nuevos.map((x, i) => (
          <div key={x.item_id || `n${i}`} className="flex gap-2 items-start">
            <textarea
              className="input text-sm flex-1 min-h-[44px]" rows={2}
              placeholder="Qué está roto o qué hay que arreglar"
              value={x.texto || ''} onChange={e => editar(i, e.target.value)}
            />
            <button type="button" onClick={() => quitar(i)} aria-label="Quitar"
                    className="text-red-500 text-xl leading-none px-2 py-1 hover:bg-red-50 rounded">×</button>
          </div>
        ))}
        <button
          type="button" onClick={() => setNuevos([...nuevos, { texto: '' }])}
          className="w-full py-2 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10"
        >
          + {pendientes.length || nuevos.length ? 'Agregar algo más' : 'Reportar algo de mantenimiento'}
        </button>
        {!pendientes.length && !nuevos.length && (
          <p className="text-xs text-ahg-text/40">No hay nada pendiente en este local. Si no hubo novedades, dejalo así.</p>
        )}
      </div>
    </div>
  );
}

// Pesaje de café: bolsa abierta (en la balanza) y bolsas cerradas (las del depósito),
// cada una con su foto. Con "con_previa", primero ofrece el pesaje con el que entregó
// el turno anterior: si coincide, se toma ese y las fotos son las de ese reporte.
// Valor: { abierta_kg, cerradas_kg, coincide, previa_reporte_id, previa_nombre }
const FECHA_DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });

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
  const previa = campo.con_previa ? ctx.entregaPrevia : null;
  const fotos = fotosPesaje(campo.codigo);
  const set = parcial => onChange({ ...v, ...parcial });
  const hoy = ctx.fecha;
  const total = totalPesaje(v);
  const esEntrega = !campo.etapa;

  const cuandoPrevia = p => {
    const dia = p.fecha === hoy ? 'hoy' : FECHA_DIA.format(new Date(`${p.fecha}T12:00:00`));
    return `${dia}, turno ${p.turno.toLowerCase()} · ${hora(p.enviado_at)}`;
  };

  // Confirmar el pesaje previo copia sus kilos; "cargo otro" los deja libres.
  const confirmar = si => {
    if (si) set({ coincide: true, previa_reporte_id: previa.reporte_id, previa_nombre: previa.usuario_nombre, abierta_kg: previa.abierta_kg, cerradas_kg: previa.cerradas_kg });
    else set({ coincide: false, previa_reporte_id: previa.reporte_id, previa_nombre: previa.usuario_nombre, abierta_kg: '', cerradas_kg: '' });
  };

  const pideCarga = !previa || v.coincide === false;
  const resumen = esEntrega ? resumenEntrega(ctx.plantilla?.campos || [], ctx.respuestas || {}) : null;

  return (
    <div className="space-y-3">
      {previa && (
        <div className={`rounded-lg border p-3 space-y-2 ${v.coincide === true ? 'border-green-300 bg-green-50' : 'border-ahg-accent bg-ahg-accent/10'}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ahg-primary">
            {previa.usuario_nombre} entregó el turno · {cuandoPrevia(previa)}
          </p>
          <p className="text-sm">
            Tolva vacía. Café: <strong>{kg(previa.abierta_kg)}</strong> en bolsa abierta + <strong>{kg(previa.cerradas_kg)}</strong> en bolsas cerradas = <strong>{kg(previa.total)}</strong>.
            {previa.fecha === hoy && ' Pesado con vos.'}
          </p>
          {previa.adjuntos?.length > 0 && (
            <div className="flex gap-1.5">
              {previa.adjuntos.map(a => (
                <div key={a.id} className="w-14 h-[72px] rounded-md overflow-hidden border border-ahg-accent/40"><FotoAdjunta id={a.id} /></div>
              ))}
            </div>
          )}
          <p className="text-xs font-semibold text-ahg-primary">¿Recibís lo mismo?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => confirmar(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${v.coincide === true ? 'bg-green-600 text-white border-green-600' : 'bg-white text-ahg-text/70 border-ahg-accent/50'}`}>
              Sí, coincide
            </button>
            <button type="button" onClick={() => confirmar(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${v.coincide === false ? 'bg-ahg-primary text-white border-ahg-primary' : 'bg-white text-ahg-text/70 border-ahg-accent/50'}`}>
              No, cargo otro
            </button>
          </div>
          <p className="text-xs text-ahg-text/50">
            Si no coincide, cargás tu pesaje con tu foto y el encargado ve los dos.
            {ctx.onRefrescarPrevia && <> ¿No es la entrega que esperabas? <button type="button" onClick={ctx.onRefrescarPrevia} className="underline text-ahg-primary">Volver a buscar</button>.</>}
          </p>
        </div>
      )}

      {pideCarga && (
        <>
          <div>
            <p className="text-sm font-medium mb-1">Kilos en la bolsa abierta</p>
            <p className="text-xs text-ahg-text/50 mb-1.5">Con la tolva vacía, en la balanza de cocina{esEntrega ? ', junto con quien recibe' : ''}</p>
            <KgInput valor={v.abierta_kg} onChange={x => set({ abierta_kg: x })} />
            <div className="mt-2">
              <Fotos campo={{ codigo: fotos.abierta, max: 2 }} adjuntos={ctx.adjuntos} onSubir={ctx.onSubirFoto}
                     onBorrar={ctx.onBorrarFoto} subiendo={ctx.subiendo === fotos.abierta} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Kilos de café en bolsas cerradas</p>
            <p className="text-xs text-ahg-text/50 mb-1.5">Las del depósito. Sumá lo que dice cada bolsa.</p>
            <KgInput valor={v.cerradas_kg} onChange={x => set({ cerradas_kg: x })} />
            <div className="mt-2">
              <Fotos campo={{ codigo: fotos.cerradas, max: 3 }} adjuntos={ctx.adjuntos} onSubir={ctx.onSubirFoto}
                     onBorrar={ctx.onBorrarFoto} subiendo={ctx.subiendo === fotos.cerradas} />
            </div>
          </div>
        </>
      )}

      {esEntrega && resumen && (
        <div className="rounded-lg border border-ahg-accent bg-ahg-accent/10 p-3 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ahg-primary">Así entregás tu turno</p>
          <p className="text-sm">{resumen.texto}</p>
          {resumen.consumo !== null && (
            <p className="text-sm">Consumo de tu turno: <strong className="text-ahg-primary">{kg(resumen.consumo)}</strong> (recibiste con {kg(resumen.recibio)}).</p>
          )}
          <p className="text-xs text-ahg-text/50">Quien recibe va a ver este mismo pesaje al abrir su turno.</p>
        </div>
      )}
      {!esEntrega && total !== null && !previa && (
        <p className="text-xs text-ahg-text/60">Total: <strong>{kg(total)}</strong> de café.</p>
      )}
    </div>
  );
}

export default function Campo({ campo, valor, onChange, ctx }) {
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
        <Mantenimiento valor={valor} pendientes={ctx.mantenimientoPendientes || []} onChange={set} />
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
