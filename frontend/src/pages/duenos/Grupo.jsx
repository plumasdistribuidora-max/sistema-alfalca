import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { Cargando, MensajeError } from '../tareas/comunes';
import { NEG_COLOR, Aviso, pesos, pct, sumarMes } from './comun';

// Dueños → Números del grupo (3/11/2026). El estado de resultados de cada negocio traducido
// a las mismas líneas, para poder verlos juntos y sumarlos en la columna Grupo. Para comparar
// negocios tan distintos se mira el % sobre la venta, no los pesos. Cada columna lleva al
// estado de resultados completo de ese negocio.
const LINEAS = [
  { f: 'venta_neta',      n: 'Venta neta' },
  { f: 'costo',           n: 'Costo de lo vendido', menos: true },
  { f: 'margen_bruto',    n: 'Margen bruto', cls: 'font-bold' },
  { f: 'gastos',          n: 'Gastos', menos: true, cierre: true },
  { f: 'antes_impuestos', n: 'Resultado antes de impuestos', cls: 'font-bold', cierre: true },
  { f: 'impuestos',       n: 'Impuestos', menos: true, cierre: true },
  { f: 'ganancia',        n: 'Ganancia del mes', cls: 'font-extrabold text-[15px] border-b-2 border-ahg-text', cierre: true },
  { f: 'extra',           n: 'Extraordinarios', cierre: true, vacio: true },
  { f: 'total',           n: 'Ganancia con extraordinarios', cls: 'font-bold', cierre: true },
];
const DESTINO = { entre_dos: '/finanzas', kankay: '/marcas/kankay', senzen: '/marcas/senzen' };
const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : '');
const conSigno = v => (v < 0 ? `−${pesos(-v)}` : pesos(v));

export default function Grupo() {
  const [mes, setMes] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [porLocal, setPorLocal] = useState(false);

  function cargar(m) {
    setD(null);
    api.get('/duenos/grupo', { params: m ? { mes: m } : {} })
      .then(r => { setD(r.data.data); setMes(r.data.data.mes); setError(''); })
      .catch(e => setError(e.response?.data?.error || 'No se pudieron cargar los números'));
  }
  useEffect(() => cargar(), []);

  if (error) return <MensajeError texto={error} />;
  if (!d) return <Cargando />;

  const { nums } = d;
  const locales = d.unidades.filter(u => u.local);
  const col = (k, nombre, negocio, extra = {}) => ({ k, nombre, negocio, x: nums[k], ...extra });
  const cols = [
    col('grupo', 'Grupo', null, { grupo: true }),
    ...(porLocal ? locales.map(u => col(u.k, u.nombre, 'entre_dos', { local: true })) : []),
    col('entre_dos', porLocal ? 'Entre Dos total' : 'Entre Dos', 'entre_dos'),
    col('kankay', 'Kankay', 'kankay'),
    col('senzen', 'Senzen', 'senzen'),
  ];
  const faltan = nums.grupo.faltan || [];
  const fondoGrupo = 'bg-[#9aa08a]/15';

  return (
    <div className="space-y-5 max-w-[1280px]">
      <div className="rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ background: '#55585c' }}>
        <div className="flex items-center gap-2.5">
          <button type="button" aria-label="Mes anterior" onClick={() => cargar(sumarMes(mes, -1))}
                  className="w-8 h-8 rounded-lg border border-white/25 bg-white/10 text-white text-lg">‹</button>
          <div className="min-w-[150px] text-center">
            <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>Números del grupo · {mes.slice(0, 4)}</p>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{cap(d.nombre_mes)}</h1>
          </div>
          <button type="button" aria-label="Mes siguiente" onClick={() => cargar(sumarMes(mes, 1))}
                  className="w-8 h-8 rounded-lg border border-white/25 bg-white/10 text-white text-lg">›</button>
          {d.en_curso && <span className="text-xs text-white bg-white/15 rounded-full px-2.5 py-1">El mes todavía no terminó</span>}
        </div>
        <div className="inline-flex bg-white/10 rounded-[10px] p-[3px] gap-0.5" role="group" aria-label="Detalle">
          {[[false, 'Por negocio'], [true, 'Abrir Entre Dos por local']].map(([v, l]) => (
            <button key={l} type="button" aria-pressed={porLocal === v} onClick={() => setPorLocal(v)}
                    className={`rounded-lg px-3 py-1.5 text-[13px] ${porLocal === v ? 'bg-white text-ahg-text font-semibold' : 'text-white/75 hover:text-white'}`}>{l}</button>
          ))}
        </div>
      </div>

      {faltan.length > 0 && (
        <Aviso tono="ambar">
          Faltan los gastos de <b>{faltan.join(', ')}</b>. Hasta que estén, esas columnas dicen “Sin cerrar” y el Grupo muestra solo la venta y el margen.
        </Aviso>
      )}

      <section className="card p-4 sm:p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white" />
                {cols.map(c => (
                  <th key={c.k} className={`px-3 pb-2 text-right align-bottom whitespace-nowrap border-b-2 border-ahg-text ${c.grupo ? fondoGrupo : ''}`}
                      style={{ fontFamily: 'Nunito, sans-serif' }}>
                    {c.grupo ? 'Grupo' : (
                      <Link to={DESTINO[c.negocio]} className="hover:underline inline-flex items-center gap-1.5" title={`Ver el estado de resultados de ${c.nombre}`}>
                        {!c.local && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: NEG_COLOR[c.negocio] }} />}
                        <span className={c.local ? 'font-semibold text-ahg-text/70' : ''}>{c.nombre}</span>
                      </Link>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINEAS.map(L => (
                <tr key={L.f} className={L.cls || ''}>
                  <td className="sticky left-0 bg-white py-2 pr-3 text-left whitespace-nowrap border-b border-ahg-accent/50">{L.n}</td>
                  {cols.map(c => {
                    const x = c.x;
                    const base = `px-3 py-2 text-right whitespace-nowrap border-b border-ahg-accent/50 ${c.grupo ? fondoGrupo : ''}`;
                    if (L.cierre && !x.cerrado) {
                      return <td key={c.k} className={`${base} text-ahg-text/40 font-normal`}>{L.f === 'gastos' ? <span className="text-xs italic">Sin cerrar</span> : '—'}</td>;
                    }
                    if (L.vacio && !x[L.f]) return <td key={c.k} className={`${base} text-ahg-text/40 font-normal`}>—</td>;
                    const v = L.menos ? -x[L.f] : x[L.f];
                    const rojo = v < 0 && !L.menos;
                    return (
                      <td key={c.k} className={base}>
                        <span className={rojo ? 'text-red-700' : ''}>{conSigno(v)}</span>
                        <span className="block text-xs font-medium text-ahg-text/50">
                          {L.f === 'venta_neta' ? '100 %' : pct(x.venta_neta > 0 ? Math.round(x[L.f] / x.venta_neta * 1000) / 10 : null)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ahg-text/55 mt-3">
          El número chico es el % sobre la venta neta: para comparar negocios tan distintos se mira ese %, no los pesos.
          Tocando el nombre de un negocio vas a su estado de resultados completo.
        </p>
      </section>

      <details className="card p-4 sm:p-5 text-sm">
        <summary className="font-bold cursor-pointer" style={{ fontFamily: 'Nunito, sans-serif' }}>Qué entra en cada línea</summary>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left">
                {['Línea', 'Tiendas Entre Dos', 'Café', 'Kankay', 'Senzen'].map(h => <th key={h} className="py-1.5 pr-3 border-b border-ahg-text/30 align-bottom">{h}</th>)}
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ['Venta neta', 'Fudo, sin IVA lo facturado', 'Fudo, sin IVA lo facturado', 'Excel de Dux, sin IVA', 'Facturas de Dux, sucursal Senzen'],
                ['Costo de lo vendido', '45 % Entre Dos y 70 % Alimendos', '% de cada rubro', 'Costo de cada producto (Dux)', 'Costo de cada producto (Dux)'],
                ['Gastos', 'Gastos cargados, fee de marca y marketing, tarjetas', 'Gastos cargados y tarjetas', 'Gastos cargados y comisión de tarjetas', 'Gastos cargados'],
                ['Impuestos', 'IIBB, 931 y Ganancias', 'IIBB e impuestos generales', 'IIBB y 931', 'Todavía no tiene'],
                ['Extraordinarios', '—', '—', 'Nota de crédito', '—'],
              ].map(r => (
                <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`py-1.5 pr-3 border-b border-ahg-accent/40 ${i === 0 ? 'font-semibold whitespace-nowrap' : ''}`}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ahg-text/55 mt-2">Un negocio está cerrado cuando tiene los gastos del mes cargados. Lo extraordinario va aparte para que no tape cómo anduvo el mes.</p>
      </details>
    </div>
  );
}
