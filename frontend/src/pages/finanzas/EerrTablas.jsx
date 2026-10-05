import { useEffect, useState } from 'react';
import api from '../../api';
import { fmtARS, fmtPct, shortName } from '../red/redUtils';

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
  { key: 'venta_neta',     label: 'Venta neta' },
  { key: 'cmv',            label: 'CMV' },
  { key: 'margen_bruto',   label: 'Margen bruto',      fuerte: true },
  { key: 'gastos',         label: 'Gastos operativos', falta: c => !c.gastos_cargados },
  { key: 'ebitda',         label: 'EBITDA',            fuerte: true, incompleto: c => !c.gastos_cargados },
  { key: 'impuestos',      label: 'Impuestos',         falta: c => !c.impuestos_cargados },
  { key: 'resultado_neto', label: 'Resultado neto',    final: true, incompleto: c => !c.gastos_cargados || !c.impuestos_cargados },
];

function sumar(cols) {
  const t = { gastos_cargados: cols.every(c => c.gastos_cargados), impuestos_cargados: cols.every(c => c.impuestos_cargados) };
  for (const f of FILAS) t[f.key] = cols.reduce((s, c) => s + (Number(c[f.key]) || 0), 0);
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
  return (
    <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${fin}`}>
      <span className={fila.fuerte || fila.final ? 'font-bold' : 'font-medium'}>{fmt$(v)}</span>
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
                {c.nota && <span className="block normal-case tracking-normal text-[10px] font-semibold text-amber-600">{c.nota}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS.map(f => (
            <tr key={f.key} className={`border-b border-stone-50 last:border-0 ${f.fuerte ? 'bg-stone-50/60' : ''}`}>
              <td className={`sticky left-0 px-3 py-2 whitespace-nowrap ${f.final ? 'bg-stone-700 text-white font-bold' : `bg-white ${f.fuerte ? 'font-bold text-stone-900' : 'text-stone-600'}`}`}>
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
    setData(null);
    api.get('/red/eerr/red', { params: { mes } }).then(r => setData(r.data.data)).catch(console.error);
  }, [mes]);
  if (!data) return <Cargando />;

  const tiendas = data.locales.filter(l => l.es_alfajorera);
  const otros   = data.locales.filter(l => !l.es_alfajorera);
  const col = l => ({ id: l.id, titulo: shortName(l.nombre), datos: l, onClick: () => onAbrirLocal(l.id) });
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

export function EerrMeses({ localId, hasta }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!localId) return;
    setData(null);
    api.get('/red/eerr/meses', { params: { local_id: localId, hasta, cant: 6 } }).then(r => setData(r.data.data)).catch(console.error);
  }, [localId, hasta]);
  if (!data) return <Cargando />;

  const columnas = data.meses.map(m => {
    const [y, mm] = m.mes.split('-');
    const curso = mesEnCurso(m.mes);
    return {
      id: m.mes,
      titulo: `${MESES_CORTOS[Number(mm) - 1]} ${y.slice(2)}`,
      nota: curso ? `en curso · ${curso.dia} de ${curso.dias} días` : null,
      datos: m,
    };
  });
  return (
    <div className="space-y-3">
      <Avisos cols={columnas} />
      <Tabla columnas={columnas} />
    </div>
  );
}
