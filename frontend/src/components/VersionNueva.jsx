import { useEffect, useState } from 'react';

// Instalado como app en el celular no hay botón de recargar, y Android la deja abierta días
// (3/11/2026: a Pepa no le aparecía un arreglo ya subido). Cuando el sistema vuelve a
// primer plano, y cada 10 minutos, se fija si el servidor tiene otra versión y avisa con un
// botón. No recarga solo: se perdería un formulario a medio llenar.

const scriptDe = html => html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] || null;

export default function VersionNueva() {
  const [hay, setHay] = useState(false);

  useEffect(() => {
    const actual = document.querySelector('script[type="module"][src^="/assets/index-"]')?.getAttribute('src');
    if (!actual) return; // en desarrollo no hay build
    let vivo = true;
    async function revisar() {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/', { cache: 'no-store' });
        const nuevo = scriptDe(await r.text());
        if (vivo && nuevo && nuevo !== actual) setHay(true);
      } catch { /* sin conexión: se vuelve a probar después */ }
    }
    revisar();
    const t = setInterval(revisar, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', revisar);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', revisar); };
  }, []);

  if (!hay) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-ahg-text text-white text-sm">
      <span className="flex-1">Hay una versión nueva del sistema.</span>
      <button onClick={() => window.location.reload()} className="rounded-lg bg-white text-ahg-text font-semibold px-3 py-1.5">
        Actualizar
      </button>
    </div>
  );
}
