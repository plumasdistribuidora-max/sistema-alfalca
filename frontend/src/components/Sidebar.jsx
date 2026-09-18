import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { esDueno, esDeRed, esDeTurno, rolLabel } from '../utils/roles';
import logo from '../assets/logo.svg';

// Íconos de línea (estilo Lucide), 16px, trazo 1.75: cada uno es el path de un
// <svg viewBox="0 0 24 24">. Se dibujan con Icono, que pone el marco común.
const PATHS = {
  reportes:   'M9 4h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4V3h6v1M9 11h6M9 15h4',
  proveedores:'M2 6h12v11H2zM14 10h4l4 4v3h-8M7.5 19a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0M19.5 19a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0',
  tiendas:    'M4 10l1-5h14l1 5M4 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0M5 10v10h14V10M10 20v-6h4v6',
  dashboard:  'M4 5a1 1 0 0 1 1-1h5v7H4V5zM14 4h5a1 1 0 0 1 1 1v3h-6V4zM14 12h6v7a1 1 0 0 1-1 1h-5v-8zM4 15h6v5H5a1 1 0 0 1-1-1v-4z',
  importar:   'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  historial:  'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
  stock:      'M3 9l9-4 9 4v10l-9 4-9-4V9zM3 9l9 4 9-4M12 13v10',
  finanzas:   'M4 19h16M6 16l4-5 3 3 5-7M18 7h-3M18 7v3',
  personal:   'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  calendario: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  usuarios:   'M12 15a7 7 0 0 1 7 6H5a7 7 0 0 1 7-6zM12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 8l1.5 1.5L21 7',
  formularios:'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5',
  docenas:    'M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7zM4 7l2-3h12l2 3M9 11h6',
  cafe:       'M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9zM16 10h2a2 2 0 0 1 0 4h-2M8 5c0-1 .5-1 .5-2M11.5 5c0-1 .5-1 .5-2',
  locales:    'M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  manual:     'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h14M9 7h7',
};

function Icono({ name, small }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={small ? 'w-3.5 h-3.5 flex-shrink-0' : 'w-4 h-4 flex-shrink-0'}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

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
      <Icono name={icon} />
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
      <Icono name={icon} small />
      {label}
    </NavLink>
  );
}

function SectionLabel({ label }) {
  return <p className="px-3 pt-4 pb-1 text-xs font-semibold text-white/40 uppercase tracking-widest">{label}</p>;
}

// El manual es un archivo suelto que sirve el servidor, no una pantalla de React:
// por eso va como <a> y no como NavLink, que intentaría resolverlo por ruta interna.
function LinkExterno({ href, icon, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                 text-white/70 hover:bg-white/10 hover:text-white"
    >
      <Icono name={icon} />
      {label}
    </a>
  );
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
        {/* El logo lleva al inicio desde cualquier pantalla (y cierra el menú en el celular). */}
        <NavLink
          to="/"
          onClick={onClose}
          className="px-4 py-5 border-b border-white/10 flex items-center gap-3 hover:bg-white/10 transition-colors"
          aria-label="Ir al inicio"
        >
          <img src={logo} alt="AHG" className="w-8 h-8 rounded-full" />
          <div>
            <p className="font-bold text-white text-sm leading-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>Alfalca</p>
            <p className="text-white/60 uppercase tracking-widest" style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Holding Group</p>
          </div>
        </NavLink>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

          {/* Quien solo carga su reporte de turno no ve la red */}
          {esDeTurno(user) && (
            <NavItem to="/" icon="reportes" label="Mi reporte de hoy" />
          )}

          {esDeRed(user) && (
            <>
              <SectionLabel label="El día" />
              <NavItem to="/reportes"    icon="reportes"     label="Reportes" />
              <NavItem to="/proveedores" icon="proveedores" label="Proveedores" />

              <SectionLabel label="Análisis" />

              {/* Tiendas — grupo desplegable */}
              <button
                onClick={() => setTiendaExpanded(prev => !prev)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Icono name="tiendas" />
                <span className="flex-1 text-left">Tiendas</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                     className={`w-3.5 h-3.5 transition-transform duration-200 ${tiendaOpen ? 'rotate-0' : '-rotate-90'}`} aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {tiendaOpen && (
                <div className="space-y-0.5 pb-0.5">
                  <SubNavItem to="/red"               icon="dashboard"       label="Dashboard" />
                  <SubNavItem to="/ventas/importar"   icon="importar"  label="Importar Excel" />
                  <SubNavItem to="/historial-imports" icon="historial" label="Historial Excel" />
                </div>
              )}

              <NavItem to="/stock"    icon="stock"    label="Stock inteligente" />
              {/* Finanzas es solo del dueño: el Encargado General ve la red pero no la plata. */}
              {esDueno(user) && (
                <NavItem to="/finanzas" icon="finanzas" label="Finanzas" />
              )}

              <SectionLabel label="Equipo" />
              <NavItem to="/empleados"  icon="personal"  label="Empleados y horas" />
              <NavItem to="/calendario" icon="calendario" label="Calendario de trabajo" />
              <NavItem to="/usuarios"   icon="usuarios" label="Usuarios y accesos" />
            </>
          )}

          {esDueno(user) && (
            <>
              <SectionLabel label="Configuración" />
              <NavItem to="/formularios"            icon="formularios" label="Formularios" />
              <NavItem to="/admin/maestros/docenas" icon="docenas" label="Maestro de docenas" />
              <NavItem to="/admin/maestros/cafe"    icon="cafe"  label="Maestro de café" />
              <NavItem to="/locales"                icon="locales"  label="Locales" />
            </>
          )}

          {/* Fuera de los bloques de rol a propósito: el manual lo ve todo el mundo,
              y el que carga el reporte de su turno es justamente el que más lo necesita. */}
          <SectionLabel label="Ayuda" />
          <LinkExterno href="/manual.html" icon="manual" label="Manual de uso" />
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-xs text-white/50 font-medium truncate">{user?.nombre}</p>
          <p className="text-xs text-white/30">{rolLabel(user?.rol)}</p>
        </div>
      </aside>
    </>
  );
}
