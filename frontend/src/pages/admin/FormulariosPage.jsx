import { useState, useEffect } from 'react';
import api from '../../api';

const TIPOS = [
  { v: 'texto',           l: 'Texto corto' },
  { v: 'texto_largo',     l: 'Texto largo' },
  { v: 'numero',          l: 'Número entero' },
  { v: 'decimal',         l: 'Número con decimales' },
  { v: 'moneda',          l: 'Plata' },
  { v: 'seleccion',       l: 'Elegir una opción' },
  { v: 'si_no',           l: 'Sí o no' },
  { v: 'si_no_lista',     l: 'Sí o no, con detalle' },
  { v: 'checklist',       l: 'Checklist' },
  { v: 'horas_empleados', l: 'Horas del equipo' },
  { v: 'foto',            l: 'Fotos' },
  { v: 'facturas',        l: 'Facturas' },
];

const tipoLabel = v => TIPOS.find(t => t.v === v)?.l || v;

// Lista de textos sueltos: opciones de un desplegable, ítems de un checklist.
function Textos({ valores, onChange, placeholder }) {
  const lista = valores || [];
  return (
    <div className="space-y-1.5">
      {lista.map((x, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            className="input text-sm" value={x} placeholder={placeholder}
            onChange={e => onChange(lista.map((y, j) => (j === i ? e.target.value : y)))}
          />
          <button type="button" aria-label="Quitar"
                  onClick={() => onChange(lista.filter((_, j) => j !== i))}
                  className="text-red-500 text-xl leading-none px-2 hover:bg-red-50 rounded">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lista, ''])}
              className="text-sm font-semibold text-ahg-primary hover:underline">
        + Agregar
      </button>
    </div>
  );
}

function Campo({ campo, i, total, onChange, onMover, onBorrar }) {
  const [abierto, setAbierto] = useState(false);
  const set = (k, v) => onChange({ ...campo, [k]: v });
  const esTurno = campo.codigo === 'turno';

  return (
    <div className="border border-ahg-accent/40 rounded-xl bg-white">
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <button type="button" disabled={i === 0} onClick={() => onMover(i, -1)}
                  aria-label="Subir"
                  className="text-xs text-ahg-text/40 hover:text-ahg-primary disabled:opacity-20 leading-none">▲</button>
          <button type="button" disabled={i === total - 1} onClick={() => onMover(i, 1)}
                  aria-label="Bajar"
                  className="text-xs text-ahg-text/40 hover:text-ahg-primary disabled:opacity-20 leading-none">▼</button>
        </div>

        <button type="button" onClick={() => setAbierto(a => !a)} className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium truncate">
            {campo.label || <span className="text-ahg-text/40">sin pregunta</span>}
            {campo.requerido && <span className="text-red-500 ml-1">*</span>}
          </p>
          <p className="text-xs text-ahg-text/40">{tipoLabel(campo.tipo)}</p>
        </button>

        <button type="button" onClick={() => setAbierto(a => !a)}
                className="text-xs text-ahg-primary font-semibold hover:underline">
          {abierto ? 'Cerrar' : 'Editar'}
        </button>
      </div>

      {abierto && (
        <div className="px-3 pb-3 pt-1 border-t border-ahg-accent/30 space-y-3">
          <div>
            <label className="label">Pregunta</label>
            <input className="input" value={campo.label || ''} onChange={e => set('label', e.target.value)} />
          </div>
          <div>
            <label className="label">Aclaración <span className="font-normal text-ahg-text/40">(opcional)</span></label>
            <input className="input" value={campo.ayuda || ''} onChange={e => set('ayuda', e.target.value)}
                   placeholder="Texto chico debajo de la pregunta" />
          </div>

          {esTurno ? (
            <p className="text-xs text-ahg-text/50">
              El tipo del campo de turno no se puede cambiar: estructura todo el reporte.
            </p>
          ) : (
            <div>
              <label className="label">Tipo de respuesta</label>
              <select className="input" value={campo.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
          )}

          {campo.tipo === 'seleccion' && (
            <div>
              <label className="label">Opciones</label>
              <Textos valores={campo.opciones} onChange={v => set('opciones', v)} placeholder="Opción" />
            </div>
          )}

          {campo.tipo === 'checklist' && (
            <div>
              <label className="label">Ítems a tildar</label>
              <Textos valores={campo.items} onChange={v => set('items', v)} placeholder="Ítem del checklist" />
            </div>
          )}

          {campo.tipo === 'si_no_lista' && (
            <>
              <div>
                <label className="label">Pregunta intermedia (opcional)</label>
                <input className="input" value={campo.pregunta_lista || ''}
                       onChange={e => set('pregunta_lista', e.target.value)}
                       placeholder="Ej: ¿Hay productos que venzan en menos de 25 días?" />
                <p className="text-xs text-ahg-text/50 mt-1">
                  Si la completás, el detalle se pide solo cuando esta segunda pregunta también es “Sí”.
                </p>
              </div>
              <div>
                <label className="label">Título del detalle</label>
                <input className="input" value={campo.label_lista || ''}
                       onChange={e => set('label_lista', e.target.value)}
                       placeholder="Ej: Productos a menos de 25 días de vencer" />
              </div>
              <div>
                <label className="label">Datos que se piden de cada ítem</label>
                <Textos
                  valores={(campo.subcampos || []).map(s => s.label)}
                  onChange={labels => set('subcampos', labels.map((l, k) => ({
                    codigo: campo.subcampos?.[k]?.codigo
                      || l.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                           .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `campo_${k}`,
                    label: l, tipo: 'texto',
                  })))}
                  placeholder="Ej: Producto"
                />
              </div>
            </>
          )}

          {campo.tipo === 'foto' && (
            <div>
              <label className="label">Máximo de fotos</label>
              <input className="input w-24" inputMode="numeric" value={campo.max ?? 3}
                     onChange={e => set('max', Number(e.target.value.replace(/\D/g, '')) || 1)} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!campo.requerido}
                   onChange={e => set('requerido', e.target.checked)} />
            Obligatorio para poder enviar
          </label>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-ahg-text/30 font-mono">{campo.codigo}</span>
            {!esTurno && (
              <button type="button" onClick={() => onBorrar(i)}
                      className="text-sm text-red-600 font-medium hover:underline">
                Quitar esta pregunta
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FormulariosPage() {
  const [plantillas, setPlantillas] = useState([]);
  const [abierta, setAbierta] = useState(null);
  const [campos, setCampos]   = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  function cargar() {
    setCargando(true);
    api.get('/reportes/plantillas')
      .then(r => { setPlantillas(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los formularios'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  function abrir(p) {
    setAbierta(p);
    setCampos(JSON.parse(JSON.stringify(p.campos)));
    setError(''); setAviso('');
  }

  function mover(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= campos.length) return;
    const copia = [...campos];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    setCampos(copia);
  }

  function agregar() {
    const n = campos.length + 1;
    setCampos([...campos, {
      codigo: `campo_${n}_${Date.now().toString(36).slice(-4)}`,
      label: '', tipo: 'texto', requerido: false,
    }]);
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const r = await api.put(`/reportes/plantillas/${abierta.codigo}`, { campos });
      setAviso(`Guardado. Los reportes que ya se cargaron con la versión anterior no se tocan.`);
      setAbierta(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-2xl px-6 py-5" style={{ background: '#4C1D95' }}>
        <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Formularios
        </h1>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          Qué se le pregunta a cada uno al cerrar el turno
        </p>
      </div>

      <p className="text-sm text-ahg-text/60">
        Cambiar una pregunta acá se ve en el celular de la gente enseguida, sin necesidad de
        tocar el sistema. Los reportes ya cargados quedan como están: cada uno guarda la
        versión del formulario con la que se llenó.
      </p>

      {aviso && (
        <div className="card px-4 py-3 border-green-300 bg-green-50 text-green-800 text-sm flex justify-between gap-3">
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} className="font-bold">×</button>
        </div>
      )}
      {error && <div className="card px-4 py-3 border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {cargando ? (
        <p className="text-sm text-ahg-text/50">Cargando…</p>
      ) : !abierta ? (
        <div className="space-y-2">
          {plantillas.map(p => (
            <button key={p.codigo} onClick={() => abrir(p)}
                    className="card w-full p-4 text-left hover:border-ahg-primary transition-colors flex items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold">{p.nombre}</p>
                <p className="text-sm text-ahg-text/50">
                  {p.campos.length} pregunta{p.campos.length === 1 ? '' : 's'} · versión {p.version}
                </p>
              </div>
              <span className="text-ahg-primary text-sm font-medium">Editar →</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setAbierta(null)} className="btn-secondary">← Volver</button>
            <h2 className="font-bold flex-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {abierta.nombre}
            </h2>
          </div>

          <div className="space-y-2">
            {campos.map((c, i) => (
              <Campo
                key={c.codigo} campo={c} i={i} total={campos.length}
                onChange={nuevo => setCampos(campos.map((x, j) => (j === i ? nuevo : x)))}
                onMover={mover}
                onBorrar={j => setCampos(campos.filter((_, k) => k !== j))}
              />
            ))}
          </div>

          <button onClick={agregar}
                  className="w-full py-2.5 text-sm font-semibold text-ahg-primary border border-dashed border-ahg-accent rounded-lg hover:bg-ahg-accent/10">
            + Agregar una pregunta
          </button>

          <div className="flex gap-2 sticky bottom-4">
            <button onClick={() => setAbierta(null)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="btn-primary flex-1">
              {guardando ? 'Guardando…' : 'Guardar el formulario'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
