import { useState, useEffect } from 'react';
import api from '../../api';

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function Foto({ id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivo = true, creada = null;
    api.get(`/reportes/adjuntos/${id}`, { responseType: 'blob' })
      .then(r => { if (vivo) { creada = URL.createObjectURL(r.data); setUrl(creada); } })
      .catch(() => {});
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [id]);
  return (
    <div className="w-28 h-36 rounded-lg overflow-hidden border border-ahg-accent/40 bg-ahg-accent/10">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

// Muestra el valor de un campo según su tipo, con el label de la plantilla.
function Respuesta({ campo, valor, equipo }) {
  let cuerpo;

  if (campo.tipo === 'si_no_lista') {
    const v = valor || {};
    if (!v.hubo) cuerpo = <span className="text-ahg-text/40">No</span>;
    else cuerpo = (
      <ul className="list-disc pl-5 space-y-0.5">
        {(v.items || []).map((it, i) => (
          <li key={i}>{(campo.subcampos || []).map(sc => it[sc.codigo]).filter(Boolean).join(' — ')}</li>
        ))}
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
    </div>
  );
}

export default function DetalleReporte({ id, onCerrar, onRevisado }) {
  const [r, setR] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

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
  const campos = r.plantilla?.campos || [];
  const fotos  = (r.adjuntos || []);

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
          <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1">Turno</p>
          <p className="text-sm mb-2">{r.turno}</p>

          {campos.filter(c => c.codigo !== 'turno' && c.tipo !== 'foto' && c.tipo !== 'facturas').map(c => (
            <Respuesta key={c.codigo} campo={c} valor={r.respuestas?.[c.codigo]} equipo={equipo} />
          ))}

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
                      <span>{it.producto} × {Number(it.cantidad)}</span>
                      <span className="tabular-nums">$ {money.format(it.precio_unit)} c/u</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {fotos.length > 0 && (
            <div className="py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ahg-text/40 mb-1.5">Fotos</p>
              <div className="flex gap-2 flex-wrap">
                {fotos.map(a => <Foto key={a.id} id={a.id} />)}
              </div>
            </div>
          )}
        </div>

        {r.estado !== 'aprobado' && (
          <div className="px-5 py-4 border-t border-ahg-accent/30 space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
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
              <button onClick={() => revisar('aprobo')} disabled={enviando} className="btn-primary flex-1">
                Aprobar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

