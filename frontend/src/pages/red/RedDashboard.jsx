import { useEffect, useState } from 'react';
import logo from '../../assets/logo.svg';
import api from '../../api';
import ResumenSection  from './secciones/ResumenSection';
import TiendasSection  from './secciones/TiendasSection';
import MesesSection    from './secciones/MesesSection';
import AnalisisSection from './secciones/AnalisisSection';
import EerrSection     from './secciones/EerrSection';

const TABS = [
  { id: 'resumen',  label: 'Resumen'  },
  { id: 'tiendas', label: 'Tiendas'  },
  { id: 'meses',   label: 'Meses'    },
  { id: 'analisis',label: 'Análisis' },
  { id: 'eerr',    label: 'EERR'     },
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

export default function RedDashboard() {
  const [activeTab, setActiveTab]     = useState('resumen');
  const [ultimoImport, setUltimoImport] = useState(undefined); // undefined = cargando, null = sin datos

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
      {/* ── Header violeta ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-5" style={{ background: '#4C1D95' }}>
        {/* Título + badge */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-4">
            <img
              src={logo} alt="AHG"
              className="w-11 h-11 rounded-full border-2 border-white/25 flex-shrink-0"
            />
            <div>
              <h1
                className="text-xl font-bold text-white leading-tight"
                style={{ fontFamily: 'Nunito, sans-serif' }}
              >
                Alfalca · Red de tiendas
              </h1>
              <p
                className="text-white/50 uppercase tracking-widest leading-tight"
                style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}
              >
                2026 · 5 unidades
              </p>
            </div>
          </div>

          {badgeTexto ? (
            <span className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {badgeTexto}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-white/10 text-white/40 text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
              Sin datos
            </span>
          )}
        </div>

        <p className="px-6 pb-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Ene–Mayo 2026 · 4 tiendas alfajoreras + 1 cafetería
        </p>

        {/* Tabs */}
        <div className="flex px-4 gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-colors ${
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
      {activeTab === 'resumen'  && <ResumenSection />}
      {activeTab === 'tiendas' && <TiendasSection />}
      {activeTab === 'meses'   && <MesesSection />}
      {activeTab === 'analisis' && <AnalisisSection />}
      {activeTab === 'eerr'    && <EerrSection />}
    </div>
  );
}
