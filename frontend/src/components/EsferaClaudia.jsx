import { useEffect, useRef } from 'react';

// La cara de Claudia: una esfera holográfica blanca, estilo Jarvis. Es un video de 5 segundos
// hecho con Higgsfield (Seedance 2.5) que empieza y termina en el mismo cuadro, así el loop no
// salta. Los archivos están en public/claudia: el video chico en webm y mp4, y un cuadro fijo
// para cuando todavía no cargó o el aparato tiene "reducir movimiento" activado.
// Cuando piensa, el video va al doble de velocidad.

const VEL = 1;
const VEL_PENSANDO = 2;

export default function EsferaClaudia({ tamano = 56, pensando = false, className = '' }) {
  const videoRef = useRef(null);
  const quieta = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = pensando ? VEL_PENSANDO : VEL;
  }, [pensando]);

  return (
    <span className={`relative inline-block shrink-0 rounded-full overflow-hidden bg-black ${className}`} style={{ width: tamano, height: tamano }}>
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        autoPlay={!quieta}
        preload="auto"
        poster="/claudia/esfera.jpg"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110"
        onLoadedMetadata={e => { e.currentTarget.playbackRate = pensando ? VEL_PENSANDO : VEL; }}
      >
        <source src="/claudia/esfera.webm" type="video/webm" />
        <source src="/claudia/esfera.mp4" type="video/mp4" />
      </video>
    </span>
  );
}
