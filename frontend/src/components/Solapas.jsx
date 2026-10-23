import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { esDueno } from '../utils/roles';

// Pantallas que en el menú son un solo renglón y adentro se separan en solapas: cada
// solapa sigue siendo su propia ruta (así los avisos y los enlaces guardados siguen andando).
// Si al usuario le queda una sola solapa, no se dibuja la barra.
export const GRUPOS = {
  tareas: [
    { to: '/tareas',  label: 'Tablero', end: true },
    { to: '/tablero', label: 'Números', soloDueno: true },
  ],
  fudo: [
    { to: '/ventas/importar',   label: 'Subir Excel' },
    { to: '/historial-imports', label: 'Historial' },
  ],
  dux: [
    { to: '/marcas/kankay/importar',  label: 'Subir Excel' },
    { to: '/marcas/kankay/historial', label: 'Historial' },
  ],
  maestros: [
    { to: '/admin/maestros/docenas', label: 'Docenas' },
    { to: '/admin/maestros/cafe',    label: 'Café' },
    { to: '/admin/maestros/cocina',  label: 'Cocina' },
  ],
};

export function rutasDe(grupo) {
  return GRUPOS[grupo].map(s => s.to);
}

export default function Solapas({ grupo, children }) {
  const { user } = useAuth();
  const solapas = GRUPOS[grupo].filter(s => !s.soloDueno || esDueno(user));
  return (
    <>
      {solapas.length > 1 && (
        <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
          {solapas.map(s => (
            <NavLink key={s.to} to={s.to} end={s.end}
              className={({ isActive }) => `px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive ? 'border-ahg-primary text-ahg-text' : 'border-transparent text-stone-500 hover:text-ahg-text'}`}>
              {s.label}
            </NavLink>
          ))}
        </div>
      )}
      {children}
    </>
  );
}
