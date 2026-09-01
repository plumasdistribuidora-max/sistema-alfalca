import { useAuth } from '../contexts/AuthContext';
import { rolLabel, AREA_LABEL } from '../utils/roles';

const HOY = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long',
});

export default function MiTurno() {
  const { user } = useAuth();
  const fecha = HOY.format(new Date());

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="rounded-2xl px-6 py-6" style={{ background: '#4C1D95' }}>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: '10px', fontWeight: 600 }}>
          {fecha}
        </p>
        <h1 className="text-2xl font-bold text-white mt-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Hola, {user?.nombre?.split(' ')[0]}
        </h1>
        <p className="text-white/70 text-sm mt-1">
          {user?.local_nombre || 'Alfalca'}
          {user?.area && ` · ${AREA_LABEL[user.area] || user.area}`}
        </p>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-ahg-text/40 mb-2">
          Tu acceso
        </p>
        <p className="text-sm text-ahg-text/70">
          Entrás como <strong className="text-ahg-text">{rolLabel(user?.rol)}</strong>.
          Cuando esté lista la carga de reportes vas a ver acá el de tu turno, y lo completás
          desde el celular al terminar.
        </p>
      </div>

      <div className="card p-5 border-dashed">
        <p className="text-xs font-semibold uppercase tracking-widest text-ahg-text/40 mb-2">
          En camino
        </p>
        <p className="text-sm text-ahg-text/60">
          El formulario de tu turno todavía no está habilitado. Por ahora seguí pasando el
          reporte como lo venís haciendo.
        </p>
      </div>
    </div>
  );
}
