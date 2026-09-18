import { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import logo from '../../assets/logo.svg';
import PendientesSection from './PendientesSection';
import PlanSection       from './PlanSection';
import PagosSection      from './PagosSection';
import FichasSection     from './FichasSection';

const TABS = [
  { id: 'pendientes',  label: 'Facturas pendientes' },
  { id: 'plan',        label: '¿Qué pago?' },
  { id: 'pagos',       label: 'Pagos hechos' },
  { id: 'proveedores', label: 'Proveedores' },
];

export default function ProveedoresPage() {
  const [tab, setTab] = useState('pendientes');
  const [proveedores, setProveedores] = useState([]);
  const [locales, setLocales] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Un pago o una factura nueva cambian los números de las otras solapas, así que
  // el refresco sube hasta acá y baja a todas.
  const [version, setVersion] = useState(0);
  const refrescar = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    setCargando(true);
    Promise.all([api.get('/proveedores'), api.get('/locales')])
      .then(([p, l]) => {
        setProveedores(p.data.data);
        setLocales(l.data.data.filter(x => x.activo));
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [version]);

  return (
    <div className="space-y-0 -mt-2">
      <div className="rounded-2xl overflow-hidden mb-5" style={{ background: '#45484c' }}>
        <div className="flex items-center gap-4 px-6 pt-5 pb-3">
          <img src={logo} alt="AHG" className="w-11 h-11 rounded-full border-2 border-white/25 flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white leading-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Alfalca · Proveedores
            </h1>
            <p
              className="text-white/50 uppercase tracking-widest leading-tight"
              style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}
            >
              Facturas · Pagos · Qué pagar
            </p>
          </div>
        </div>

        <div className="flex px-4 gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-ahg-bg text-violet-900' : 'text-white/55 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pendientes' && (
        <PendientesSection
          key={version} proveedores={proveedores.filter(p => p.activo)}
          locales={locales} onCambio={refrescar}
        />
      )}
      {tab === 'plan'  && <PlanSection key={version} onCambio={refrescar} />}
      {tab === 'pagos' && <PagosSection key={version} onCambio={refrescar} />}
      {tab === 'proveedores' && (
        <FichasSection proveedores={proveedores} cargando={cargando} onCambio={refrescar} />
      )}
    </div>
  );
}
