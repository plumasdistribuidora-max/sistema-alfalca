import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { colorDeTienda, shortName, fmtARS, fmtDoc } from './red/redUtils';
import logoEntreDos from '../assets/marcas/entre-dos.png';
import logoKankay   from '../assets/marcas/kankay.jpg';
import logoSenzen   from '../assets/marcas/senzen-blanco.png';

// Las marcas del grupo. El logo va en su propio recuadro con el fondo con el que
// vino. Senzen es turquesa: se usa una versión blanca sobre negro para que las tres queden parejas.
const MARCAS = [
  { nombre: 'Entre Dos', rubro: 'Tiendas y cafetería', logo: logoEntreDos, fondo: '#000000' },
  { nombre: 'Kankay',    rubro: 'Retail',              logo: logoKankay,   fondo: '#000000' },
  { nombre: 'Senzen',    rubro: 'Hogar',               logo: logoSenzen,   fondo: '#000000', alto: 68, nueva: true },
];

const DIAS  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}`;
}
function fechaCorta(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}
function horaDe(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function variacion(actual, anterior) {
  if (!anterior) return null;
  return Math.round((actual - anterior) / anterior * 100);
}

function Var({ v }) {
  if (v === null || v === undefined) return null;
  const pos = v >= 0;
  return (
    <span className={`font-semibold ${pos ? 'text-emerald-700' : 'text-red-600'}`}>
      {pos ? '▲' : '▼'} {Math.abs(v)}%
    </span>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ahg-text/60">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={{ fontFamily: 'Nunito, sans-serif', color: color || '#1f2022' }}>{value}</p>
      <p className="text-xs text-ahg-text/50 mt-0.5 min-h-[16px]">{sub}</p>
    </div>
  );
}

function Acceso({ to, titulo, sub, oscuro }) {
  const base = 'rounded-2xl px-5 py-4 flex flex-col gap-0.5 transition-colors';
  return oscuro ? (
    <Link to={to} className={`${base} bg-ahg-primary text-white hover:bg-ahg-secondary`}>
      <span className="font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</span>
      <span className="text-xs text-white/70">{sub}</span>
    </Link>
  ) : (
    <Link to={to} className={`${base} card hover:bg-violet-50`}>
      <span className="font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>{titulo}</span>
      <span className="text-xs text-ahg-text/50">{sub}</span>
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [ventas, setVentas] = useState(undefined);   // undefined = cargando, null = sin datos
  const [dia, setDia]       = useState(undefined);
  const hoy = hoyStr();

  useEffect(() => {
    api.get('/red/inicio')
      .then(r => setVentas(r.data.data))
      .catch(() => setVentas(null));
    api.get('/reportes/dia', { params: { fecha: hoy } })
      .then(r => setDia(r.data.data))
      .catch(() => setDia(null));
  }, [hoy]);

  const nombre = (user?.nombre || '').split(' ')[0];
  const t = ventas?.total;
  const esDeHoy = ventas?.fecha === hoy;
  const etiquetaDia = ventas ? (esDeHoy ? 'de hoy' : `del ${fechaCorta(ventas.fecha)}`) : '';
  // Un día a medio cargar no se compara: la variación contra el anterior mentiría.
  const comparable = ventas && !ventas.parcial;
  const subVentas = ventas === null ? 'Sin ventas cargadas'
    : !ventas ? ''
    : ventas.parcial ? `Parcial · cargado ${horaDe(ventas.importado_at) ? `a las ${horaDe(ventas.importado_at)}` : 'hoy'}`
    : t.facturacion_ant ? <>Día anterior: {fmtARS(t.facturacion_ant)} · <Var v={variacion(t.facturacion, t.facturacion_ant)} /></> : '';
  const subDocenas = comparable && t.docenas_ant
    ? <>Día anterior: {fmtDoc(t.docenas_ant)} · <Var v={variacion(t.docenas, t.docenas_ant)} /></>
    : (ventas?.parcial ? 'Parcial' : '');

  // Turnos de hoy por local: cuántos llegaron de los esperados y a qué hora el último.
  const turnos = (dia?.locales || [])
    .filter(l => l.esperados > 0)
    .map(l => {
      const recibidos = l.slots.filter(s => ['enviado', 'observado', 'aprobado'].includes(s.estado));
      const ultimo = recibidos.map(s => s.reporte?.enviado_at).filter(Boolean).sort().pop();
      return { ...l, completo: l.recibidos >= l.esperados, hora: horaDe(ultimo) };
    });
  const faltan = dia ? dia.totales.esperados - dia.totales.recibidos : 0;
  const faltanNombres = turnos.filter(l => !l.completo).map(l => shortName(l.nombre));

  return (
    <div className="space-y-6">
      {/* ── Saludo ──────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ahg-text/50">Alfalca · Inicio</p>
          <h1 className="text-2xl font-bold text-ahg-text mt-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Hola{nombre ? `, ${nombre}` : ''}
          </h1>
        </div>
        <p className="text-sm text-ahg-text/50 capitalize">{fechaLarga(hoy)}</p>
      </div>

      {/* ── Marcas ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Al pasar el mouse la tarjeta se levanta apenas y el logo crece un poco: vida, sin animación. */}
        {MARCAS.map(m => (
          <div key={m.nombre} className="card p-3.5 flex flex-col gap-3 group transition-all duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-md">
            <div className="h-24 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: m.fondo }}>
              <img
                src={m.logo} alt={m.nombre}
                className="w-auto max-w-[90%] object-contain transition-transform duration-500 ease-out motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-1"
                style={{ height: m.alto || 84 }}
              />
            </div>
            <div className="flex items-end justify-between gap-2 px-1">
              <div>
                <p className="font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>{m.nombre}</p>
                <p className="text-xs text-ahg-text/50">{m.rubro}</p>
              </div>
              {m.nueva && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ahg-bronce bg-ahg-bronce/10 rounded-full px-2 py-0.5">
                  Nueva
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Hoy en la red ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="text-lg font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>Hoy en la red</h2>
          {ventas && (
            <span className="text-xs text-ahg-text/50">
              {esDeHoy ? 'ventas cargadas hoy' : `ventas cargadas hasta el ${fechaCorta(ventas.fecha)}`}
              {ventas.parcial ? ' (día incompleto)' : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label={`Ventas ${etiquetaDia || 'del último día'} (${ventas?.locales?.length ?? 5} locales)`}
            value={ventas === undefined ? '…' : ventas ? fmtARS(t.facturacion) : '—'}
            sub={subVentas}
          />
          <Stat
            label={`Docenas vendidas ${etiquetaDia}`}
            value={ventas === undefined ? '…' : ventas ? fmtDoc(t.docenas) : '—'}
            sub={subDocenas}
            color="#00633a"
          />
          <Stat
            label="Reportes de hoy"
            value={dia === undefined ? '…' : dia ? `${dia.totales.recibidos} de ${dia.totales.esperados}` : '—'}
            sub={dia ? (faltan > 0 ? `Falta${faltan > 1 ? 'n' : ''} ${faltanNombres.join(', ')}` : 'Están todos') : ''}
            color={dia && faltan > 0 ? '#b06f2d' : '#00633a'}
          />
          <Stat
            label="Tickets"
            value={ventas === undefined ? '…' : ventas ? t.tickets.toLocaleString('es-AR') : '—'}
            sub={ventas ? `Ventas ${etiquetaDia} en toda la red` : ''}
          />
        </div>
      </div>

      {/* ── Turnos + accesos ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <p className="font-bold text-ahg-text mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Turnos de hoy</p>
          {dia === undefined && <p className="text-sm text-ahg-text/40 py-3">Cargando…</p>}
          {dia === null && <p className="text-sm text-ahg-text/40 py-3">No se pudo cargar el día.</p>}
          {dia && turnos.length === 0 && <p className="text-sm text-ahg-text/40 py-3">Ningún local tiene turnos configurados.</p>}
          {turnos.map(l => (
            <div key={l.local_id} className="flex items-center gap-3 py-2 border-b border-ahg-accent/30 last:border-0 text-sm">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorDeTienda(l.nombre) }} />
              <span className="flex-1 font-medium text-ahg-text">{shortName(l.nombre)}</span>
              <span className="text-xs text-ahg-text/50">{l.recibidos} de {l.esperados}</span>
              <span className="flex items-center gap-1.5 text-xs text-ahg-text/60 w-28 justify-end">
                <span className={`w-2 h-2 rounded-full ${l.completo ? 'bg-emerald-600' : l.recibidos > 0 ? 'bg-amber-500' : 'bg-ahg-accent'}`} />
                {l.completo ? `Completo ${l.hora}` : l.recibidos > 0 ? `Parcial ${l.hora}` : 'Pendiente'}
              </span>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <Acceso to="/reportes"    titulo="Ir a Reportes"  sub={faltan > 0 ? `Reclamar ${faltan === 1 ? 'el turno que falta' : `los ${faltan} turnos que faltan`}` : 'Revisar y cerrar el día'} oscuro />
          <Acceso to="/red"         titulo="Red de tiendas" sub="Ventas, docenas y comparativas" />
          <Acceso to="/proveedores" titulo="Proveedores"    sub="Pedido de stock y facturas" />
        </div>
      </div>
    </div>
  );
}
