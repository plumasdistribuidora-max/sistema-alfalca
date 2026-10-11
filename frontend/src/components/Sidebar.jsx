import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { esDueno, esDeRed, esDeTurno, rolLabel } from '../utils/roles';
import { Logotipo } from './Marca';
import { rutasDe } from './Solapas';

// Íconos de línea (estilo Lucide), 16px, trazo 1.75: cada uno es el path de un
// <svg viewBox="0 0 24 24">. Se dibujan con Icono, que pone el marco común.
const PATHS = {
  inicio:     'M4 11l8-7 8 7M6 9.5V20h4v-5h4v5h4V9.5',
  reportes:   'M9 4h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4V3h6v1M9 11h6M9 15h4',
  tareas:     'M9 11l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  dia:        'M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  tablero:    'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3',
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
  // Una por marca: un alfajor (Entre Dos), una sartén (Kankay) y un rociador de limpieza (Senzen).
  alfajor:    'M3 8c0-1.7 4-3 9-3s9 1.3 9 3-4 3-9 3-9-1.3-9-3zM3 8v1.5M21 8v1.5M3 12.5c1.5.8 3 .8 4.5 0s3-.8 4.5 0 3 .8 4.5 0 3-.8 4.5 0M3 15.5c0 1.7 4 3 9 3s9-1.3 9-3v-1M3 15.5v-1',
  sarten:     'M10 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.3 8.3L21.5 4',
  limpieza:   'M8 11h6v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9zM9 11V8h4v3M8 8V5h6l2 2M19 4h.01M21 6h.01M19 8h.01',
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

// Un renglón del menú puede quedar marcado en varias rutas: las solapas de una misma
// pantalla (Bandeja y Tablero, Subir Excel e Historial) y el detalle de una tarea.
function enRutas(pathname, rutas) {
  return rutas.some(r => pathname === r || pathname.startsWith(r + '/'));
}

function NavItem({ to, icon, label, rutas, end, onClick }) {
  const { pathname } = useLocation();
  const marcado = rutas ? enRutas(pathname, rutas) : null;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
         ${(marcado ?? isActive)
           ? 'bg-white/20 text-white'
           : 'text-white/70 hover:bg-white/10 hover:text-white'}`
      }
    >
      <Icono name={icon} />
      <span className="flex-1">{label}</span>
    </NavLink>
  );
}

function SectionLabel({ label }) {
  return <p className="px-3 pt-4 pb-1 text-xs font-semibold text-white/40 uppercase tracking-widest">{label}</p>;
}

// El título de cada marca: su ícono y su nombre, más marcado que una sección común.
function MarcaLabel({ icon, label, children }) {
  return (
    <p className="flex items-center gap-2 px-3 pt-5 pb-1.5 text-xs font-bold text-white uppercase tracking-wider">
      <Icono name={icon} small />
      <span className="flex-1">{label}</span>
      {children}
    </p>
  );
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

// El menú va por marca, como se mira el grupo: cada negocio con su bloque y el mismo
// formato (Dashboard y sus ventas), y abajo lo que es de todo el grupo. Dentro de Entre
// Dos el orden sigue el día: lo que pasó, los números, y al final lo que se carga.
export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const dueno = esDueno(user);

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
        {/* El logo lleva al inicio desde cualquier pantalla (y cierra el menú en el celular). */}
        <NavLink
          to="/"
          onClick={onClose}
          className="px-4 py-5 border-b border-white/10 flex items-center gap-3 hover:bg-white/10 transition-colors"
          aria-label="Ir al inicio"
        >
          <Logotipo claro />
        </NavLink>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

          {/* Quien solo carga su reporte de turno no ve la red */}
          {esDeTurno(user) && (
            <NavItem to="/" icon="reportes" label="Mi reporte de hoy" end />
          )}

          {esDeRed(user) && (
            <>
              <NavItem to="/" icon="inicio" label="Inicio" end />

              <MarcaLabel icon="alfajor" label="Entre Dos" />
              <NavItem to="/dia"         icon="dia"         label="Reporte del día" />
              <NavItem to="/tareas"      icon="tareas"      label="Tareas" rutas={rutasDe('tareas')} />
              <NavItem to="/reportes"    icon="reportes"    label="Reportes de los turnos" />
              {/* El dashboard y Finanzas son de los dueños: el Encargado General no ve ventas ni plata. */}
              {dueno && <NavItem to="/red"      icon="dashboard" label="Dashboard" />}
              {dueno && <NavItem to="/finanzas" icon="finanzas"  label="Finanzas" />}
              <NavItem to="/stock"       icon="stock"       label="Stock inteligente" />
              <NavItem to="/proveedores" icon="proveedores" label="Proveedores" />
              <NavItem to="/empleados"   icon="personal"    label="Empleados y horas" />
              <NavItem to="/calendario"  icon="calendario"  label="Calendario de trabajo" />
              <NavItem to="/ventas/importar" icon="importar" label="Ventas de Fudo" rutas={rutasDe('fudo')} />

              {dueno && (
                <>
                  <MarcaLabel icon="sarten" label="Kankay" />
                  <NavItem to="/marcas/kankay" icon="dashboard" label="Dashboard" end />
                  <NavItem to="/marcas/kankay/importar" icon="importar" label="Ventas de Dux" rutas={rutasDe('dux')} />

                  <MarcaLabel icon="limpieza" label="Senzen">
                    <span className="text-[10px] font-semibold normal-case tracking-normal px-1.5 rounded-full bg-white/10 text-white/50">pronto</span>
                  </MarcaLabel>
                  <NavItem to="/marcas/senzen" icon="dashboard" label="Próximamente" />
                </>
              )}

              <SectionLabel label="El grupo" />
              <NavItem to="/usuarios" icon="usuarios" label="Usuarios y accesos" />
              {dueno && (
                <>
                  <NavItem to="/locales"                icon="locales"     label="Locales" />
                  <NavItem to="/formularios"            icon="formularios" label="Formularios" />
                  <NavItem to="/admin/maestros/docenas" icon="docenas"     label="Maestros" rutas={rutasDe('maestros')} />
                </>
              )}
            </>
          )}

          {/* Fuera de los bloques de rol a propósito: el manual lo ve todo el mundo,
              y el que carga el reporte de su turno es justamente el que más lo necesita. */}
          {!esDeRed(user) && <SectionLabel label="Ayuda" />}
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
