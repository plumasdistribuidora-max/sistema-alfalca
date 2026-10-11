import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api';
import { fmtARS } from '../redUtils';

// "Productos": los que juntan el 80 % de la venta del año, tiendas y Café por separado,
// y cuánto subimos cada uno contra los mismos días del año pasado, al lado de la
// inflación. Los que no existían el año pasado (o ya no se venden) solo muestran precio.

const COBRE = '#8a5a3c';
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pct1 = v => Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fecha = iso => { const [, m, d] = iso.split('-').map(Number); return `${d} de ${MES[m - 1]}`; };
const rango = (a, b) => { const [y, m, d1] = a.split('-').map(Number); const d2 = Number(b.slice(8, 10)); return `${d1}–${d2} ${MES[m - 1].slice(0, 3)} ${y}`; };

function Pareto({ grupo, cafe }) {
  const max = grupo.top[0]?.venta || 1;
  let acc = 0;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[22px_minmax(0,1.4fr)_minmax(50px,1fr)_100px_56px] gap-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-stone-500 border-b border-stone-100 pb-1">
        <span>#</span><span>Producto</span><span /><span className="text-right">Venta</span><span className="text-right">Acum.</span>
      </div>
      {grupo.top.map((p, i) => {
        acc += p.venta;
        return (
          <div key={p.nombre} className="grid grid-cols-[22px_minmax(0,1.4fr)_minmax(50px,1fr)_100px_56px] gap-2.5 items-center text-[12.5px] py-0.5 border-b border-stone-50">
            <span className="text-stone-400 font-semibold">{i + 1}</span>
            <span className="truncate" title={p.nombre}>{p.nombre}</span>
            <span className="h-2 rounded" style={{ width: `${p.venta / max * 100}%`, background: cafe ? COBRE : '#45484c' }} />
            <span className="text-right tabular-nums">{fmtARS(p.venta)}</span>
            <span className="text-right tabular-nums text-stone-500">{Math.round(acc / grupo.total * 100)} %</span>
          </div>
        );
      })}
    </div>
  );
}

function ChipInflacion({ suba, inflacion }) {
  if (suba == null || inflacion == null) return null;
  const dif = suba - inflacion;
  return (
    <span className={`text-[11.5px] font-semibold rounded-full px-2 py-0.5 ${dif >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      {pct1(dif)} puntos {dif >= 0 ? 'arriba' : 'abajo'} de la inflación
    </span>
  );
}

export default function ProductosSection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.get('/red/productos-80')
      .then(r => setData(r.data.data))
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-72 bg-stone-200 rounded-2xl animate-pulse" />;
  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!data) return <p className="text-center py-16 text-stone-400">Todavía no hay ventas cargadas.</p>;

  const inf = data.inflacion?.valor;
  const pr = data.precios;
  const grupos = [
    { key: 'tiendas', titulo: 'Tiendas de alfajores', g: data.tiendas, suba: data.suba.tiendas },
    { key: 'cafe', titulo: 'Café', g: data.cafe, suba: data.suba.cafe, cafe: true },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 px-1">
        <b className="text-[15px] text-stone-900 mr-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Del 1 de enero al {fecha(data.hasta)}</b>
        los productos que juntan el 80 % de la venta. La venta por producto es antes de los descuentos del ticket, por eso suma un poco más que la facturación.
      </p>

      {grupos.map(({ key, titulo, g, cafe }) => (
        <div key={key} className="card p-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="font-semibold" style={{ fontFamily: 'Nunito, sans-serif', color: cafe ? COBRE : undefined }}>{titulo}</h3>
            <p className="text-xs text-stone-500">
              <b className="text-stone-900">{g.top.length} productos</b> de {g.productos} hacen el 80 % de la venta ({fmtARS(g.total)})
            </p>
          </div>
          <Pareto grupo={g} cafe={cafe} />
        </div>
      ))}

      <div className="card p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>Cuánto subimos los precios en un año</h3>
          <p className="text-xs text-stone-500">
            El precio más cobrado de cada producto del 80 % en {rango(pr.desde, pr.hasta)}, contra los mismos días de {pr.anio_ant.desde.slice(0, 4)}.
            El total pesa cada producto según cuánto se vende.
            {inf != null && ` La inflación interanual del INDEC es ${pct1(inf)} %.`}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {grupos.map(({ key, titulo, suba, cafe }) => (
            <div key={key} className="rounded-2xl border border-stone-100 p-4 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: cafe ? COBRE : '#6b6e72' }}>{titulo}</p>
              <p className="text-2xl font-extrabold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>{suba ? `+${pct1(suba.pct)} %` : 'sin dato'}</p>
              <ChipInflacion suba={suba?.pct} inflacion={inf} />
            </div>
          ))}
          <div className="rounded-2xl p-4 space-y-1.5 text-white" style={{ background: '#45484c' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Inflación (INDEC)</p>
            <p className="text-2xl font-extrabold tabular-nums" style={{ fontFamily: 'Nunito, sans-serif' }}>{inf != null ? `+${pct1(inf)} %` : 'sin cargar'}</p>
            <p className="text-xs text-white/65">interanual, se cambia en "Cómo venimos"</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-stone-500 border-b border-stone-100">
                <th className="text-left font-semibold py-1.5 px-2">Producto</th>
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">{rango(pr.anio_ant.desde, pr.anio_ant.hasta)}</th>
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">{rango(pr.desde, pr.hasta)}</th>
                <th className="text-right font-semibold py-1.5 px-2">Suba</th>
                <th className="text-right font-semibold py-1.5 px-2 whitespace-nowrap">Contra la inflación</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(({ key, titulo, g, cafe }) => [
                <tr key={`${key}-t`}><td colSpan={5} className="pt-3 pb-1 px-2 font-bold" style={{ color: cafe ? COBRE : undefined }}>{titulo}</td></tr>,
                ...g.top.map(p => {
                  const s = p.hoy && p.antes ? (p.hoy / p.antes - 1) * 100 : null;
                  const dif = s != null && inf != null ? s - inf : null;
                  return (
                    <tr key={`${key}-${p.nombre}`} className="border-b border-stone-50">
                      <td className="py-1.5 px-2">{p.nombre}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{p.antes ? fmtARS(p.antes) : '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{p.hoy ? fmtARS(p.hoy) : '—'}</td>
                      {s != null ? (
                        <>
                          <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{s >= 0 ? '+' : '−'}{pct1(s)} %</td>
                          <td className="py-1.5 px-2 text-right">
                            {dif != null && (
                              <span className={`text-[11.5px] font-semibold rounded-full px-2 py-0.5 ${dif >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {dif >= 0 ? '+' : '−'}{pct1(dif)} puntos
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="py-1.5 px-2 text-right text-xs text-stone-400">
                          {!p.hoy ? 'no se vendió en estos días' : 'no estaba el año pasado'}
                        </td>
                      )}
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-500">Los productos que no existían el año pasado o que no se vendieron en estos días no entran en el total: solo se muestra su precio.</p>
      </div>

      <p className="text-xs text-stone-500 px-1">
        ¿Buscás un producto puntual? Está en el <Link to="/ventas/productos/catalogo" className="underline text-stone-700">catálogo completo</Link>.
      </p>
    </div>
  );
}
