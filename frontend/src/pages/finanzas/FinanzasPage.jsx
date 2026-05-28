import { useState } from 'react';
import logo from '../../assets/logo.svg';
import EerrSection     from '../red/secciones/EerrSection';
import CashFlowSection from './CashFlowSection';

const TABS = [
  { id: 'eerr',      label: 'EERR'      },
  { id: 'cashflow',  label: 'Cash Flow' },
];

export default function FinanzasPage() {
  const [activeTab, setActiveTab] = useState('eerr');

  return (
    <div className="space-y-0 -mt-2">
      {/* Header violeta */}
      <div className="rounded-2xl overflow-hidden mb-5" style={{ background: '#4C1D95' }}>
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
                Alfalca · Finanzas
              </h1>
              <p
                className="text-white/50 uppercase tracking-widest leading-tight"
                style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}
              >
                Estado de Resultados · Cash Flow
              </p>
            </div>
          </div>
        </div>

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

      {/* Contenido */}
      {activeTab === 'eerr'     && <EerrSection />}
      {activeTab === 'cashflow' && <CashFlowSection />}
    </div>
  );
}
