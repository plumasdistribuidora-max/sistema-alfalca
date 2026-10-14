import { useState, useEffect, Fragment } from 'react';
import api from '../../api';
import { plata, Tile, ChipMedio, Selector, fechaCorta, hoyStr, sumarDias, medioLabel, VerFoto } from './comunes';
import { pdfPagadoDelDia } from './pdfPagos';

// El registro de lo que se pagó: con qué, cuándo y quién lo anotó. Un pago mal
// anotado se borra y se vuelve a cargar; no se edita, así queda el rastro limpio.
// Lo que se le pagó a un proveedor en un mismo día va en un solo renglón con el
// total (Martín, 14/10/2026); tocándolo se abre factura por factura.

function primeroDelMes(iso, corrimiento = 0) {
  const [a, m] = iso.split('-').map(Number);
  const d = new Date(a, m - 1 + corrimiento, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function rangoDe(atajo) {
  const hoy = hoyStr();
  if (atajo === '30')   return { desde: sumarDias(hoy, -30), hasta: hoy };
  if (atajo === 'mes')  return { desde: primeroDelMes(hoy), hasta: hoy };
  if (atajo === 'ant')  return { desde: primeroDelMes(hoy, -1), hasta: sumarDias(primeroDelMes(hoy), -1) };
  return { desde: '', hasta: '' };
}

const ATAJOS = [
  { id: '30',    label: 'Últimos 30 días' },
  { id: 'mes',   label: 'Este mes' },
  { id: 'ant',   label: 'Mes pasado' },
  { id: 'todo',  label: 'Todo' },
];

// Hay pagos desde 2025: a los de otro año se les agrega el año para no confundirlos.
const fechaPago = iso => (!iso ? '—' : iso.slice(0, 4) === hoyStr().slice(0, 4) ? fechaCorta(iso) : `${fechaCorta(iso)}/${iso.slice(2, 4)}`);

export const FILTRO_PAGOS_INICIAL = { atajo: '30', ...rangoDe('30'), proveedor: '' };

export default function PagosSection({ proveedores = [], filtro, setFiltro, onCambio }) {
  const [pagos, setPagos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abiertos, setAbiertos] = useState(() => new Set());

  // Si se cambian dos filtros seguidos, la respuesta vieja puede llegar después
  // de la nueva: se descarta para que no pise lo que se está mirando.
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    api.get('/proveedores/pagos', {
      params: {
        desde: filtro.desde || undefined,
        hasta: filtro.hasta || undefined,
        proveedor_id: filtro.proveedor || undefined,
      },
    })
      .then(r => { if (vigente) { setPagos(r.data.data); setError(''); } })
      .catch(err => { if (vigente) setError(err.response?.data?.error || 'No se pudieron traer los pagos'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtro.desde, filtro.hasta, filtro.proveedor]);

  async function borrar(id) {
    if (!confirm('¿Borrar este pago? La factura vuelve a quedar con ese saldo pendiente.')) return;
    try {
      await api.delete(`/proveedores/pagos/${id}`);
      onCambio?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar el pago');
    }
  }

  function elegirAtajo(id) { setFiltro(f => ({ ...f, atajo: id, ...rangoDe(id) })); }
  function cambiarFecha(campo, v) { setFiltro(f => ({ ...f, atajo: '', [campo]: v })); }
  function abrir(clave) {
    setAbiertos(s => { const n = new Set(s); n.has(clave) ? n.delete(clave) : n.add(clave); return n; });
  }

  // Un grupo por proveedor y día, del día más nuevo al más viejo.
  const porClave = new Map();
  pagos.forEach(p => {
    const clave = `${p.fecha}|${p.proveedor}`;
    if (!porClave.has(clave)) porClave.set(clave, { clave, fecha: p.fecha, proveedor: p.proveedor, pagos: [] });
    porClave.get(clave).pagos.push(p);
  });
  const grupos = [...porClave.values()].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || a.proveedor.localeCompare(b.proveedor));
  grupos.forEach(g => {
    g.total = g.pagos.reduce((s, p) => s + p.monto, 0);
    g.medios = [...new Set(g.pagos.map(p => p.medio))];
  });

  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const porMedio = {};
  pagos.forEach(p => { porMedio[p.medio] = (porMedio[p.medio] || 0) + p.monto; });
  const top = Object.entries(porMedio).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const cuantosProv = new Set(pagos.map(p => p.proveedor)).size;
  // Sin fechas el servidor corta en los últimos 300 pagos: si llegó al tope, se avisa.
  const cortado = !filtro.desde && !filtro.hasta && pagos.length >= 300;
  const periodo = !filtro.desde && !filtro.hasta ? 'en total' : 'en el período';
  const hoy = hoyStr();

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        <Selector opciones={ATAJOS} valor={filtro.atajo} onChange={elegirAtajo} />
        <label className="flex items-center gap-1.5 text-sm text-ahg-text/60">
          Desde
          <input type="date" className="input w-auto text-sm" value={filtro.desde}
                 onChange={e => cambiarFecha('desde', e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ahg-text/60">
          hasta
          <input type="date" className="input w-auto text-sm" value={filtro.hasta}
                 onChange={e => cambiarFecha('hasta', e.target.value)} />
        </label>
        <select className="input w-auto text-sm" value={filtro.proveedor}
                onChange={e => setFiltro(f => ({ ...f, proveedor: e.target.value }))}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          titulo={cortado ? 'Pagado (últimos 300 pagos)' : `Pagado ${periodo}`} tono="bueno"
          valor={plata(total)}
          detalle={`${pagos.length} pago${pagos.length === 1 ? '' : 's'} · ${cuantosProv} proveedor${cuantosProv === 1 ? '' : 'es'}`}
        />
        {top.map(([medio, monto]) => (
          <Tile key={medio} titulo={medioLabel(medio)} valor={plata(monto)} detalle={periodo} />
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ahg-accent/30">
              <th className="table-th">Fecha</th>
              <th className="table-th">Proveedor</th>
              <th className="table-th">Facturas</th>
              <th className="table-th">Cómo se pagó</th>
              <th className="table-th text-right">Total pagado</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => {
              const abierto = abiertos.has(g.clave);
              const uno = g.pagos.length === 1;
              return (
                <Fragment key={g.clave}>
                  <tr
                    onClick={() => abrir(g.clave)}
                    className={`border-b border-ahg-accent/20 cursor-pointer hover:bg-ahg-bg ${abierto ? 'bg-ahg-bg' : ''}`}
                  >
                    <td className="table-td whitespace-nowrap">
                      {fechaPago(g.fecha)}
                      {g.fecha === hoy && <span className="block text-xs text-ahg-text/40">hoy</span>}
                    </td>
                    <td className="table-td font-medium">{g.proveedor}</td>
                    <td className="table-td">
                      {uno
                        ? (g.pagos[0].factura_numero || <span className="text-ahg-text/30">sin número</span>)
                        : `${g.pagos.length} facturas`}
                    </td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">{g.medios.map(m => <ChipMedio key={m} medio={m} />)}</div>
                    </td>
                    <td className="table-td text-right tabular-nums font-semibold whitespace-nowrap">{plata(g.total)}</td>
                    <td className="table-td text-right whitespace-nowrap">
                      <button
                        onClick={e => { e.stopPropagation(); pdfPagadoDelDia(g.proveedor, g.fecha, g.pagos); }}
                        title={`Lo que se le pagó a ${g.proveedor} ese día`}
                        className="text-xs text-ahg-text/70 hover:underline mr-3"
                      >
                        PDF
                      </button>
                      <span className="text-xs text-ahg-text/50">{abierto ? 'Cerrar ▴' : 'Detalle ▾'}</span>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="border-b border-ahg-accent/20 bg-ahg-bg">
                      {/* max-w-0: el detalle no ensancha la tabla de afuera; si no entra, se desliza él solo. */}
                      <td colSpan={6} className="px-4 pb-3 pt-0 max-w-0">
                        <div className="overflow-x-auto">
                        <table className="w-full bg-white rounded-lg">
                          <thead>
                            <tr className="border-b border-ahg-accent/30">
                              <th className="table-th">Factura</th>
                              <th className="table-th">Local</th>
                              <th className="table-th">Cómo se pagó</th>
                              <th className="table-th">Comprobante</th>
                              <th className="table-th text-right">Monto</th>
                              <th className="table-th"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.pagos.map(p => (
                              <tr key={p.id} className="border-b border-ahg-accent/20 last:border-0">
                                <td className="table-td">
                                  {p.factura_numero || <span className="text-ahg-text/30">sin número</span>}
                                  {p.tiene_foto && <VerFoto facturaId={p.factura_id} />}
                                  <span className="block text-xs text-ahg-text/40">del {fechaPago(p.factura_fecha)}</span>
                                </td>
                                <td className="table-td text-sm">{p.local_nombre || '—'}</td>
                                <td className="table-td"><ChipMedio medio={p.medio} /></td>
                                <td className="table-td">
                                  {p.comprobante || <span className="text-ahg-text/30">—</span>}
                                  <span className="block text-xs text-ahg-text/40">anotó {p.anotado_por}</span>
                                </td>
                                <td className="table-td text-right tabular-nums whitespace-nowrap">{plata(p.monto)}</td>
                                <td className="table-td text-right">
                                  <button onClick={() => borrar(p.id)} className="text-xs text-red-600 hover:underline">
                                    Borrar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!grupos.length && (
              <tr>
                <td colSpan={6} className="table-td text-center text-ahg-text/40 py-8">
                  {cargando ? 'Cargando pagos…' : 'No hay pagos con estos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
