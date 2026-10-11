import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Isotipo } from '../../components/Marca';
import api from '../../api';
import ComoVenimosSection from './secciones/ComoVenimosSection';
import MesAMesSection from './secciones/MesAMesSection';
import ProductosSection from './secciones/ProductosSection';
import VendedoresSection from './secciones/VendedoresSection';
import DiasHorasSection from './secciones/DiasHorasSection';
import CrecimientoSection from './secciones/CrecimientoSection';
import { colorDeTienda, shortName, ordenarTiendas } from './redUtils';

const TABS = [
  { id: 'como',     label: 'Cómo venimos' },
  { id: 'crecimiento', label: 'Crecimiento' },
  { id: 'mes',      label: 'Mes a mes' },
  { id: 'productos', label: 'Productos' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'dias',     label: 'Días y horas' },
];

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatUltimoImport(isoStr) {
  const ar = new Date(
    new Date(isoStr).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
  );
  const dia  = ar.getDate();
  const mes  = MESES[ar.getMonth()];
  const anio = ar.getFullYear();
  const hh   = String(ar.getHours()).padStart(2, '0');
  const mm   = String(ar.getMinutes()).padStart(2, '0');
  return `${dia} ${mes} ${anio}, ${hh}:${mm}`;
}

// "Ene 2025 – Sep 2026": el rango real de ventas cargadas, no un texto fijo.
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function rangoTexto(u) {
  if (!u?.desde || !u?.hasta) return 'Ventas cargadas';
  const [ay, am] = u.desde.split('-').map(Number);
  const [by, bm, bd] = u.hasta.split('-').map(Number);
  const desde = ay === by ? MES_CORTO[am - 1] : `${MES_CORTO[am - 1]} ${ay}`;
  return `${desde} – ${bd} ${MES_CORTO[bm - 1].toLowerCase()} ${by}`;
}

export default function RedDashboard() {
  const [activeTab, setActiveTab]     = useState('como');
  const [ultimoImport, setUltimoImport] = useState(undefined); // undefined = cargando, null = sin datos

  // Las solapas nuevas se filtran por local desde acá: elegís uno y todas lo muestran solo a él.
  const [locales, setLocales] = useState([]);
  // ?local_id= lo abre ya filtrado (por ejemplo, desde "Importar Excel")
  const [params] = useSearchParams();
  const [selId, setSelId]     = useState(() => Number(params.get('local_id')) || null);
  const conSelector = ['como', 'mes', 'dias'].includes(activeTab);

  useEffect(() => {
    api.get('/locales').then(r => {
      const activos = r.data.data.filter(l => l.activo);
      const orden = ordenarTiendas(activos.map(l => l.nombre));
      setLocales(activos.sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre)));
    }).catch(() => setLocales([]));
  }, []);

  useEffect(() => {
    api.get('/imports/ultimo')
      .then(r => setUltimoImport(r.data.data))
      .catch(() => setUltimoImport(null));
  }, []);

  const badgeTexto = ultimoImport === undefined
    ? 'Actualizado'
    : ultimoImport === null
      ? null
      : `Actualizado ${formatUltimoImport(ultimoImport.created_at)}`;

  return (
    <div className="space-y-0 -mt-2">
      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-5" style={{ background: '#45484c' }}>
        {/* Título + badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 pt-5 pb-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Isotipo className="w-9 h-9 sm:w-10 sm:h-10 text-white flex-shrink-0" />
            <div className="min-w-0">
              <h1
                className="text-lg sm:text-xl font-bold text-white leading-tight"
                style={{ fontFamily: 'Nunito, sans-serif' }}
              >
                Entre Dos
              </h1>
              <p
                className="text-white/50 uppercase tracking-widest leading-tight"
                style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}
              >
                {ultimoImport?.hasta ? ultimoImport.hasta.slice(0, 4) : new Date().getFullYear()} · 5 unidades
              </p>
            </div>
          </div>

          {badgeTexto ? (
            <span className="flex items-center gap-1.5 bg-white text-ahg-text text-xs font-semibold px-3 py-1.5 rounded-full max-w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse flex-shrink-0" />
              {badgeTexto}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-white/10 text-white/40 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
              Sin datos
            </span>
          )}
        </div>

        <p className="px-4 sm:px-6 pb-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {rangoTexto(ultimoImport)} · 4 tiendas alfajoreras + 1 cafetería
        </p>

        {/* Tabs */}
        <div className="flex px-4 gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 sm:px-4 py-2.5 text-sm font-semibold rounded-t-xl whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-violet-900'
                  : 'text-white/55 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido del tab activo ────────────────────────────────────────── */}
      {conSelector && locales.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1 mb-4">
          <span className="text-xs text-stone-500">Ver:</span>
          <div className="flex flex-wrap rounded-lg border border-stone-200 overflow-hidden">
            {[{ id: null, nombre: 'Todos' }, ...locales].map(l => {
              const activo = selId === l.id;
              return (
                <button key={l.id ?? 'todos'} aria-pressed={activo} onClick={() => setSelId(l.id)}
                        className={`px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${activo ? 'bg-ahg-primary text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                  {l.id && <span className="w-2 h-2 rounded-full" style={{ background: colorDeTienda(l.nombre) }} />}
                  {l.id ? shortName(l.nombre) : l.nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === 'como'     && <ComoVenimosSection selId={selId} />}
      {activeTab === 'crecimiento' && <CrecimientoSection />}
      {activeTab === 'mes'      && <MesAMesSection selId={selId} />}
      {activeTab === 'productos' && <ProductosSection />}
      {activeTab === 'vendedores' && <VendedoresSection selId={selId} locales={locales} />}
      {activeTab === 'dias'     && <DiasHorasSection selId={selId} />}
    </div>
  );
}
