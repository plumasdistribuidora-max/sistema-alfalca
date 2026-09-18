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
      {/* La pieza de abajo a la derecha es un semicírculo, más corta que el cuadrado: esa asimetría le da vida. */}
      <path d="M53 53H100A23.5 23.5 0 0 1 53 53Z" />
    </svg>
  );
}

// Isotipo + "alfalca" + bajada. `claro` es para fondos oscuros (el menú).
// La palabra va en Rubik pesada, grande y apretada: es lo que manda en el logo.
export function Logotipo({ claro = false, tamano = 'md' }) {
  const iso  = tamano === 'lg' ? 'w-[72px] h-[72px]' : 'w-11 h-11';
  const nom  = tamano === 'lg' ? 'text-5xl' : 'text-[27px]';
  const baja = tamano === 'lg' ? 'text-base' : 'text-[11px]';
  return (
    <div className={`flex items-center gap-3 ${claro ? 'text-white' : 'text-ahg-text'}`}>
      <Isotipo className={`${iso} flex-shrink-0`} />
      <div className="leading-none">
        <p className={`${nom} font-extrabold`} style={{ fontFamily: 'Rubik, sans-serif', letterSpacing: '-0.03em', lineHeight: 1 }}>alfalca</p>
        <p className={`${baja} mt-1.5 ${claro ? 'text-white/60' : 'text-ahg-text/55'}`} style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
          grupo inversor · mendoza
        </p>
      </div>
    </div>
  );
}
