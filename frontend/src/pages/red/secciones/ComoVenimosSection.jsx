import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api';
import { useAuth } from '../../../contexts/AuthContext';
import { esDueno } from '../../../utils/roles';
import { fmtARS, fmtDoc, fmtNum, colorDeTienda, shortName, ordenarTiendas } from '../redUtils';

// "Cómo venimos": la primera pestaña del tablero de Entre Dos. El mes en curso (o el
// año) de las tiendas y del Café por separado, porque se miden distinto: las tiendas
// por docenas, el Café por facturación y personas. Abajo, toda la red junta.
// Contra el año pasado se muestran dos lecturas de la facturación: sin la inflación
// del país y sin la suba de nuestros propios precios.

const COBRE = '#8a5a3c';
const GRIS  = '#45484c';
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pct1 = v => Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function partes(iso) { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; }
function diaMes(iso) { const { m, d } = partes(iso); return `${d}/${m}`; }

// ── Piezas chicas ────────────────────────────────────────────────────────────

function Chip({ a, b, texto, oscuro }) {
  if (!b) return null;
  const v = (a / b - 1) * 100;
  const tono = Math.abs(v) < 2 ? 'mid' : v > 0 ? 'up' : 'down';
  const clases = oscuro
    ? { up: 'bg-white/15 text-emerald-200', down: 'bg-white/15 text-red-200', mid: 'bg-white/15 text-white' }
    : { up: 'bg-emerald-50 text-emerald-700', down: 'bg-red-50 text-red-700', mid: 'bg-stone-100 text-stone-500' };
  return (
    <span className={`text-[11.5px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap tabular-nums ${clases[tono]}`}>
      {v >= 0 ? '▲' : '▼'} {pct1(v)} %{texto}
    </span>
  );
}

function ChipGris({ children, oscuro }) {
  return (
    <span className={`text-[11.5px] font-semibold rounded-full px-2 py-0.5 ${oscuro ? 'bg-white/15 text-white' : 'bg-stone-100 text-stone-500'}`}>
      {children}
    </span>
  );
}

// Un renglón de comparación, siempre real contra real: contra qué, cuánto fue y el %.
function Fila({ label, a, b, fmt, oscuro, sub, parcial, nota }) {
  if (!b) return null;
  const v = (a / b - 1) * 100;
  const color = Math.abs(v) < 2 ? (oscuro ? 'text-white' : 'text-stone-600') : v > 0 ? (oscuro ? 'text-emerald-200' : 'text-emerald-700') : (oscuro ? 'text-red-200' : 'text-red-700');
  return (
    <div className={`flex items-start justify-between gap-2 text-[12px] ${sub ? 'pl-3' : ''}`}>
      <span className="min-w-0">
        <span className={`block ${oscuro ? 'text-white/70' : 'text-stone-500'}`}>{label}</span>
        <span className={`block tabular-nums text-[11.5px] ${oscuro ? 'text-white/85' : 'text-stone-700'}`}>
          {parcial ? <>{fmt(a)} <span className={oscuro ? 'text-white/55' : 'text-stone-400'}>contra</span> {fmt(b)}</> : fmt(b)}
        </span>
        {nota && <span className={`block text-[11px] ${oscuro ? 'text-white/55' : 'text-stone-400'}`}>{nota}</span>}
      </span>
      <b className={`tabular-nums whitespace-nowrap ${color}`}>{v >= 0 ? '▲' : '▼'} {pct1(v)} %</b>
    </div>
  );
}

function FilaGris({ children, oscuro }) {
  return <p className={`text-[12px] ${oscuro ? 'text-white/55' : 'text-stone-400'}`}>{children}</p>;
}

// Las dos lecturas sin precios, en pesos: lo del año pasado llevado a precios de hoy
// con la inflación del país y con nuestra propia suba.
function SinPrecios({ a, b, inflacion, suba, fmt = fmtARS, oscuro, parcial }) {
  if (!b) return null;
  return (
    <>
      {inflacion != null && <Fila oscuro={oscuro} fmt={fmt} a={a} b={b * (1 + inflacion / 100)} sub label={`+ inflación ${pct1(inflacion)} %`} />}
      {suba != null && <Fila oscuro={oscuro} fmt={fmt} a={a} b={b * (1 + suba / 100)} sub label={`+ nuestra suba ${pct1(suba)} %`} />}
    </>
  );
}

function Tarjeta({ tono, titulo, valor, abajo, children, explica }) {
  const fondo = tono === 'gris' ? { background: GRIS, color: '#fff' } : tono === 'cobre' ? { background: COBRE, color: '#fff' } : {};
  const oscuro = !!tono;
  return (
    <div className={`rounded-2xl p-4 flex flex-col gap-1.5 ${oscuro ? '' : 'bg-white'}`} style={fondo}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${oscuro ? 'text-white/65' : 'text-stone-500'}`}>{titulo}</p>
      <p className="text-2xl font-extrabold leading-tight tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>{valor}</p>
      {abajo && <p className={`text-[12.5px] tabular-nums ${oscuro ? 'text-white/65' : 'text-stone-500'}`}>{abajo}</p>}
      <div className={`grid gap-1 pt-2 border-t ${oscuro ? 'border-white/15' : 'border-stone-100'}`}>{children}</div>
      {explica && (
        <p className={`text-xs pt-2 mt-auto border-t ${oscuro ? 'text-white/60 border-white/15' : 'text-stone-500 border-stone-100'}`}>{explica}</p>
      )}
    </div>
  );
}

function Bloque({ titulo, cafe, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1 pt-1">
        <h3 className="text-[17px] font-bold" style={{ fontFamily: 'Nunito, sans-serif', color: cafe ? COBRE : undefined }}>{titulo}</h3>
        <span className="flex-1 h-px" style={{ background: cafe ? COBRE : '#d6d5cf', opacity: cafe ? 0.4 : 1 }} />
      </div>
      {children}
    </div>
  );
}

function Curva({ serie, color }) {
  if (!serie || serie.length < 2) return null;
  const w = 96, h = 26, p = 3;
  const min = Math.min(...serie), max = Math.max(...serie);
  const pts = serie.map((v, i) => [p + i * (w - 2 * p) / (serie.length - 1), h - p - (v - min) / (max - min || 1) * (h - 2 * p)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block ml-auto" aria-hidden="true">
      <polyline fill="none" stroke="#a3a5a8" strokeWidth="1.5" strokeLinejoin="round" points={pts.map(q => q.join(',')).join(' ')} />
      <circle cx={lx} cy={ly} r="2.8" fill={color} stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

// ── Sumas por grupo de locales ───────────────────────────────────────────────

const VACIO = { f: 0, tk: 0, p: 0, d: 0 };
function suma(lista, sel) {
  return lista.reduce((o, l) => {
    const x = sel(l) || VACIO;
    return { f: o.f + x.f, tk: o.tk + x.tk, p: o.p + x.p, d: o.d + x.d };
  }, { ...VACIO });
}

// Lo comparable contra el año pasado: cada local en los días que también tiene cargados
function comparable(lista) {
  const con = lista.filter(l => l.anio_ant);
  if (!con.length) return null;
  const afuera = lista.map(l => (!l.anio_ant ? `sin ${shortName(l.nombre)}`
    : !l.anio_ant.completo ? `${shortName(l.nombre)} desde el ${diaMes(l.anio_ant.desde)}` : null)).filter(Boolean);
  return {
    act: suma(con, l => l.anio_ant.act), ant: suma(con, l => l.anio_ant.ant),
    parcial: afuera.length > 0,
    nota: afuera.length ? `Solo lo que se puede comparar: ${afuera.join(' · ')}` : null,
  };
}

// ── Inflación: el dato y, para el dueño, cómo cambiarlo ──────────────────────

function Inflacion({ inflacion, puedeEditar, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [mes, setMes] = useState('');
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const etiqueta = inflacion?.mes ? `${MES_LARGO[partes(`${inflacion.mes}-01`).m - 1]} ${inflacion.mes.slice(0, 4)}` : '';

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setError(null);
    try {
      const r = await api.put('/red/parametros/ipc', { valor, mes });
      onGuardado(r.data.data);
      setEditando(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={guardar} className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
        <span>Inflación interanual del INDEC:</span>
        <input id="ipc-valor" className="input text-xs w-20 py-1" value={valor} onChange={e => setValor(e.target.value)} placeholder="33,5" inputMode="decimal" />
        <span>% · dato de</span>
        <input id="ipc-mes" type="month" className="input text-xs w-36 py-1" value={mes} onChange={e => setMes(e.target.value)} />
        <button className="btn-primary text-xs px-3 py-1" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="text-xs text-stone-500 underline" onClick={() => setEditando(false)}>Cancelar</button>
        {error && <span className="text-red-600 w-full">{error}</span>}
      </form>
    );
  }
  return (
    <span>
      "+ inflación" usa la inflación interanual del INDEC: {inflacion?.valor != null ? `${pct1(inflacion.valor)} % (${etiqueta})` : 'sin cargar'}.
      {puedeEditar && (
        <button
          className="ml-1.5 underline text-stone-600 hover:text-stone-900"
          onClick={() => { setValor(inflacion?.valor != null ? String(inflacion.valor).replace('.', ',') : ''); setMes(inflacion?.mes || ''); setEditando(true); }}
        >
          Cambiar
        </button>
      )}
    </span>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export default function ComoVenimosSection({ selId = null }) {
  const { user } = useAuth();
  const [modo, setModo]       = useState('mes');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [abiertas, setAbiertas] = useState(new Set());

  useEffect(() => {
    setLoading(true); setError(null);
    api.get('/red/como-venimos', { params: { modo } })
      .then(r => setData(r.data.data))
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [modo]);

  const seg = (activo) => `px-3 py-1.5 text-xs font-semibold transition-colors ${activo ? 'bg-ahg-primary text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`;

  const cabecera = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="flex flex-wrap items-baseline gap-2">
        {data && (
          <b className="text-[15px]" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {data.periodo.modo === 'anio'
              ? `Del 1 de enero al ${partes(data.periodo.hasta).d} de ${MES_LARGO[partes(data.periodo.hasta).m - 1]}`
              : `${MES_LARGO[partes(data.periodo.hasta).m - 1].replace(/^./, c => c.toUpperCase())}, del 1 al ${partes(data.periodo.hasta).d}`}
          </b>
        )}
        <span className="text-xs text-stone-500">
          {(data ? data.periodo.modo : modo) === 'anio' ? 'comparado contra los mismos días del año pasado' : 'comparado contra los mismos días del mes pasado y del año pasado'}
        </span>
      </div>
      <div className="flex rounded-lg border border-stone-200 overflow-hidden">
        <button className={seg(modo === 'mes')} aria-pressed={modo === 'mes'} onClick={() => setModo('mes')}>Este mes</button>
        <button className={seg(modo === 'anio')} aria-pressed={modo === 'anio'} onClick={() => setModo('anio')}>Este año</button>
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {cabecera}
        <div className="grid sm:grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-stone-200 rounded-2xl animate-pulse" />)}</div>
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!data) return <p className="text-center py-16 text-stone-400">Todavía no hay ventas cargadas.</p>;

  const p = data.periodo;
  const anio = p.modo === 'anio'; // lo que dicen los números en pantalla, aunque el otro período esté cargando
  const inf = data.inflacion?.valor;
  const suba = data.suba_precios || {};
  const locales = data.locales;
  const nombresOrden = ordenarTiendas(locales.map(l => l.nombre));
  const ordenados = [...locales].sort((a, b) => nombresOrden.indexOf(a.nombre) - nombresOrden.indexOf(b.nombre));
  const tiendasTodas = ordenados.filter(l => !l.es_cafe);
  const cafeLocal = ordenados.find(l => l.es_cafe);
  const sel = locales.find(l => l.local_id === selId) || null;
  const verTiendas = !sel || !sel.es_cafe;
  const verCafe = !sel || sel.es_cafe;
  const tiendas = sel && !sel.es_cafe ? [sel] : tiendasTodas;

  const proy = v => v * p.dias_total / p.n_dias;
  const mesAntNombre = p.mes_ant ? MES_CORTO[partes(p.mes_ant.desde).m - 1] : '';
  const txtMesAnt = p.mes_ant ? ` vs ${partes(p.mes_ant.desde).d}–${partes(p.mes_ant.hasta).d} ${mesAntNombre}` : '';
  const anioAnt = partes(p.anio_ant.desde).y;
  const txtAnioAnt = anio ? ` vs ${anioAnt}` : ` vs ${partes(p.anio_ant.desde).d}–${partes(p.anio_ant.hasta).d} ${MES_CORTO[partes(p.anio_ant.desde).m - 1]} ${anioAnt}`;
  // Contra qué se compara cada renglón (siempre lo vendido de verdad en esos días)
  const lblMes = p.mes_ant ? `${partes(p.mes_ant.desde).d}–${partes(p.mes_ant.hasta).d} ${MES_CORTO[partes(p.mes_ant.desde).m - 1]}` : null;
  const lblAnio = anio ? `Mismos días ${anioAnt}` : `${partes(p.anio_ant.desde).d}–${partes(p.anio_ant.hasta).d} ${MES_CORTO[partes(p.anio_ant.desde).m - 1]} ${anioAnt}`;
  const estimado = v => `Estimado: a este ritmo cierra ${anio ? 'el año' : 'el mes'} en ${v}`;

  // ── Tiendas ──
  const tAct = suma(tiendas, l => l.act);
  const tMes = p.mes_ant ? suma(tiendas, l => l.mes_ant) : null;
  const tCmp = comparable(tiendas);
  const tTotAnt = suma(tiendas, l => l.anio_ant_total);
  const chipsT = (k, oscuro, fmt) => (
    <>
      {tMes && <Fila label={lblMes} a={tAct[k]} b={tMes[k]} fmt={fmt} oscuro={oscuro} />}
      {tCmp?.parcial && <Fila label={`Total vendido, ${lblAnio.toLowerCase()}`} a={tAct[k]} b={tTotAnt[k]} fmt={fmt} oscuro={oscuro} parcial />}
      {tCmp ? <Fila label={tCmp.parcial ? `Lo comparable, ${lblAnio.toLowerCase()}` : lblAnio} a={tCmp.act[k]} b={tCmp.ant[k]} fmt={fmt} oscuro={oscuro} parcial={tCmp.parcial} nota={tCmp.nota} />
            : <FilaGris oscuro={oscuro}>No abría el año pasado</FilaGris>}
    </>
  );

  // ── Café ──
  const c = cafeLocal;
  const cCmp = c?.anio_ant || null;
  const cParcial = !!cCmp && !cCmp.completo;
  const cNota = cParcial ? `Solo lo que se puede comparar: desde el ${diaMes(cCmp.desde)}` : null;
  const personasAnt = cCmp && cCmp.ant.p > 0;

  // ── Red ──
  const rAct = suma(ordenados, l => l.act);
  const rMes = p.mes_ant ? suma(ordenados, l => l.mes_ant) : null;
  const rCmp = comparable(ordenados);
  const rTotAnt = suma(ordenados, l => l.anio_ant_total);

  // Locales que no se comparan enteros contra el año pasado, para la nota
  const notas = (sel ? [sel] : ordenados).map(l => {
    if (!l.anio_ant) return `${shortName(l.nombre)} no tenía ventas en esas fechas de ${anioAnt}`;
    if (!l.anio_ant.completo) return `${shortName(l.nombre)} se compara desde el ${diaMes(l.anio_ant.desde)}, porque antes no hay ventas de ${anioAnt} cargadas`;
    return null;
  }).filter(Boolean);

  const ordenTabla = [...tiendasTodas].sort((a, b) => b.act.d - a.act.d);
  const mesesCurva = tiendasTodas[0]?.docenas_por_mes?.length || 0;
  const toggle = id => setAbiertas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4" style={{ opacity: loading ? 0.6 : 1 }}>
      {cabecera}

      {/* ── Tiendas ── */}
      {verTiendas && (
        <Bloque titulo={sel && !sel.es_cafe ? shortName(sel.nombre) : 'Tiendas de alfajores'}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Tarjeta tono="gris" titulo="Docenas" valor={fmtDoc(tAct.d)}
                     abajo={estimado(fmtDoc(proy(tAct.d)))}
                     explica="Cuántos alfajores salieron. No tiene inflación: es la medida de si vendemos más o menos.">
              {chipsT('d', true, fmtDoc)}
            </Tarjeta>
            <Tarjeta titulo="Facturación" valor={fmtARS(tAct.f)}
                     abajo={estimado(fmtARS(proy(tAct.f)))}
                     explica={'Cada renglón compara lo vendido de verdad en esos días, con el monto de entonces al lado. "+ inflación" lleva lo del año pasado a precios de hoy con la inflación del país; "+ nuestra suba", con lo que subimos nosotros: si igual da para abajo, vendimos menos cantidad.'}>
              {chipsT('f', false, fmtARS)}
              {tCmp && <SinPrecios a={tCmp.act.f} b={tCmp.ant.f} parcial={tCmp.parcial} inflacion={inf} suba={suba.tiendas?.pct} />}
            </Tarjeta>
            <Tarjeta titulo="Clientes" valor={fmtNum(tAct.tk)}
                     abajo={tAct.tk ? `${fmtDoc(tAct.d / tAct.tk)} docenas por compra` : ''}
                     explica="Cuántas compras hubo. Si bajan las docenas pero no los clientes, la gente lleva menos; si bajan los clientes, entra menos gente.">
              {chipsT('tk', false, fmtNum)}
            </Tarjeta>
          </div>

          {!sel && (
            <div className="card p-4 space-y-3">
              <div>
                <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Cada tienda</h3>
                <p className="text-xs text-stone-500">Ordenadas por docenas{mesesCurva > 1 ? ` · la línea son las docenas de enero a ${MES_LARGO[mesesCurva - 1]}` : ''} · tocá una fila para ver el detalle</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-stone-500 border-b border-stone-100">
                      <th className="text-left font-semibold py-1.5 px-2">Tienda</th>
                      <th className="text-right font-semibold py-1.5 px-2">Docenas</th>
                      {!anio && <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">vs {mesAntNombre}</th>}
                      <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">vs {anio ? anioAnt : `${MES_CORTO[partes(p.anio_ant.desde).m - 1]} ${String(anioAnt).slice(2)}`}</th>
                      <th className="text-right font-semibold py-1.5 px-2">Facturación</th>
                      <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">$ / docena</th>
                      <th className="text-right font-semibold py-1.5 px-2">{mesesCurva > 1 ? `Ene–${MES_CORTO[mesesCurva - 1]}` : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenTabla.map((l, i) => {
                      const abierta = abiertas.has(l.local_id);
                      const cmp = l.anio_ant;
                      const met = [
                        ['Docenas', 'd', fmtDoc], ['Facturación', 'f', fmtARS], ['Clientes', 'tk', fmtNum],
                        ['Docenas por compra', null, fmtDoc],
                      ];
                      const val = (o, k) => (k ? o[k] : (o.tk ? o.d / o.tk : 0));
                      return (
                        <Fragment key={l.local_id}>
                          <tr className="border-b border-stone-50 hover:bg-stone-50 cursor-pointer" tabIndex={0}
                              onClick={() => toggle(l.local_id)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(l.local_id); } }}>
                            <td className="py-2 px-2 whitespace-nowrap">
                              <span className={`inline-block text-stone-400 text-[11px] mr-1 transition-transform ${abierta ? 'rotate-90' : ''}`}>▸</span>
                              <span className="text-stone-400 font-semibold mr-1.5">{i + 1}</span>
                              <span className="inline-flex items-center gap-2 font-semibold">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorDeTienda(l.nombre) }} />
                                {shortName(l.nombre)}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtDoc(l.act.d)}</td>
                            {!anio && <td className="py-2 px-2 text-right"><Chip a={l.act.d} b={l.mes_ant?.d} texto="" /></td>}
                            <td className="py-2 px-2 text-right">{cmp ? <Chip a={cmp.act.d} b={cmp.ant.d} texto="" /> : <ChipGris>nueva</ChipGris>}</td>
                            <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{fmtARS(l.act.f)}</td>
                            <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{l.act.d ? fmtARS(l.act.f / l.act.d) : '—'}</td>
                            <td className="py-2 px-2"><Curva serie={l.docenas_por_mes} color={colorDeTienda(l.nombre)} /></td>
                          </tr>
                          {abierta && (
                            <tr className="bg-stone-50">
                              <td colSpan={anio ? 6 : 7} className="p-3">
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                                  {met.map(([titulo, k, fmt]) => (
                                    <div key={titulo} className="bg-white rounded-lg px-3 py-2 space-y-0.5">
                                      <p className="text-[10.5px] uppercase tracking-wide text-stone-500 font-semibold">{titulo}</p>
                                      <p className="font-bold tabular-nums">{fmt(val(l.act, k))}</p>
                                      {l.mes_ant && (
                                        <p className="text-[11px] text-stone-500">
                                          {txtMesAnt.replace(' vs ', '')}: {fmt(val(l.mes_ant, k))} <Chip a={val(l.act, k)} b={val(l.mes_ant, k)} texto="" />
                                        </p>
                                      )}
                                      <p className="text-[11px] text-stone-500">
                                        {cmp
                                          ? <>{anio ? `mismos días de ${anioAnt}` : txtAnioAnt.replace(' vs ', '')}{cmp.completo ? '' : ` (desde el ${diaMes(cmp.desde)})`}: {fmt(val(cmp.ant, k))} <Chip a={val(cmp.act, k)} b={val(cmp.ant, k)} texto="" /></>
                                          : 'no abría el año pasado'}
                                      </p>
                                    </div>
                                  ))}
                                  <div className="flex items-center">
                                    <Link
                                      to={`/ventas/listado?local_id=${l.local_id}&desde=${p.desde}&hasta=${p.hasta}`}
                                      className="btn-primary text-xs px-3 py-2"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      Ver tickets →
                                    </Link>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Bloque>
      )}

      {/* ── Café ── */}
      {verCafe && c && (
        <Bloque titulo="Café" cafe>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Tarjeta tono="cobre" titulo="Facturación" valor={fmtARS(c.act.f)}
                     abajo={estimado(fmtARS(proy(c.act.f)))}
                     explica="La medida principal del Café: no vende por docena.">
              {c.mes_ant && <Fila label={lblMes} a={c.act.f} b={c.mes_ant.f} fmt={fmtARS} oscuro />}
              {cParcial && <Fila label={`Total vendido, ${lblAnio.toLowerCase()}`} a={c.act.f} b={c.anio_ant_total.f} fmt={fmtARS} oscuro parcial />}
              {cCmp ? <Fila label={cParcial ? `Lo comparable, ${lblAnio.toLowerCase()}` : lblAnio} a={cCmp.act.f} b={cCmp.ant.f} fmt={fmtARS} oscuro parcial={cParcial} nota={cNota} /> : <FilaGris oscuro>Sin año pasado</FilaGris>}
              {cCmp && <SinPrecios a={cCmp.act.f} b={cCmp.ant.f} parcial={cParcial} inflacion={inf} suba={suba.cafe?.pct} oscuro />}
            </Tarjeta>
            <Tarjeta titulo="Personas" valor={c.act.p ? fmtNum(c.act.p) : 'sin dato'}
                     abajo={c.act.p && c.act.tk ? `${fmtNum(c.act.tk)} mesas · ${fmtDoc(c.act.p / c.act.tk)} personas por mesa` : ''}
                     explica="Cuánta gente atendió el Café, según los comensales que cargan los mozos en Fudo.">
              {c.mes_ant?.p > 0 && <Fila label={lblMes} a={c.act.p} b={c.mes_ant.p} fmt={fmtNum} />}
              {personasAnt ? <Fila label={cParcial ? `Lo comparable, ${lblAnio.toLowerCase()}` : lblAnio} a={cCmp.act.p} b={cCmp.ant.p} fmt={fmtNum} parcial={cParcial} nota={cNota} /> : <FilaGris>Sin personas cargadas del año pasado</FilaGris>}
            </Tarjeta>
            <Tarjeta titulo="Gasto por persona" valor={c.act.p ? fmtARS(c.act.f / c.act.p) : 'sin dato'}
                     explica="Cuánto deja cada persona que se sienta.">
              {c.mes_ant?.p > 0 && c.act.p > 0 && <Fila label={lblMes} a={c.act.f / c.act.p} b={c.mes_ant.f / c.mes_ant.p} fmt={fmtARS} />}
              {personasAnt && cCmp.act.p > 0 && (
                <>
                  <Fila label={lblAnio} a={cCmp.act.f / cCmp.act.p} b={cCmp.ant.f / cCmp.ant.p} fmt={fmtARS} parcial={cParcial} nota={cNota} />
                  <SinPrecios a={cCmp.act.f / cCmp.act.p} b={cCmp.ant.f / cCmp.ant.p} parcial={cParcial} inflacion={inf} suba={suba.cafe?.pct} />
                </>
              )}
            </Tarjeta>
          </div>
        </Bloque>
      )}

      {/* ── Toda la red ── */}
      {!sel && (
        <Bloque titulo="Toda la red">
          <div className="grid sm:grid-cols-2 gap-3">
            <Tarjeta tono="gris" titulo="Facturación de la red" valor={fmtARS(rAct.f)}
                     abajo={estimado(fmtARS(proy(rAct.f)))}
                     explica="Tiendas y Café juntos.">
              {rMes && <Fila label={lblMes} a={rAct.f} b={rMes.f} fmt={fmtARS} oscuro />}
              {rCmp?.parcial && <Fila label={`Total vendido, ${lblAnio.toLowerCase()}`} a={rAct.f} b={rTotAnt.f} fmt={fmtARS} oscuro parcial />}
              {rCmp && <Fila label={rCmp.parcial ? `Lo comparable, ${lblAnio.toLowerCase()}` : lblAnio} a={rCmp.act.f} b={rCmp.ant.f} fmt={fmtARS} oscuro parcial={rCmp.parcial} nota={rCmp.nota} />}
              {rCmp && <SinPrecios a={rCmp.act.f} b={rCmp.ant.f} parcial={rCmp.parcial} inflacion={inf} suba={suba.red?.pct} oscuro />}
            </Tarjeta>
            <Tarjeta titulo="Tickets" valor={fmtNum(rAct.tk)} abajo={rAct.tk ? `Ticket promedio ${fmtARS(rAct.f / rAct.tk)}` : ''}
                     explica="Compras en las tiendas más mesas del Café.">
              {rMes && <Fila label={lblMes} a={rAct.tk} b={rMes.tk} fmt={fmtNum} />}
              {rCmp?.parcial && <Fila label={`Total vendido, ${lblAnio.toLowerCase()}`} a={rAct.tk} b={rTotAnt.tk} fmt={fmtNum} parcial />}
              {rCmp && <Fila label={rCmp.parcial ? `Lo comparable, ${lblAnio.toLowerCase()}` : lblAnio} a={rCmp.act.tk} b={rCmp.ant.tk} fmt={fmtNum} parcial={rCmp.parcial} nota={rCmp.nota} />}
            </Tarjeta>
          </div>
        </Bloque>
      )}

      <div className="text-xs text-stone-500 px-1 space-y-1">
        {notas.length > 0 && <p>Contra {anioAnt} cada local se compara en los mismos días: {notas.join('; ')}.</p>}
        <p>
          <Inflacion inflacion={data.inflacion} puedeEditar={esDueno(user)}
                     onGuardado={inflacion => setData(d => ({ ...d, inflacion }))} />
          {' '}"+ nuestra suba" usa lo que subieron los productos que hacen el 80 % de la venta
          {anio ? ' (precio promedio del año contra el mismo período del año pasado)' : ' (precio más cobrado en estos días contra los mismos días del año pasado)'}
          {suba.tiendas ? `: tiendas ${pct1(suba.tiendas.pct)} %` : ''}{suba.cafe ? `, Café ${pct1(suba.cafe.pct)} %` : ''}.
          {' '}El "estimado" es una regla de tres con los días que van; los porcentajes nunca lo usan: comparan solo lo ya vendido.
        </p>
      </div>
    </div>
  );
}
