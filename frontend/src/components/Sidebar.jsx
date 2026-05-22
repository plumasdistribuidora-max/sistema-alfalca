import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.svg';

const ICON = {
  dashboard:  '◉',
  red:        '⊙',
  ventas:     '₿',
  importar:   '↑',
  listado:    '☰',
  local:      '◎',
  comparar:   '⊞',
  cashflow:   '⊛',
  stock:      '▣',
  benchmark:  '⊕',
  personal:   '◈',
  locales:    '⌂',
  empleados:  '◐',
  historial:  '⌛',
  docenas:    '◆',
  catalogo:   '▤',
};

const TIENDA_ROUTES = ['/red', '/ventas/importar', '/historial-imports'];

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
         ${isActive
           ? 'bg-white/20 text-white'
           : 'text-white/70 hover:bg-white/10 hover:text-white'}`
      }
    >
      <span className="text-base w-5 text-center">{icon}</span>
      {label}
    </NavLink>
  );
}

function SubNavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 pl-8 pr-3 py-1.5 rounded-lg text-sm font-medium transition-colors
         ${isActive
           ? 'bg-white/20 text-white'
           : 'text-white/60 hover:bg-white/10 hover:text-white'}`
      }
    >
      <span className="text-sm w-4 text-center">{icon}</span>
      {label}
    </NavLink>
  );
}

function DisabledItem({ icon, label, badge }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-white/30 cursor-not-allowed select-none">
      <span className="text-base w-5 text-center">{icon}</span>
      <span>{label}</span>
      {badge && (
        <span className="ml-auto text-xs bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
}

function SectionLabel({ label }) {
  return <p className="px-3 pt-4 pb-1 text-xs font-semibold text-white/40 uppercase tracking-widest">{label}</p>;
}

export default function Sidebar({ open, onClose }) {
  const { user }   = useAuth();
  const location   = useLocation();
  const [tiendaExpanded, setTiendaExpanded] = useState(false);

  const isOnTiendaRoute = TIENDA_ROUTES.some(
    r => location.pathname === r || location.pathname.startsWith(r + '/')
  );
  const tiendaOpen = tiendaExpanded || isOnTiendaRoute;

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-ahg-primary z-30 flex flex-col
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo / Brand */}
        <div className="px-4 py-5 border-b border-white/10 flex items-center gap-3">
          <img src={logo} alt="AHG" className="w-8 h-8 rounded-full" />
          <div>
            <p className="font-bold text-white text-sm leading-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>Alfalca</p>
            <p className="text-white/60 uppercase tracking-widest" style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Holding Group</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

          {/* Tiendas — grupo desplegable */}
          <button
            onClick={() => setTiendaExpanded(prev => !prev)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/70 hover:bg-white/10 hover:text-white"
          >
            <span className="text-base w-5 text-center">{ICON.red}</span>
            <span className="flex-1 text-left">Tiendas</span>
            <span className={`text-xs inline-block transition-transform duration-200 ${tiendaOpen ? 'rotate-0' : '-rotate-90'}`}>
              ▾
            </span>
          </button>

          {tiendaOpen && (
            <div className="space-y-0.5 pb-0.5">
              <SubNavItem to="/red"               icon={ICON.red}      label="Dashboard" />
              <SubNavItem to="/ventas/importar"   icon={ICON.importar} label="Importar Excel" />
              <SubNavItem to="/historial-imports" icon={ICON.historial} label="Historial Excel" />
            </div>
          )}

          <NavItem to="/stock" icon={ICON.stock} label="Stock inteligente" />

          <SectionLabel label="Próximamente" />
          <DisabledItem icon={ICON.cashflow}  label="Cash Flow"            badge="Fase 2" />
          <DisabledItem icon={ICON.benchmark} label="Benchmark Franquicia" badge="Fase 4" />
          <DisabledItem icon={ICON.personal}  label="Personal"             badge="Fase 5" />
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-xs text-white/30">v1.0.0 — Fase 1</p>
        </div>
      </aside>
    </>
  );
}
