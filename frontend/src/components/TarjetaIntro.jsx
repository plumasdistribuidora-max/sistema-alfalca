// La tarjeta de presentación del grupo que abre el login: entra de espaldas,
// se da vuelta y muestra el frente con la marca. Después sube y deja lugar al
// formulario. El papel es una foto real de cartulina de algodón
// (public/marca/papel-*.jpg); el logo va hundido en el dorso y estampado en
// tinta en el frente. Los estilos y los tiempos están en index.css, bajo
// "Tarjeta del login".

const PIEZAS = (
  <>
    <path d="M0 47A47 47 0 0 1 47 0V47Z" />
    <path d="M53 0V47H100Z" />
    <rect x="0" y="53" width="47" height="47" />
    <path d="M53 53H100A23.5 23.5 0 0 1 53 53Z" />
  </>
);

// Sombra interior de un relieve: oscura del lado de la luz (arriba a la
// izquierda) y un brillo del otro lado, como queda el papel prensado.
function FiltroRelieve({ id, sombra, brillo }) {
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feOffset in="SourceAlpha" dx="1.4" dy="1.8" result="o1" />
      <feGaussianBlur in="o1" stdDeviation="1.1" result="b1" />
      <feComposite in="SourceAlpha" in2="b1" operator="out" result="s1" />
      <feFlood floodColor="#000" floodOpacity={sombra} />
      <feComposite in2="s1" operator="in" result="oscuro" />
      <feOffset in="SourceAlpha" dx="-1" dy="-1.2" result="o2" />
      <feGaussianBlur in="o2" stdDeviation=".8" result="b2" />
      <feComposite in="SourceAlpha" in2="b2" operator="out" result="s2" />
      <feFlood floodColor="#fff" floodOpacity={brillo} />
      <feComposite in2="s2" operator="in" result="claro" />
      <feMerge><feMergeNode in="oscuro" /><feMergeNode in="claro" /></feMerge>
    </filter>
  );
}

export default function TarjetaIntro() {
  return (
    <div className="tj-entra">
      <div className="tj-sombra" aria-hidden="true" />
      <div className="tj-tarjeta">
        <div className="tj-cara tj-dorso" aria-hidden="true">
          <svg viewBox="-4 -4 108 108" className="tj-hundido">
            <defs><FiltroRelieve id="tj-hundido" sombra={0.75} brillo={0.16} /></defs>
            <g fill="rgba(0,0,0,.22)">{PIEZAS}</g>
            <g fill="#000" filter="url(#tj-hundido)">{PIEZAS}</g>
          </svg>
        </div>
        <div className="tj-cara tj-frente">
          <svg viewBox="-4 -4 108 108" className="tj-iso" aria-hidden="true">
            <defs><FiltroRelieve id="tj-tinta" sombra={0.35} brillo={0.5} /></defs>
            <g fill="#3b2a24" className="tj-tinta">{PIEZAS}</g>
            <g fill="#000" filter="url(#tj-tinta)">{PIEZAS}</g>
          </svg>
          <div>
            <p className="tj-nombre">alfalca</p>
            <p className="tj-bajada">grupo inversor · mendoza</p>
          </div>
        </div>
      </div>
    </div>
  );
}
