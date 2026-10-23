import { useEffect, useRef, useState } from 'react';

// La cara de Claudia: un robot blanco con detalles en verde salvia, que saluda, sobre gris grafito.
// Imágenes hechas con Higgsfield en public/claudia: robot.jpg para el botón y la barra,
// robot-grande.jpg para el saludo del chat. Mientras piensa, un anillo late alrededor.
//
// Casi siempre es una foto quieta. Encima hay un video corto (robot-saludo) que empieza y termina
// en esa misma foto: cuando toca saludar se reproduce una vez y se vuelve a esconder, así parece
// que la foto cobra vida. `saludoCada` lo repite cada tantos ms; `saludarAlAparecer`, al montarse.
// Con "reducir movimiento" activado en el aparato no saluda nunca.

export default function AvatarClaudia({ tamano = 56, pensando = false, grande = false, saludoCada = 0, saludarAlAparecer = false, className = '' }) {
  const videoRef = useRef(null);
  const [saludando, setSaludando] = useState(false);

  useEffect(() => {
    if (!saludoCada && !saludarAlAparecer) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const saludar = () => {
      const v = videoRef.current;
      if (!v || document.visibilityState !== 'visible') return;
      v.currentTime = 0;
      v.play().then(() => setSaludando(true)).catch(() => {});
    };
    const inicio = saludarAlAparecer ? setTimeout(saludar, 350) : null;
    const repetir = saludoCada ? setInterval(saludar, saludoCada) : null;
    return () => { clearTimeout(inicio); clearInterval(repetir); };
  }, [saludoCada, saludarAlAparecer]);

  const anima = saludoCada || saludarAlAparecer;

  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: tamano, height: tamano }}>
      {pensando && <span className="absolute inset-0 rounded-full ring-2 ring-white/70 animate-ping" aria-hidden="true" />}
      <span className="absolute inset-0 rounded-full overflow-hidden bg-[#55585c]">
        <img
          src={grande ? '/claudia/robot-grande.jpg' : '/claudia/robot.jpg'}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="w-full h-full object-cover"
        />
        {anima && (
          <video
            ref={videoRef}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${saludando ? 'opacity-100' : 'opacity-0'}`}
            onEnded={() => setSaludando(false)}
          >
            <source src="/claudia/robot-saludo.webm" type="video/webm" />
            <source src="/claudia/robot-saludo.mp4" type="video/mp4" />
          </video>
        )}
      </span>
    </span>
  );
}
