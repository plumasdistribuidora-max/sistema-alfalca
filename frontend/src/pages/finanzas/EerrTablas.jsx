import { useEffect, useState } from 'react';
import api from '../../api';
import { fmtARS, fmtPct, shortName } from '../red/redUtils';
import { pdfEerr } from './pdfEerr';

// Tablas de varias columnas del EERR: toda la red en un mes, o un local mes a mes.
// Cuando a una columna le faltan gastos o impuestos, el EBITDA y el resultado no se
// muestran: un número sin gastos parece ganancia y no lo es.

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const fmt$ = v => fmtARS(Math.round(Number(v) || 0));

// Venta neta: lo que se vendió sin factura entra completo; lo facturado, dividido por 1,21.
export function FiscalDesglose({ df }) {
  if (!df) return null;
  const { bruto_no_fiscal, bruto_fiscal, neto_fiscal, iva_descontado, pct_fiscal_sobre_total, tiene_fiscal } = df;
  return (
    <div className="mt-4 pt-4 border-t border-stone-100">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">Con y sin factura</p>
      <div className="rounded-xl border border-stone-100 overflow-hidden text-sm">
        <div className="grid grid-cols-3 px-4 py-2 bg-stone-50 text-xs text-stone-400 font-semibold">
          <span>Tipo</span>
          <span className="text-right">Vendido</span>
          <span className="text-right">Neto</span>
        </div>
        <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-stone-50">
          <div>
            <span className="font-medium text-stone-700">Sin factura</span>
            <span className="ml-1.5 text-xs text-stone-400">entra completo</span>
          </div>
          <span className="text-right text-stone-600">{fmt$(bruto_no_fiscal)}</span>
          <span className="text-right font-semibold text-stone-900">{fmt$(bruto_no_fiscal)}</span>
        </div>
        <div className="grid grid-cols-3 items-center px-4 py-3">
          <div>
            <span className="font-medium text-stone-700">Con factura</span>
            <span className="ml-1.5 text-xs text-stone-400">÷ 1,21</span>
          </div>
          <span className={`text-right ${tiene_fiscal ? 'text-stone-400 line-through' : 'text-stone-600'}`}>{fmt$(bruto_fiscal)}</span>
          <span className="text-right font-semibold text-stone-900">{fmt$(neto_fiscal)}</span>
        </div>
      </div>
      {tiene_fiscal && (
        <div className="mt-2.5 space-y-1.5 px-1">
          <div className="flex justify-between text-xs">
            <span className="text-stone-500">Facturado sobre la venta neta</span>
            <span className="font-semibold text-stone-700">{fmtPct(pct_fiscal_sobre_total)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-stone-500">IVA descontado</span>
            <span className="font-semibold text-red-500">−{fmt$(iva_descontado)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function mesEnCurso(yyyymm) {
  const hoy = new Date();
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  if (yyyymm !== actual) return null;
  const dias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return { dia: hoy.getDate(), dias };
}

const FILAS = [
  { key: 'venta_bruta',    label: 'Venta bruta' },
  { key: 'con_factura',    label: 'Con factura',  det: true },
  { key: 'sin_factura',    label: 'Sin factura',  det: true },
  { key: 'iva',            label: 'IVA de lo facturado (÷ 1,21)', resta: true },
  { key: 'venta_neta',     label: 'Venta neta',   fuerte: true },
  { key: 'cmv',            label: 'CMV' },
  { key: 'margen_bruto',   label: 'Margen bruto',      fuerte: true },
  { key: 'fees',           label: 'Fees de la marca', opcional: true },
  { key: 'tarjetas',       label: 'Costo de tarjetas', opcional: true },
  { key: 'gastos',         label: 'Gastos operativos', falta: c => !c.gastos_cargados },
  { key: 'ebitda',         label: 'EBITDA',            fuerte: true, incompleto: c => !c.gastos_cargados },
  { key: 'otros',          label: 'Amortizaciones y otros', opcional: true },
  { key: 'impuestos',      label: 'Impuestos',         falta: c => !c.impuestos_cargados },
  { key: 'resultado_neto', label: 'Resultado neto',    final: true, incompleto: c => !c.gastos_cargados || !c.impuestos_cargados },
];

// Un renglón que falta en alguna columna (la venta bruta de un mes de planilla) no se suma:
// el total quedaría a medias.
function sumar(cols) {
  const t = { gastos_cargados: cols.every(c => c.gastos_cargados), impuestos_cargados: cols.every(c => c.impuestos_cargados) };
  for (const f of FILAS) t[f.key] = cols.some(c => c[f.key] == null && !f.opcional) ? null : cols.reduce((s, c) => s + (Number(c[f.key]) || 0), 0);
  return t;
}

function Celda({ fila, col, total }) {
  const base = total ? 'bg-stone-50' : '';
  const fin  = fila.final ? 'bg-stone-700 text-white' : base;
  if (fila.falta?.(col)) {
    return <td className={`px-3 py-2 text-right text-xs font-semibold text-amber-600 ${base}`}>Sin cargar</td>;
  }
  if (fila.incompleto?.(col)) {
    return <td className={`px-3 py-2 text-right text-xs ${fila.final ? 'bg-stone-700 text-white/60' : `text-stone-400 ${base}`}`}>Incompleto</td>;
  }
  const v = col[fila.key];
  if (v == null) return <td className={`px-3 py-2 text-right text-stone-300 ${base}`}>—</td>;
  return (
    <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${fin}`}>
      <span className={fila.fuerte || fila.final ? 'font-bold' : fila.det ? 'text-stone-500' : 'font-medium'}>{fila.resta && v ? `− ${fmt$(v)}` : fmt$(v)}</span>
      {fila.key !== 'venta_neta' && (
        <span className={`block text-[11px] ${fila.final ? 'text-white/60' : 'text-stone-400'}`}>
          {fmtPct(col.venta_neta > 0 ? Math.round(v / col.venta_neta * 1000) / 10 : 0)}
        </span>
      )}
    </td>
  );
}

function Tabla({ columnas }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm" style={{ minWidth: 120 + columnas.length * 130 }}>
        <thead>
          <tr className="border-b border-stone-100">
            <th className="sticky left-0 bg-white" />
            {columnas.map(c => (
              <th key={c.id} className={`px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide ${c.total ? 'bg-stone-50 text-stone-700' : 'text-stone-400'}`}>
                {c.onClick
                  ? <button onClick={c.onClick} className="uppercase hover:text-stone-800 underline decoration-dotted underline-offset-4">{c.titulo}</button>
                  : c.titulo}
                {c.nota && <span className={`block normal-case tracking-normal text-[10px] font-semibold ${c.nota === 'planilla' ? 'text-stone-400' : 'text-amber-600'}`}>{c.nota}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS.filter(f => !f.opcional || columnas.some(c => Number(c.datos[f.key]))).map(f => (
            <tr key={f.key} className={`border-b border-stone-50 last:border-0 ${f.fuerte ? 'bg-stone-50/60' : ''}`}>
              <td className={`sticky left-0 px-3 py-2 whitespace-nowrap ${f.det ? 'pl-7 text-[13px]' : ''} ${f.final ? 'bg-stone-700 text-white font-bold' : `bg-white ${f.fuerte ? 'font-bold text-stone-900' : f.det ? 'text-stone-400' : 'text-stone-600'}`}`}>
                {f.label}
              </td>
              {columnas.map(c => <Celda key={c.id} fila={f} col={c.datos} total={c.total} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Avisos({ cols }) {
  const sinGastos = cols.filter(c => !c.datos.gastos_cargados && !c.total).map(c => c.titulo);
  const sinImp    = cols.filter(c => !c.datos.impuestos_cargados && !c.total).map(c => c.titulo);
  const sinPct    = [...new Set(cols.flatMap(c => c.datos.rubros_sin_pct || []))];
  if (!sinGastos.length && !sinImp.length && !sinPct.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-1">
      {sinGastos.length > 0 && <p><strong>Faltan gastos:</strong> {sinGastos.join(', ')}. El EBITDA y el resultado quedan incompletos.</p>}
      {sinImp.length > 0 && <p><strong>Faltan impuestos:</strong> {sinImp.join(', ')}.</p>}
      {sinPct.length > 0 && <p><strong>Rubros del Café sin % de CMV:</strong> {sinPct.join(', ')}. Cuentan $ 0 de costo.</p>}
    </div>
  );
}

function Cargando() {
  return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-stone-100 rounded-2xl animate-pulse" />)}</div>;
}

export function EerrRed({ mes, onAbrirLocal }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let vigente = true;
    setData(null);
    api.get('/red/eerr/red', { params: { mes } }).then(r => { if (vigente) setData(r.data.data); }).catch(console.error);
    return () => { vigente = false; };
  }, [mes]);
  if (!data) return <Cargando />;

  const tiendas = data.locales.filter(l => l.es_alfajorera);
  const otros   = data.locales.filter(l => !l.es_alfajorera);
  const col = l => ({ id: l.id, titulo: shortName(l.nombre), datos: l, nota: l.historico ? 'planilla' : null, onClick: () => onAbrirLocal(l.id) });
  const columnas = [
    ...tiendas.map(col),
    { id: 'tiendas', titulo: 'Tiendas', datos: sumar(tiendas), total: true },
    ...otros.map(col),
    { id: 'red', titulo: 'Red', datos: { ...sumar(data.locales), rubros_sin_pct: [] }, total: true },
  ];
  return (
    <div className="space-y-3">
      <Avisos cols={columnas} />
      <Tabla columnas={columnas} />
    </div>
  );
}

export function EerrAnio({ localId, anio }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!localId) return;
    let vigente = true;
    setData(null);
    api.get('/red/eerr/anio', { params: { local_id: localId, anio } }).then(r => { if (vigente) setData(r.data.data); }).catch(console.error);
    return () => { vigente = false; };
  }, [localId, anio]);
  if (!data) return <Cargando />;
  if (!data.meses.length) return <div className="card p-8 text-center text-stone-400">Todavía no hay meses de {anio}.</div>;

  const columnas = data.meses.map(m => {
    const curso = mesEnCurso(m.mes);
    return {
      id: m.mes,
      titulo: MESES_CORTOS[Number(m.mes.slice(5)) - 1],
      nota: curso ? `en curso · ${curso.dia} de ${curso.dias} días` : m.historico ? 'planilla' : null,
      datos: m,
    };
  });
  columnas.push({ id: 'total', titulo: `Total ${anio}`, datos: { ...sumar(data.meses), rubros_sin_pct: [] }, total: true });
  return (
    <div className="space-y-3">
      <Avisos cols={columnas} />
      <Tabla columnas={columnas} />
    </div>
  );
}

// ── Estado de resultados de un local: una tabla de contador ───────────────────
// Cada fila: { tipo: 'grp'|'det'|'sub'|'fin', label, actual, costo, onEditar,
// sinCargar, incompleto }. Los costos van en positivo con costo: true y se muestran restando.

export function EstadoResultados({ filas, ventaNeta, mesLabel, local, aviso }) {
  const monto = (f, v) => (f.costo && v ? `− ${fmt$(v)}` : fmt$(v));
  return (
    <div className="space-y-3">
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm" style={{ minWidth: 420 }}>
        <thead>
          <tr className="border-b border-stone-200 text-[10.5px] uppercase tracking-wider text-stone-400">
            <th className="text-left px-4 py-2.5 font-bold" />
            <th className="text-right px-4 py-2.5 font-bold">{mesLabel}</th>
            <th className="text-right px-4 py-2.5 font-bold">% venta</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const cls = {
              grp: 'font-semibold text-stone-900',
              det: 'text-stone-500 text-[13px]',
              sub: 'font-bold text-stone-900 bg-stone-50 border-t border-stone-800',
              fin: 'font-extrabold text-white text-[14.5px]',
            }[f.tipo];
            const pad = f.tipo === 'grp' ? 'pt-3 pb-1.5' : 'py-1.5';
            const fin = f.tipo === 'fin';
            const vacio = f.sinCargar ? 'Sin cargar' : f.incompleto ? 'Incompleto' : null;
            return (
              <tr key={i} className={cls} style={fin ? { background: '#45484c' } : undefined}>
                <td className={`px-4 ${pad} text-left ${f.tipo === 'det' ? 'pl-9' : ''}`}>
                  {f.label}
                  {f.onEditar && (
                    <button
                      onClick={f.onEditar}
                      className="ml-3 text-[11.5px] font-semibold text-stone-500 hover:text-stone-900 underline decoration-dotted underline-offset-4"
                    >
                      {f.accion || (f.sinCargar ? 'Cargar' : 'Editar')}
                    </button>
                  )}
                </td>
                {vacio ? (
                  <td colSpan={2} className={`px-4 ${pad} text-right text-xs font-semibold ${f.sinCargar ? 'text-amber-600' : fin ? 'text-white/60' : 'text-stone-400'}`}>
                    {vacio}
                  </td>
                ) : (
                  <>
                    <td className={`px-4 ${pad} text-right tabular-nums whitespace-nowrap`}>{monto(f, f.actual)}</td>
                    <td className={`px-4 ${pad} text-right tabular-nums text-xs ${fin ? 'text-white/60' : 'text-stone-400'}`}>
                      {fmtPct(ventaNeta > 0 ? Math.round(f.actual / ventaNeta * 1000) / 10 : 0)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {local && (
      <div className="flex justify-end">
        <button
          onClick={() => pdfEerr({ filas, ventaNeta, local, mesLabel, aviso })}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#45484c' }}
        >
          Descargar PDF
        </button>
      </div>
    )}
    </div>
  );
}

// Arriba de la venta neta: lo vendido con y sin factura, y el IVA que se le saca a lo facturado.
export function filasVentaBruta(df) {
  if (!df) return [];
  return [
    { tipo: 'grp', label: 'Venta bruta', actual: df.bruto_fiscal + df.bruto_no_fiscal },
    { tipo: 'det', label: 'Con factura', actual: df.bruto_fiscal },
    { tipo: 'det', label: 'Sin factura', actual: df.bruto_no_fiscal },
    { tipo: 'grp', label: 'IVA de lo facturado (÷ 1,21)', actual: df.iva_descontado, costo: true },
  ];
}

// Un mes de planilla (anterior a 2026), tal cual vino del Excel.
export function filasHistorico(h) {
  const sum = a => (a || []).reduce((s, x) => s + x.monto, 0);
  const otros = h.otros || [];
  return [
    { tipo: 'sub', label: 'Venta neta', actual: sum(h.ventas) },
    ...h.ventas.map(v => ({ tipo: 'det', label: v.nombre, actual: v.monto })),
    { tipo: 'grp', label: 'Costo de mercadería', actual: sum(h.cmv), costo: true },
    ...h.cmv.map(c => ({ tipo: 'det', label: c.pct ? `${c.nombre} · ${c.pct}%` : c.nombre, actual: c.monto, costo: true })),
    { tipo: 'sub', label: 'Margen bruto', actual: h.margen_bruto },
    { tipo: 'grp', label: 'Gastos operativos', actual: h.gastos_total, costo: true },
    ...h.gastos.map(g => ({ tipo: 'det', label: g.nombre, actual: g.monto, costo: true })),
    { tipo: 'sub', label: 'EBITDA', actual: h.ebitda },
    ...otros.map(o => ({ tipo: 'grp', label: o.nombre, actual: Math.abs(o.monto), costo: o.monto < 0 })),
    ...(otros.length ? [{ tipo: 'sub', label: 'Resultado antes de impuestos', actual: h.ebt }] : []),
    { tipo: 'grp', label: 'Impuestos', actual: sum(h.impuestos), costo: true },
    ...h.impuestos.map(t => ({ tipo: 'det', label: t.pct ? `${t.nombre} · ${t.pct}%` : t.nombre, actual: t.monto, costo: true })),
    { tipo: 'fin', label: 'Resultado neto', actual: h.resultado },
  ];
}

export function AvisoPlanilla({ fuente }) {
  return (
    <div className="bg-stone-100 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600">
      <strong className="text-stone-800">Mes de planilla:</strong> estos números están tal cual en la planilla de Excel, no se recalculan ni se editan acá.
      {fuente && <span className="block text-xs text-stone-400 mt-0.5">{fuente}</span>}
    </div>
  );
}

// Editar el % del costo de tarjetas de un local en un mes.
export function EditarTarjeta({ localId, mes, mesLabel, pct, ventaBruta, onClose, onSaved }) {
  const [valor, setValor] = useState(String(pct));
  const [guardando, setGuardando] = useState(false);
  const monto = ventaBruta * (parseFloat(valor) || 0) / 100;

  async function guardar() {
    setGuardando(true);
    try {
      await api.post('/red/eerr/tarjeta', { local_id: localId, mes, tarjeta_pct: parseFloat(valor) || 0 });
      onSaved();
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el costo de tarjetas.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-stone-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Costo de tarjetas · {mesLabel}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3 text-sm">
          <p className="text-stone-500">Es un % de toda la venta bruta del mes: <strong className="text-stone-800">{fmt$(ventaBruta)}</strong>.</p>
          <div className="flex items-center justify-between rounded-xl border border-stone-100 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="0" max="100" step="0.1" value={valor}
                onChange={e => setValor(e.target.value)}
                className="w-20 text-right rounded-lg border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <span className="text-stone-400">%</span>
            </div>
            <span className="font-bold text-stone-800">{fmt$(monto)}</span>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-stone-100">
          <button onClick={guardar} disabled={guardando} className="w-full py-2.5 rounded-xl font-semibold text-white disabled:opacity-50" style={{ background: '#45484c' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
