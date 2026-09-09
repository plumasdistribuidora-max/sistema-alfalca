import { useEffect, useState } from 'react';
import {
  Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api';
import { fmtARS, fmtNum, colorDeTienda } from '../redUtils';

// A qué hora vende cada local. La pregunta que contesta es "¿desde qué hora hasta
// qué hora conviene tener abierto este local?", así que todo se muestra por tienda
// separada: el horario que le sirve a Peatonal no es el que le sirve a Sheraton.

const METRICAS = [
  { id: 'facturacion',     label: 'Facturación' },
  { id: 'tickets',         label: 'Tickets' },
  { id: 'ticket_promedio', label: 'Ticket promedio' },
];

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hace(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return iso(d);
}
function primeroDelMes(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return iso(d);
}
function ultimoDelMes(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return iso(d);
}

const ATAJOS = [
  { label: 'Últimos 7 días',  desde: () => hace(6),  hasta: () => iso(new Date()) },
  { label: 'Últimos 30 días', desde: () => hace(29), hasta: () => iso(new Date()) },
  { label: 'Este mes',        desde: () => primeroDelMes(0),  hasta: () => iso(new Date()) },
  { label: 'Mes pasado',      desde: () => primeroDelMes(-1), hasta: () => ultimoDelMes(-1) },
];

const hh = h => `${String(h).padStart(2, '0')}`;
const franjaTexto = f => (f ? `${hh(f.desde_hora)} a ${hh(f.hasta_hora + 1)} h` : '—');

function Tooltipito({ active, payload, metrica, modo }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const esPlata = metrica !== 'tickets';
  return (
    <div className="bg-white border border-stone-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-stone-800 mb-1">{hh(d.hora)} a {hh(d.hora + 1)} h</p>
      <p className="text-stone-600">
        {METRICAS.find(m => m.id === metrica).label}:{' '}
        <strong>{esPlata ? fmtARS(d.valor) : fmtNum(d.valor)}</strong>
        {modo === 'promedio' && metrica !== 'ticket_promedio' && <span className="text-stone-400"> por día</span>}
      </p>
      {metrica === 'facturacion' && (
        <p className="text-stone-400">{d.pct}% del día · {fmtNum(d.tickets)} tickets</p>
      )}
    </div>
  );
}

function TiendaHoras({ t, metrica, modo, desdeHora, hastaHora }) {
  const color = colorDeTienda(t.tienda);

  const valorDe = h => {
    if (metrica === 'tickets') return modo === 'promedio' ? h.prom_dia_tickets : h.tickets;
    if (metrica === 'ticket_promedio') return h.ticket_promedio;
    return modo === 'promedio' ? h.prom_dia_facturacion : h.facturacion;
  };

  const datos = t.horas
    .filter(h => h.hora >= desdeHora && h.hora <= hastaHora)
    .map(h => ({ ...h, valor: valorDe(h) }));

  const esPlata = metrica !== 'tickets';
  const dentro  = h => t.franja && h >= t.franja.desde_hora && h <= t.franja.hasta_hora;

  return (
    <div className="card p-4">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h3 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {t.tienda}
        </h3>
        <span className="text-xs text-stone-400">
          {t.dias_abiertos} día{t.dias_abiertos === 1 ? '' : 's'} con venta ·{' '}
          {fmtARS(t.total_facturacion)} · {fmtNum(t.total_tickets)} tickets
        </span>
      </div>

      <p className="text-sm text-stone-600 mb-3">
        {t.franja ? (
          <>
            El <strong>80% se vende entre las {franjaTexto(t.franja)}</strong>. La hora más fuerte
            es de {hh(t.hora_pico)} a {hh(t.hora_pico + 1)}.
          </>
        ) : 'Sin ventas en el período.'}
      </p>

      {t.franja && (
        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          <span className="text-stone-500">
            Antes de las {hh(t.franja.desde_hora)}:{' '}
            <strong className={t.antes_franja.pct < 5 ? 'text-red-600' : 'text-stone-700'}>
              {t.antes_franja.pct}%
            </strong>
            <span className="text-stone-400"> · {fmtARS(t.antes_franja.facturacion)}</span>
          </span>
          <span className="text-stone-500">
            Después de las {hh(t.franja.hasta_hora + 1)}:{' '}
            <strong className={t.despues_franja.pct < 5 ? 'text-red-600' : 'text-stone-700'}>
              {t.despues_franja.pct}%
            </strong>
            <span className="text-stone-400"> · {fmtARS(t.despues_franja.facturacion)}</span>
          </span>
          <span className="text-stone-400">
            Abre con venta a las {hh(t.primera_hora)} · la última es a las {hh(t.ultima_hora)}
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={datos} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E5E4" />
          <XAxis
            dataKey="hora" tickFormatter={hh} tick={{ fontSize: 11, fill: '#78716C' }}
            axisLine={false} tickLine={false} interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#A8A29E' }} axisLine={false} tickLine={false} width={54}
            tickFormatter={v => (esPlata ? fmtARS(v) : fmtNum(v))}
          />
          <Tooltip content={<Tooltipito metrica={metrica} modo={modo} />} cursor={{ fill: '#F5F5F4' }} />
          <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
            {/* Las horas de afuera de la franja principal van apagadas: es lo que se
                está discutiendo cuando se decide abrir más temprano o cerrar antes. */}
            {datos.map(d => (
              <Cell key={d.hora} fill={color} fillOpacity={dentro(d.hora) ? 1 : 0.28} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {t.sin_hora > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          {fmtNum(t.sin_hora)} ticket{t.sin_hora === 1 ? '' : 's'} del período no traen hora en el
          Excel ({fmtARS(t.sin_hora_monto)}) y quedan afuera de este gráfico.
        </p>
      )}
    </div>
  );
}

export default function PorHoraSection() {
  const [desde, setDesde] = useState(hace(29));
  const [hasta, setHasta] = useState(iso(new Date()));
  const [metrica, setMetrica] = useState('facturacion');
  const [modo, setModo] = useState('total');

  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setCargando(true);
    api.get('/red/por-hora', { params: { desde, hasta } })
      .then(r => { setData(r.data.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo armar el análisis por hora'))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const tiendas = data?.tiendas || [];

  // Todas las tiendas comparten el mismo eje de horas para poder compararlas de un
  // vistazo, recortado a las horas en que alguna vende algo.
  const conVenta = tiendas.flatMap(t => t.horas.filter(h => h.tickets > 0).map(h => h.hora));
  const desdeHora = conVenta.length ? Math.max(0, Math.min(...conVenta) - 1) : 8;
  const hastaHora = conVenta.length ? Math.min(23, Math.max(...conVenta) + 1) : 22;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {ATAJOS.map(a => {
            const activo = desde === a.desde() && hasta === a.hasta();
            return (
              <button
                key={a.label}
                onClick={() => { setDesde(a.desde()); setHasta(a.hasta()); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  activo
                    ? 'bg-violet-800 text-white border-violet-800'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-violet-400'
                }`}
              >
                {a.label}
              </button>
            );
          })}
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <input type="date" className="input w-auto text-sm" value={desde}
                   onChange={e => e.target.value && setDesde(e.target.value)} />
            <span>a</span>
            <input type="date" className="input w-auto text-sm" value={hasta}
                   onChange={e => e.target.value && setHasta(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-xl border border-stone-200 overflow-hidden text-sm">
            {METRICAS.map(m => (
              <button
                key={m.id}
                onClick={() => setMetrica(m.id)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  metrica === m.id ? 'bg-violet-800 text-white' : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {metrica !== 'ticket_promedio' && (
            <div className="flex rounded-xl border border-stone-200 overflow-hidden text-sm">
              <button
                onClick={() => setModo('total')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  modo === 'total' ? 'bg-violet-800 text-white' : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                Total del período
              </button>
              <button
                onClick={() => setModo('promedio')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  modo === 'promedio' ? 'bg-violet-800 text-white' : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                Promedio por día
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {cargando && <div className="h-64 bg-stone-200 rounded-xl animate-pulse" />}

      {!cargando && !tiendas.length && (
        <p className="text-center py-12 text-stone-400">
          No hay ventas con hora en ese período.
        </p>
      )}

      {!cargando && tiendas.length > 0 && (
        <>
          {/* El resumen que contesta la pregunta de un vistazo, antes de los gráficos */}
          <div className="card overflow-x-auto">
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-semibold text-stone-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                El horario que se justifica en cada local
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                La franja donde se concentra el 80% de la venta del período
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-400 uppercase tracking-wide">
                  <th className="py-2 px-4 text-left font-semibold">Tienda</th>
                  <th className="py-2 px-3 text-center font-semibold">Primera venta</th>
                  <th className="py-2 px-3 text-center font-semibold">80% entre</th>
                  <th className="py-2 px-3 text-center font-semibold">Hora pico</th>
                  <th className="py-2 px-3 text-center font-semibold">Última venta</th>
                  <th className="py-2 px-3 text-right font-semibold">Por día</th>
                </tr>
              </thead>
              <tbody>
                {tiendas.map(t => (
                  <tr key={t.local_id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2.5 px-4 font-medium text-stone-800">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ background: colorDeTienda(t.tienda) }}
                      />
                      {t.tienda}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      {t.primera_hora !== null ? `${hh(t.primera_hora)} h` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-violet-800 tabular-nums">
                      {franjaTexto(t.franja)}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      {t.hora_pico !== null ? `${hh(t.hora_pico)} h` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">
                      {t.ultima_hora !== null ? `${hh(t.ultima_hora)} h` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {fmtARS(t.prom_dia_facturacion)}
                      <span className="block text-xs text-stone-400">
                        {fmtNum(t.prom_dia_tickets)} tickets
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {tiendas.map(t => (
              <TiendaHoras
                key={t.local_id} t={t} metrica={metrica} modo={modo}
                desdeHora={desdeHora} hastaHora={hastaHora}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
