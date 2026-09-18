// La marca del holding: el isotipo son cuatro piezas distintas (cuarto de círculo,
// triángulo, cuadrado, semicírculo) que arman un solo cuadrado — cuatro socios, una
// cosa. Va en vector y toma el color del texto, así sirve en blanco sobre el menú
// y en gris sobre fondo claro sin dos archivos.

export function Isotipo({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      <path d="M0 47A47 47 0 0 1 47 0V47Z" />
      <path d="M53 0V47H100Z" />
      <rect x="0" y="53" width="47" height="47" />
      <path d="M53 53H100A47 47 0 0 1 53 100Z" />
    </svg>
  );
}

// Isotipo + "alfalca" + bajada. `claro` es para fondos oscuros (el menú).
export function Logotipo({ claro = false, tamano = 'md' }) {
  const iso  = tamano === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  const nom  = tamano === 'lg' ? 'text-3xl' : 'text-lg';
  const baja = tamano === 'lg' ? 'text-sm'  : 'text-[10px]';
  return (
    <div className={`flex items-center gap-3 ${claro ? 'text-white' : 'text-ahg-text'}`}>
      <Isotipo className={`${iso} flex-shrink-0`} />
      <div className="leading-none">
        <p className={`${nom} font-extrabold tracking-tight`} style={{ fontFamily: 'Nunito, sans-serif' }}>alfalca</p>
        <p className={`${baja} mt-1 ${claro ? 'text-white/60' : 'text-ahg-text/55'}`} style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, letterSpacing: '0.02em' }}>
          grupo inversor · mendoza
        </p>
      </div>
    </div>
  );
}
