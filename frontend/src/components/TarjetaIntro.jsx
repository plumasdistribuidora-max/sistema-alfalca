// La tarjeta de presentación del grupo que abre el login: entra de espaldas,
// se da vuelta y muestra el frente con la marca. Después sube y deja lugar al
// formulario. El papel es una foto real de cartulina de algodón
// (public/marca/papel-grafito.jpg); el logo va hundido en el dorso y estampado en
// tinta blanca en el frente. Los estilos y los tiempos están en index.css, bajo
// "Tarjeta del login".
//
// Con `halloween` (del 28/10 al 31/10) la tarjeta es de cartulina negra, la tinta
// es naranja calabaza, tiene una telaraña en la esquina y salen murciélagos
// de atrás cuando se da vuelta.

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

// Telaraña de esquina: hilos que salen del rincón y vueltas que los cruzan.
const TELARANA = (
  <svg viewBox="0 0 60 60" className="tj-telarana" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth=".7" strokeLinecap="round">
      <path d="M60 0L0 0M60 0L8 34M60 0L26 54M60 0L60 60M60 0L44 58" />
      <path d="M48 0Q50 7 53.5 9.5Q56 13 60 14" />
      <path d="M34 0Q38 12 43 16Q49 24 50.5 28Q56 29 60 30" />
      <path d="M18 0Q24 17 30 23Q38 36 39 44Q51 44 60 46" />
    </g>
  </svg>
);

const MURCIELAGO = 'M0 3Q4 0 8 3Q10 1.5 11.5 3L12 1.2L13 2.6L14 1.2L14.5 3Q16 1.5 18 3Q22 0 26 3Q22 4 21 8Q19 5.5 16.5 7Q15 5 13 9Q11 5 9.5 7Q7 5.5 5 8Q4 4 0 3Z';

export default function TarjetaIntro({ halloween = false }) {
  return (
    <div className={`tj-entra ${halloween ? 'tj-halloween' : ''}`}>
      {halloween && [1, 2, 3].map(n => (
        <svg key={n} viewBox="0 0 26 10" className={`tj-murcielago tj-m${n}`} aria-hidden="true">
          <path d={MURCIELAGO} />
        </svg>
      ))}
      <div className="tj-sombra" aria-hidden="true" />
      <div className="tj-tarjeta">
        <div className="tj-cara tj-dorso" aria-hidden="true">
          <svg viewBox="-4 -4 108 108" className="tj-hundido">
            <defs><FiltroRelieve id="tj-hundido" sombra={0.75} brillo={0.16} /></defs>
            <g fill="rgba(0,0,0,.22)">{PIEZAS}</g>
            <g fill="#000" filter="url(#tj-hundido)">{PIEZAS}</g>
          </svg>
          {halloween && TELARANA}
        </div>
        <div className="tj-cara tj-frente">
          <svg viewBox="-4 -4 108 108" className="tj-iso" aria-hidden="true">
            <defs><FiltroRelieve id="tj-tinta" sombra={0.35} brillo={0.5} /></defs>
            <g className="tj-tinta">{PIEZAS}</g>
            <g fill="#000" filter="url(#tj-tinta)">{PIEZAS}</g>
          </svg>
          <div>
            <p className="tj-nombre">alfalca</p>
            <p className="tj-bajada">{halloween ? 'feliz halloween · mendoza' : 'grupo inversor · mendoza'}</p>
            <p className="tj-est">{halloween ? '31 · 10 · 2026' : 'Est. 2023'}</p>
          </div>
          {halloween && TELARANA}
        </div>
      </div>
    </div>
  );
}
