import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { esDueno } from '../../utils/roles';
import { MARCAS } from '../../marcas';
import { Proximamente } from '../MarcaProximamente';
import { fmtARS } from '../red/redUtils';

// Kankay todavía no tiene de dónde sacar sus números: por ahora su pantalla es un
// estado de resultados que el dueño carga a mano, mes por mes. Todo se guarda solo.
const MARCA = MARCAS.find(m => m.slug === 'kankay');

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesLabel = p => { const [y, m] = p.split('-'); return `${MESES[Number(m) - 1]} ${y}`; };
const aPeriodo  = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const mesActual = () => aPeriodo(new Date());

// Kankay arrancó en agosto de 2026: la lista va desde ahí hasta el mes en curso.
const INICIO = '2026-08';
function mesesDesdeInicio() {
  const out = [];
  const d = new Date(Number(INICIO.slice(0, 4)), Number(INICIO.slice(5)) - 1, 1);
  while (aPeriodo(d) <= mesActual()) { out.push(aPeriodo(d)); d.setMonth(d.getMonth() + 1); }
  return out;
}

// Los grupos en el orden del estado de resultados. Los montos se escriben en positivo:
// el signo lo pone el grupo. Después de cada uno puede venir un subtotal.
const GRUPOS = [
  { key: 'ingresos',    label: 'Ventas',                          signo: '+', agregar: 'venta' },
  { key: 'deducciones', label: 'Deducciones de ventas',           signo: '−', agregar: 'deducción',
    subtotal: { key: 'ventasNetas', label: 'Ventas netas' } },
  { key: 'cmv',         label: 'Costo de la mercadería vendida',  signo: '−', agregar: 'costo',
    subtotal: { key: 'margenBruto', label: 'Margen bruto' } },
  { key: 'gastos',      label: 'Gastos operativos',               signo: '−', agregar: 'gasto',
    subtotal: { key: 'operativo',   label: 'Resultado operativo' } },
  // Lo que entra una vez y no es del negocio de todos los meses (una nota de crédito de
  // acompañamiento del proveedor, por ejemplo): va abajo para no inflar el margen.
  { key: 'otros',       label: 'Otros ingresos no recurrentes',   signo: '+', agregar: 'ingreso' },
  { key: 'financieros', label: 'Impuestos y gastos financieros',  signo: '−', agregar: 'renglón',
    subtotal: { key: 'neto',        label: 'Resultado neto', final: true } },
];

// Nombre · monto · % · borrar. En el celular el nombre va en su propia línea, arriba.
const COLS = 'grid-cols-[1fr_7.5rem_3.5rem_1.75rem] sm:grid-cols-[1fr_9rem_4.5rem_2rem]';

const nuevoId = () => Math.random().toString(36).slice(2, 10);

function calcular(lineas) {
  const suma = g => lineas.filter(l => l.grupo === g).reduce((s, l) => s + (Number(l.monto) || 0), 0);
  const t = Object.fromEntries(GRUPOS.map(g => [g.key, suma(g.key)]));
  const ventasNetas = t.ingresos - t.deducciones;
  const margenBruto = ventasNetas - t.cmv;
  const operativo   = margenBruto - t.gastos;
  const neto        = operativo + t.otros - t.financieros;
  return { ...t, ventasNetas, margenBruto, operativo, neto };
}

const fmtPct = (v, base) => base ? `${((v / base) * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';

// "1.234.567" o "1234567,50" → número. Vacío → null (renglón sin cargar).
function parseMonto(txt) {
  const limpio = String(txt).replace(/[$\s.]/g, '').replace(',', '.');
  if (limpio === '' || limpio === '-') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// Mientras se escribe se ve el número tal cual; al salir queda con puntos de miles.
function MontoInput({ value, onChange }) {
  const [texto, setTexto] = useState(null);
  const mostrado = texto ?? (value == null ? '' : Math.round(value).toLocaleString('es-AR'));
  return (
    <input
      inputMode="decimal"
      value={mostrado}
      placeholder="—"
      onFocus={() => setTexto(value == null ? '' : String(value).replace('.', ','))}
      onChange={e => { setTexto(e.target.value); onChange(parseMonto(e.target.value)); }}
      onBlur={() => setTexto(null)}
      className="w-full text-right tabular-nums bg-transparent rounded-md px-2 py-1 border border-transparent hover:border-stone-200 focus:border-ahg-secondary focus:outline-none focus:bg-white"
    />
  );
}

function FilaSubtotal({ label, valor, base, final }) {
  const negativo = valor < 0;
  return (
    <div className={`grid ${COLS} items-center gap-2 px-3 sm:px-4 py-3 rounded-xl
      ${final ? 'bg-ahg-primary text-white' : 'bg-ahg-bg border border-stone-200'}`}>
      <span className="font-bold text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>{label}</span>
      <span className={`text-right font-bold tabular-nums ${!final && negativo ? 'text-red-600' : ''}`}>{fmtARS(valor)}</span>
      <span className={`text-right text-xs tabular-nums ${final ? 'text-white/70' : 'text-stone-500'}`}>{fmtPct(valor, base)}</span>
      <span />
    </div>
  );
}

function EstadoDeResultados() {
  const [periodo, setPeriodo]     = useState(null);   // arranca en el último mes con datos
  const [meses, setMeses]         = useState([]);
  const [lineas, setLineas]       = useState(null);
  const [guardado, setGuardado]   = useState(false);
  const [estado, setEstado]       = useState('');   // '', 'pendiente', 'guardando', 'ok', 'error'
  const [actualizado, setActualizado] = useState(null);
  const pendiente = useRef(null);                   // { periodo, lineas } sin guardar todavía
  const timer     = useRef(null);

  const cargarMeses = useCallback(() => {
    api.get('/eerr-manual/kankay').then(r => setMeses(r.data.data)).catch(() => {});
  }, []);

  const guardar = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    setEstado('guardando');
    try {
      const r = await api.put(`/eerr-manual/kankay/${p.periodo}`, { lineas: p.lineas });
      setActualizado(r.data.data.actualizado_en);
      setGuardado(true);
      setEstado(pendiente.current ? 'pendiente' : 'ok');
      cargarMeses();
    } catch {
      pendiente.current = pendiente.current || p;
      setEstado('error');
    }
  }, [cargarMeses]);

  useEffect(() => {
    api.get('/eerr-manual/kankay')
      .then(r => { setMeses(r.data.data); setPeriodo(r.data.data[0]?.periodo || mesActual()); })
      .catch(() => setPeriodo(mesActual()));
  }, []);

  // Al cambiar de mes, primero se guarda lo que quedó escrito en el anterior.
  useEffect(() => {
    if (!periodo) return;
    let vivo = true;
    (async () => {
      await guardar();
      setLineas(null);
      const r = await api.get(`/eerr-manual/kankay/${periodo}`);
      if (!vivo) return;
      setLineas(r.data.data.lineas);
      setGuardado(r.data.data.guardado);
      setActualizado(r.data.data.actualizado_en);
      setEstado('');
    })().catch(() => vivo && setEstado('error'));
    return () => { vivo = false; };
  }, [periodo, guardar]);

  // Si se cierra la pestaña con algo sin guardar, avisa.
  useEffect(() => {
    const h = e => { if (pendiente.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => { window.removeEventListener('beforeunload', h); guardar(); };
  }, [guardar]);

  function cambiar(nuevas) {
    setLineas(nuevas);
    pendiente.current = { periodo, lineas: nuevas };
    setEstado('pendiente');
    clearTimeout(timer.current);
    timer.current = setTimeout(guardar, 800);
  }

  const editar  = (id, campo, valor) => cambiar(lineas.map(l => l.id === id ? { ...l, [campo]: valor } : l));
  const borrar  = id => cambiar(lineas.filter(l => l.id !== id));
  const agregar = grupo => {
    // Va al final de su grupo, para que no se mezcle con los de otro.
    const ultimo = lineas.map(l => l.grupo).lastIndexOf(grupo);
    const nueva  = { id: nuevoId(), grupo, nombre: '', monto: null };
    const copia  = [...lineas];
    copia.splice(ultimo === -1 ? copia.length : ultimo + 1, 0, nueva);
    cambiar(copia);
  };

  const t = lineas ? calcular(lineas) : null;
  const base = t?.ventasNetas;

  const textoEstado = {
    pendiente: 'Sin guardar…',
    guardando: 'Guardando…',
    ok:        'Guardado',
    error:     'No se pudo guardar. Reintentá tocando un monto.',
  }[estado] || (guardado && actualizado
    ? `Guardado el ${new Date(actualizado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    : 'Este mes todavía no tiene nada cargado');

  // Del mes en curso para atrás hasta el arranque, más cualquiera que ya tenga datos.
  const opciones = [...new Set([...mesesDesdeInicio(), ...meses.map(m => m.periodo), periodo].filter(Boolean))].sort().reverse();

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-12 w-24 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: MARCA.fondo }}>
          <img src={MARCA.logo} alt="Kankay" className="h-10 w-auto object-contain" />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <h1 className="text-xl font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>Estado de resultados</h1>
          <p className="text-xs text-ahg-text/50">Kankay · cargado a mano · los montos van sin IVA y en positivo</p>
        </div>
        <select
          value={periodo || ''}
          onChange={e => setPeriodo(e.target.value)}
          className="w-full sm:w-auto border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {opciones.map(p => (
            <option key={p} value={p}>{mesLabel(p)}{meses.some(m => m.periodo === p) ? '' : ' (vacío)'}</option>
          ))}
        </select>
      </div>

      {!lineas ? (
        <div className="card p-10 text-center text-sm text-stone-400">Cargando…</div>
      ) : (
        <>
          {/* Lo que se mira primero */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Ventas netas', t.ventasNetas],
              ['Margen bruto', t.margenBruto],
              ['Resultado operativo', t.operativo],
              ['Resultado neto', t.neto],
            ].map(([label, v], i) => (
              <div key={label} className="card px-4 py-3">
                <p className="text-xs text-stone-500">{label}</p>
                <p className={`text-lg font-bold tabular-nums ${v < 0 ? 'text-red-600' : 'text-ahg-text'}`}>{fmtARS(v)}</p>
                <p className="text-xs text-stone-400 tabular-nums">{i === 0 ? mesLabel(periodo) : `${fmtPct(v, base)} de ventas`}</p>
              </div>
            ))}
          </div>

          <div className="card p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-stone-400">{textoEstado}</p>
              <p className="text-xs text-stone-400">% sobre ventas netas</p>
            </div>

            {GRUPOS.map(g => {
              const delGrupo = lineas.filter(l => l.grupo === g.key);
              return (
                <div key={g.key} className="space-y-1">
                  <div className={`grid ${COLS} items-center gap-x-2 px-3 sm:px-4 pt-2`}>
                    <p className="col-span-4 sm:col-span-1 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      <span className="text-stone-400 mr-1.5">{g.signo}</span>{g.label}
                    </p>
                    <p className="col-start-2 sm:col-start-auto text-right text-sm font-semibold tabular-nums text-stone-700">{fmtARS(t[g.key])}</p>
                    <p className="text-right text-xs tabular-nums text-stone-400">{fmtPct(t[g.key], base)}</p>
                    <span />
                  </div>

                  {delGrupo.map(l => (
                    <div key={l.id} className={`group grid ${COLS} items-center gap-x-2 px-1 sm:px-2 py-0.5 sm:py-0 rounded-lg hover:bg-stone-50`}>
                      <input
                        value={l.nombre}
                        placeholder="Nombre del renglón"
                        onChange={e => editar(l.id, 'nombre', e.target.value)}
                        className="col-span-4 sm:col-span-1 w-full text-sm text-stone-700 bg-transparent rounded-md px-2 py-1 border border-transparent hover:border-stone-200 focus:border-ahg-secondary focus:outline-none focus:bg-white"
                      />
                      <div className="col-start-2 sm:col-start-auto"><MontoInput value={l.monto} onChange={v => editar(l.id, 'monto', v)} /></div>
                      <span className="text-right text-xs tabular-nums text-stone-400">{l.monto ? fmtPct(l.monto, base) : ''}</span>
                      <button
                        onClick={() => borrar(l.id)}
                        title="Borrar renglón"
                        className="w-7 h-7 flex items-center justify-center rounded-full text-stone-300 hover:text-red-600 hover:bg-red-50 sm:opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >✕</button>
                    </div>
                  ))}

                  <button
                    onClick={() => agregar(g.key)}
                    className="ml-3 sm:ml-4 text-xs font-semibold text-ahg-secondary hover:text-ahg-primary py-1"
                  >+ Agregar {g.agregar}</button>

                  {g.subtotal && (
                    <div className="pt-1">
                      <FilaSubtotal label={g.subtotal.label} valor={t[g.subtotal.key]} base={base} final={g.subtotal.final} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-stone-400 px-1 leading-relaxed">
            Un mes nuevo arranca con los mismos renglones del mes anterior y los montos en blanco.
            Se guarda solo a medida que escribís.
          </p>
        </>
      )}
    </div>
  );
}

export default function KankayPage() {
  const { user } = useAuth();
  // Es plata: solo el dueño la ve. El Encargado General sigue viendo "Próximamente".
  if (!esDueno(user)) return <Proximamente marca={{ ...MARCA, proximamente: true }} />;
  return <EstadoDeResultados />;
}
