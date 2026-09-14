import { useState, useEffect } from 'react';
import api from '../../api';

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
            {subcampos.map(sc => (
              <input
                key={sc.codigo}
                className="input text-sm"
                placeholder={sc.label}
                value={fila[sc.codigo] || ''}
                onChange={e => editar(i, sc.codigo, e.target.value)}
              />
            ))}
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
function FotoAdjunta({ id }) {
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
