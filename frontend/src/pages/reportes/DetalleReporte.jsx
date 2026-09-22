import { useState, useEffect } from 'react';
import api from '../../api';
import { cantidadConUnidad, precioPor } from '../../utils/unidades';
import { camposApertura, camposEntrega, tieneApertura, hora } from './etapas';
import { fotosPesaje, totalPesaje, kg, campoParaTurno } from './pesaje';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

// Las fotos llegan como blob autenticado, no como URL pública: cada una se baja una
// vez y el objectURL se comparte entre la miniatura y el visor grande.
function useFotos(adjuntos) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let vivo = true;
    const creadas = [];
    setUrls({});
    for (const a of adjuntos) {
      api.get(`/reportes/adjuntos/${a.id}`, { responseType: 'blob' })
        .then(r => {
          if (!vivo) return;
          const url = URL.createObjectURL(r.data);
          creadas.push(url);
          setUrls(u => ({ ...u, [a.id]: url }));
        })
        .catch(() => {});
    }
    return () => { vivo = false; creadas.forEach(u => URL.revokeObjectURL(u)); };
  }, [adjuntos.map(a => a.id).join(',')]);
  return urls;
}

function Foto({ url, onClick }) {
  return (
    <button
      type="button" onClick={onClick} disabled={!url}
      className="w-28 h-36 rounded-lg overflow-hidden border border-ahg-accent/40 bg-ahg-accent/10 block"
      aria-label="Ver foto grande"
    >
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </button>
  );
}

// Visor a pantalla completa. Flechas y Escape del teclado, o los botones en el celular.
function Visor({ fotos, urls, indice, onCambiar, onCerrar }) {
  const total = fotos.length;
  const ir = d => onCambiar((indice + d + total) % total);

  useEffect(() => {
    function tecla(e) {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const actual = fotos[indice];
  const url = urls[actual.id];

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center" onClick={onCerrar}>
      <button
        type="button" onClick={onCerrar} aria-label="Cerrar"
        className="absolute top-3 right-4 text-white/80 text-4xl leading-none hover:text-white"
      >×</button>

      {url
        ? <img src={url} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
        : <p className="text-white/70 text-sm">Cargando…</p>}

      {total > 1 && (
        <>
          <button
            type="button" onClick={e => { e.stopPropagation(); ir(-1); }} aria-label="Anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-2xl hover:bg-white/30"
          >‹</button>
          <button
            type="button" onClick={e => { e.stopPropagation(); ir(1); }} aria-label="Siguiente"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-2xl hover:bg-white/30"
          >›</button>
          <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-sm">
            {indice + 1} de {total}
          </p>
        </>
      )}
    </div>
  );
}

// Muestra el valor de un campo según su tipo, con el label de la plantilla.
function Respuesta({ campo, valor, equipo, items = [], productos = [], fecha, children }) {
  let cuerpo;

  if (campo.tipo === 'pesaje_cafe') {
    const t = totalPesaje(valor);
    cuerpo = t === null ? <span className="text-ahg-text/40">Sin pesaje</span> : (
      <p>Bolsa abierta <strong>{kg(valor.abierta_kg)}</strong> + bolsas cerradas <strong>{kg(valor.cerradas_kg)}</strong> = <strong>{kg(t)}</strong></p>
    );
  } else if (campo.tipo === 'mantenimiento' && typeof valor === 'object' && valor !== null) {
    // Lo que dijo el turno de cada pendiente, más lo que reportó nuevo.
    const porId = Object.fromEntries(items.map(it => [String(it.id), it]));
    const seg = Object.entries(valor.seguimiento || {});
    const nuevos = (valor.nuevos || []).filter(x => x?.texto?.trim());
    cuerpo = !seg.length && !nuevos.length
      ? <span className="text-ahg-text/40">Sin novedades</span>
      : (
        <ul className="space-y-1">
          {seg.map(([id, resp]) => (
            <li key={id} className="flex gap-2 items-start">
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${resp === 'resuelto' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {resp === 'resuelto' ? 'Se solucionó' : 'Sigue igual'}
              </span>
              <span>{porId[id]?.texto || `Ítem #${id}`}</span>
            </li>
          ))}
          {nuevos.map((x, i) => (
            <li key={x.item_id || i} className="flex gap-2 items-start">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 bg-amber-100 text-amber-800">Nuevo</span>
              <span className="whitespace-pre-line">{x.texto}</span>
            </li>
          ))}
        </ul>
      );
  } else if (campo.tipo === 'vencimientos') {
    // Producto del maestro y fecha del paquete; los días se recalculan contra el día
    // del reporte, así revisar uno viejo muestra lo que faltaba entonces.
    const v = valor || {};
    const nombres = new Map((productos || []).map(p => [p.id, p.nombre]));
    // La fecha del reporte puede venir como Date serializada ("2026-09-21T03:00:00Z"):
    // se recorta al día para que la resta sea entre dos mediodías y no corra el huso.
    const dia = String(fecha || '').slice(0, 10);
    const dias = vence => Math.round((Date.parse(`${vence}T12:00:00`) - Date.parse(`${dia}T12:00:00`)) / 86400000);
    if (!v.hubo) cuerpo = <span className="text-ahg-text/40">No</span>;
    else if (!(v.items || []).length) {
      cuerpo = <span>Sí <span className="text-ahg-text/40">· {campo.pregunta_lista} No</span></span>;
    } else cuerpo = (
      <ul className="list-disc pl-5 space-y-0.5">
        {(v.items || []).map((it, i) => (
          <li key={i}>
            {it.cantidad ? `${it.cantidad} × ` : ''}
            {it.producto_id ? (nombres.get(it.producto_id) || 'producto dado de baja') : it.producto}
            {it.vence
              ? <span className="text-ahg-text/50"> — vence {it.vence.split('-').reverse().join('/')} · faltan {dias(it.vence)} días</span>
              : it.dias ? <span className="text-ahg-text/50"> — {it.dias}</span> : null}
          </li>
        ))}
      </ul>
    );
  } else if (campo.tipo === 'si_no_lista') {
    const v = valor || {};
    const items = (v.items || [])
      .map(it => (campo.subcampos || [])
        .map(sc => sc.tipo === 'moneda' && it[sc.codigo] !== '' && it[sc.codigo] != null ? `$ ${money.format(it[sc.codigo])}` : it[sc.codigo])
        .filter(Boolean).join(' — '))
      .filter(Boolean);
    if (!v.hubo) cuerpo = <span className="text-ahg-text/40">No</span>;
    else if (campo.pregunta_lista && !items.length) {
      // Hizo el control y no encontró nada: eso es una respuesta, no un faltante.
      cuerpo = <span>Sí <span className="text-ahg-text/40">· {campo.pregunta_lista} No</span></span>;
    } else cuerpo = (
      <ul className="list-disc pl-5 space-y-0.5">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    );
  } else if (campo.tipo === 'horas_empleados') {
    const filas = valor || [];
    const total = filas.reduce((s, f) => s + (Number(f.horas) || 0), 0);
    cuerpo = (
      <>
        <ul className="space-y-0.5">
          {filas.map((f, i) => {
            const e = equipo[String(f.empleado_id)];
            return (
              <li key={i} className="flex justify-between gap-3 max-w-sm">
                <span>
                  {e ? e.nombre : `Empleado dado de baja (#${f.empleado_id})`}
                  {e?.puesto && <span className="text-ahg-text/40 capitalize"> · {e.puesto}</span>}
                </span>
                <span className="tabular-nums font-medium flex-shrink-0">{Number(f.horas).toFixed(1)} h</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ahg-text/50 mt-1">Total del turno: {total.toFixed(1)} h</p>
      </>
    );
  } else if (campo.tipo === 'si_no') {
    cuerpo = typeof valor !== 'boolean' ? <span className="text-ahg-text/40">Sin responder</span>
      : valor ? <span>Sí</span> : <span className="font-semibold text-red-700">No</span>;
  } else if (campo.tipo === 'moneda') {
    cuerpo = <span className="tabular-nums font-semibold">$ {money.format(valor || 0)}</span>;
  } else if (campo.tipo === 'checklist') {
    cuerpo = (valor || []).length
      ? <ul className="list-disc pl-5">{(valor || []).map(x => <li key={x}>{x}</li>)}</ul>
      : <span className="text-ahg-text/40">Nada marcado</span>;
  } else if (valor === undefined || valor === null || String(valor).trim() === '') {
    cuerpo = <span className="text-ahg-text/40">Sin novedades</span>;
  } else {
    cuerpo = <span className="whitespace-pre-line">{String(valor)}</span>;
  }

  return (
    <div className="py-2.5 border-b border-ahg-accent/20 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1">{campo.label}</p>
      <div className="text-sm text-ahg-text">{cuerpo}</div>
      {children}
    </div>
  );
}

export default function DetalleReporte({ id, onCerrar, onRevisado }) {
  const [r, setR] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);   // índice de la foto abierta en el visor
  const urls = useFotos(r?.adjuntos || []);

  useEffect(() => {
    api.get(`/reportes/${id}`).then(res => setR(res.data.data)).catch(() => setError('No se pudo abrir el reporte'));
  }, [id]);

  async function revisar(accion) {
    if (accion === 'observo' && !comentario.trim()) {
      setError('Escribí qué tiene que corregir');
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/reportes/${id}/revisar`, { accion, comentario });
      onRevisado();
      onCerrar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  }

  if (!r) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="card p-6 text-sm">{error || 'Cargando…'}</div>
      </div>
    );
  }

  const equipo = Object.fromEntries((r.equipo || []).map(e => [String(e.id), e]));
  // Con los textos del turno del reporte ("Café al empezar el día", no "Café").
  const campos = (r.plantilla?.campos || []).map(c => campoParaTurno(c, r.turno));
  const fotos  = r.adjuntos || [];
  const fotosDe = codigo => fotos.filter(a => a.campo_codigo === codigo);
  const Miniaturas = ({ lista }) => lista.length ? (
    <div className="flex gap-2 flex-wrap mt-1">
      {lista.map(a => <Foto key={a.id} url={urls[a.id]} onClick={() => setAbierta(fotos.indexOf(a))} />)}
    </div>
  ) : null;

  // Cada pregunta con sus fotos al lado: una de tipo foto son solo las miniaturas; un
  // pesaje trae las de la balanza y las de las bolsas cerradas.
  const pintar = c => {
    if (c.tipo === 'foto') {
      const lista = fotosDe(c.codigo);
      return (
        <div key={c.codigo} className="py-2.5 border-b border-ahg-accent/20 last:border-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1">{c.label}</p>
          {lista.length ? <Miniaturas lista={lista} /> : <span className="text-sm text-ahg-text/40">Sin foto</span>}
        </div>
      );
    }
    const extra = c.tipo === 'pesaje_cafe' ? [...fotosDe(fotosPesaje(c.codigo).abierta), ...fotosDe(fotosPesaje(c.codigo).cerradas)] : [];
    return (
      <Respuesta
        key={c.codigo} campo={c} valor={r.respuestas?.[c.codigo]} equipo={equipo}
        items={r.mantenimiento_items || []} productos={r.vencimiento_productos || []} fecha={r.fecha}
      >
        {extra.length > 0 && <Miniaturas lista={extra} />}
      </Respuesta>
    );
  };
  // Fotos de campos que ya no están en la plantilla (o de versiones viejas).
  const codigosConocidos = new Set(campos.flatMap(c => c.tipo === 'pesaje_cafe' ? Object.values(fotosPesaje(c.codigo)) : [c.codigo]));
  const sueltas = fotos.filter(a => !codigosConocidos.has(a.campo_codigo));
  const Etapa = ({ titulo }) => (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="text-[11px] font-bold uppercase tracking-widest text-ahg-primary">{titulo}</span>
      <span className="flex-1 h-px bg-ahg-accent/40" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg my-4">
        <div className="px-5 py-4 border-b border-ahg-accent/30 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {r.plantilla?.nombre}
            </h2>
            <p className="text-sm text-ahg-text/60">
              {r.usuario_nombre}{r.usuario_puesto && <span className="capitalize"> · {r.usuario_puesto}</span>} · {r.local_nombre} · turno {r.turno.toLowerCase()}
            </p>
          </div>
          <button onClick={onCerrar} className="text-ahg-text/40 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-3">
          {r.estado === 'observado' && r.observacion && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3 text-sm">
              <p className="font-semibold text-red-800">Devuelto · esperando la corrección</p>
              <p className="text-red-700 mt-0.5 whitespace-pre-line">“{r.observacion.comentario}”</p>
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1">Turno</p>
          <p className="text-sm mb-2">{r.turno}</p>

          {tieneApertura(campos) ? (
            <>
              <Etapa titulo={`Recibió el turno${r.apertura_at ? ` · ${hora(r.apertura_at)}` : ' · sin confirmar'}`} />
              {camposApertura(campos).map(pintar)}
              <Etapa titulo={`Entregó el turno${r.enviado_at ? ` · ${hora(r.enviado_at)}` : ''}`} />
              {camposEntrega(campos).filter(c => c.tipo !== 'facturas').map(pintar)}
            </>
          ) : campos.filter(c => c.codigo !== 'turno' && c.tipo !== 'facturas').map(pintar)}

          {r.facturas?.length > 0 && (
            <div className="py-2.5 border-b border-ahg-accent/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1.5">Facturas</p>
              {r.facturas.map(f => (
                <div key={f.id} className="mb-2 p-3 rounded-lg bg-ahg-bg border border-ahg-accent/30">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>{f.proveedor}</span>
                    <span className="tabular-nums">$ {money.format(f.total)}</span>
                  </div>
                  <p className="text-xs text-ahg-text/50">{f.numero || 'sin número'}</p>
                  {(f.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between text-xs text-ahg-text/70 mt-1">
                      <span>{it.producto} × {cantidadConUnidad(it.cantidad, it.unidad)}</span>
                      <span className="tabular-nums">$ {money.format(it.precio_unit)} {precioPor(it.unidad)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {sueltas.length > 0 && (
            <div className="py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1.5">Otras fotos</p>
              <div className="flex gap-2 flex-wrap">
                {sueltas.map(a => <Foto key={a.id} url={urls[a.id]} onClick={() => setAbierta(fotos.indexOf(a))} />)}
              </div>
            </div>
          )}
        </div>

        {abierta != null && (
          <Visor fotos={fotos} urls={urls} indice={abierta} onCambiar={setAbierta} onCerrar={() => setAbierta(null)} />
        )}

        {/* Un aprobado también se puede devolver (por si se aprobó por error); lo que no tiene sentido es volver a aprobarlo. */}
        <div className="px-5 py-4 border-t border-ahg-accent/30 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {r.estado === 'aprobado' && (
            <p className="text-sm text-ahg-text/60">Ya está aprobado. Si fue por error, escribí qué tiene que corregir y devolvelo.</p>
          )}
          <textarea
            className="input" rows={2} value={comentario}
            placeholder="Si lo devolvés, escribí qué tiene que corregir"
            onChange={e => setComentario(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={() => revisar('observo')} disabled={enviando}
                    className="btn-secondary flex-1 !text-red-600 !border-red-300">
              Devolver
            </button>
            {r.estado !== 'aprobado' && (
              <button onClick={() => revisar('aprobo')} disabled={enviando} className="btn-primary flex-1">
                Aprobar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

