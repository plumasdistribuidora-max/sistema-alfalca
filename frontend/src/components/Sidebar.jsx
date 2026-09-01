import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { esDueno, esDeRed, esDeTurno, rolLabel } from '../utils/roles';
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
  finanzas:   '⊛',
  stock:      '▣',
  benchmark:  '⊕',
  personal:   '◈',
  locales:    '⌂',
  empleados:  '◐',
  historial:  '⌛',
  docenas:    '◆',
  catalogo:   '▤',
  maestros:   '⊟',
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

          {/* Quien solo carga su reporte de turno no ve la red */}
          {esDeTurno(user) && (
            <NavItem to="/" icon={ICON.listado} label="Mi reporte de hoy" />
          )}

          {esDeRed(user) && (
            <>
              <SectionLabel label="El día" />
              <NavItem to="/consolidado" icon={ICON.dashboard} label="Consolidado diario" />
              <NavItem to="/reportes"    icon={ICON.listado}   label="Reportes del día" />

              <SectionLabel label="Análisis" />
              <NavItem to="/kpi" icon={ICON.comparar} label="KPI" />

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
                  <SubNavItem to="/red"               icon={ICON.red}       label="Dashboard" />
                  <SubNavItem to="/ventas/importar"   icon={ICON.importar}  label="Importar Excel" />
                  <SubNavItem to="/historial-imports" icon={ICON.historial} label="Historial Excel" />
                </div>
              )}

              <NavItem to="/stock"    icon={ICON.stock}    label="Stock inteligente" />
              <NavItem to="/finanzas" icon={ICON.finanzas} label="Finanzas" />

              <SectionLabel label="Equipo" />
              <NavItem to="/usuarios"   icon={ICON.empleados} label="Usuarios y accesos" />
              <NavItem to="/empleados"  icon={ICON.personal}  label="Empleados" />
              <NavItem to="/valor-hora" icon={ICON.cashflow}  label="Valor hora" />
            </>
          )}

          {esDueno(user) && (
            <>
              <SectionLabel label="Configuración" />
              <NavItem to="/formularios"            icon={ICON.catalogo} label="Formularios" />
              <NavItem to="/admin/maestros/docenas" icon={ICON.maestros} label="Maestro de docenas" />
              <NavItem to="/locales"                icon={ICON.locales}  label="Locales" />
            </>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-xs text-white/50 font-medium truncate">{user?.nombre}</p>
          <p className="text-xs text-white/30">{rolLabel(user?.rol)}</p>
        </div>
      </aside>
    </>
  );
}
