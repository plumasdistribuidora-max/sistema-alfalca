import { useState, useEffect } from 'react';
import api from '../../api';
import { plata, Tile, ChipMedio, fechaCorta, hoyStr, medioLabel } from './comunes';
import { pdfPagadoDelDia } from './pdfPagos';

// El registro de lo que se pagó: con qué, cuándo y quién lo anotó. Un pago mal
// anotado se borra y se vuelve a cargar; no se edita, así queda el rastro limpio.

export default function PagosSection({ onCambio }) {
  const [pagos, setPagos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  function cargar() {
    setCargando(true);
    api.get('/proveedores/pagos')
      .then(r => { setPagos(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudieron traer los pagos'))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function borrar(id) {
    if (!confirm('¿Borrar este pago? La factura vuelve a quedar con ese saldo pendiente.')) return;
    try {
      await api.delete(`/proveedores/pagos/${id}`);
      cargar();
      onCambio?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar el pago');
    }
  }

  if (cargando) return <p className="text-sm text-ahg-text/50 p-4">Cargando pagos…</p>;

  const hoy = hoyStr();
  const mes = hoy.slice(0, 7);
  const delMes = pagos.filter(p => p.fecha.slice(0, 7) === mes);

  const porMedio = {};
  delMes.forEach(p => { porMedio[p.medio] = (porMedio[p.medio] || 0) + p.monto; });
  const top = Object.entries(porMedio).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Dentro de cada día, los pagos de un mismo proveedor van juntos: así el botón del
  // PDF queda en la primera fila del grupo y se lleva todo lo de ese día.
  const clave = p => `${p.fecha}|${p.proveedor}`;
  const grupos = {};
  pagos.forEach(p => { (grupos[clave(p)] ||= []).push(p); });
  const filas = [...pagos].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || a.proveedor.localeCompare(b.proveedor) || b.id - a.id);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          titulo="Pagado este mes" tono="bueno"
          valor={plata(delMes.reduce((s, p) => s + p.monto, 0))}
          detalle={`${delMes.length} pago${delMes.length === 1 ? '' : 's'}`}
        />
        {top.map(([medio, monto]) => (
          <Tile key={medio} titulo={medioLabel(medio)} valor={plata(monto)} detalle="este mes" />
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ahg-accent/30">
              <th className="table-th">Fecha</th>
              <th className="table-th">Proveedor</th>
              <th className="table-th">Factura</th>
              <th className="table-th">Cómo se pagó</th>
              <th className="table-th">Comprobante</th>
              <th className="table-th text-right">Monto</th>
              <th className="table-th">Lo anotó</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p, i) => {
              const primera = i === 0 || clave(filas[i - 1]) !== clave(p);
              const grupo = grupos[clave(p)];
              return (
              <tr key={p.id} className="border-b border-ahg-accent/20 hover:bg-ahg-bg">
                <td className="table-td">
                  {fechaCorta(p.fecha)}
                  {p.fecha === hoy && <span className="block text-xs text-ahg-text/40">hoy</span>}
                </td>
                <td className="table-td font-medium">{p.proveedor}</td>
                <td className="table-td">{p.factura_numero || <span className="text-ahg-text/30">sin número</span>}</td>
                <td className="table-td"><ChipMedio medio={p.medio} /></td>
                <td className="table-td">{p.comprobante || <span className="text-ahg-text/30">—</span>}</td>
                <td className="table-td text-right tabular-nums font-semibold">{plata(p.monto)}</td>
                <td className="table-td text-xs text-ahg-text/50">{p.anotado_por}</td>
                <td className="table-td text-right whitespace-nowrap">
                  {primera && (
                    <button
                      onClick={() => pdfPagadoDelDia(p.proveedor, p.fecha, grupo)}
                      title={`Lo que se le pagó a ${p.proveedor} ese día`}
                      className="text-xs text-ahg-text/70 hover:underline mr-3"
                    >
                      PDF{grupo.length > 1 ? ` (${grupo.length} pagos)` : ''}
                    </button>
                  )}
                  <button onClick={() => borrar(p.id)} className="text-xs text-red-600 hover:underline">
                    Borrar
                  </button>
                </td>
              </tr>
              );
            })}
            {!pagos.length && (
              <tr>
                <td colSpan={8} className="table-td text-center text-ahg-text/40 py-8">
                  Todavía no se anotó ningún pago.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
