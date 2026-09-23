import { Link, Navigate, useParams } from 'react-router-dom';
import { MARCAS } from '../marcas';

// Las marcas que todavía no tienen dashboard caen acá, desde el menú o desde su tarjeta del inicio.
export default function MarcaProximamente() {
  const { slug } = useParams();
  const marca = MARCAS.find(m => m.slug === slug);
  // Una marca que ya tiene su dashboard (o una que no existe) no se queda en esta página.
  if (!marca || !marca.proximamente) return <Navigate to={marca?.to || '/'} replace />;

  return (
    <div className="card max-w-md mx-auto mt-10 px-8 py-10 text-center">
      <div className="h-24 rounded-xl flex items-center justify-center overflow-hidden mb-6" style={{ background: marca.fondo }}>
        <img src={marca.logo} alt={marca.nombre} className="w-auto max-w-[90%] object-contain" style={{ height: marca.alto || 84 }} />
      </div>
      <h1 className="text-xl font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>
        {marca.nombre} · Próximamente
      </h1>
      <p className="text-sm text-ahg-text/60 mt-2 leading-relaxed">
        Estamos armando el dashboard de {marca.nombre}. Cuando esté listo vas a ver acá sus ventas,
        igual que con Entre Dos.
      </p>
      <Link to="/" className="inline-block mt-6 px-4 py-2.5 rounded-xl bg-ahg-primary text-white text-sm font-semibold hover:bg-ahg-secondary transition-colors">
        Volver al inicio
      </Link>
    </div>
  );
}
