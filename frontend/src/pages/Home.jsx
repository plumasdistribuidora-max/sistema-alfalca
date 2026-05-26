import { useEffect, useRef } from 'react';
import logo from '../assets/logo.svg';

export default function Home() {
  const logoRef = useRef(null);

  useEffect(() => {
    const el = logoRef.current;
    if (!el) return;

    function limpiar(cb) {
      el.classList.remove('caida', 'giro');
      void el.offsetWidth;
      if (cb) cb();
    }

    function caer()  { limpiar(() => el.classList.add('caida')); }
    function girar() {
      if (el.classList.contains('caida')) return;
      limpiar(() => el.classList.add('giro'));
    }

    function onAnimEnd() { el.classList.remove('caida', 'giro'); }
    el.addEventListener('animationend', onAnimEnd);

    caer();
    const timer = setInterval(girar, 6000);

    return () => {
      clearInterval(timer);
      el.removeEventListener('animationend', onAnimEnd);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <img ref={logoRef} src={logo} alt="ALFALCA" className="logo-ahg w-24 h-24" />
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-stone-900">Sistema ALFALCA</h1>
        <p className="text-stone-500">Elegí una opción del menú para empezar</p>
      </div>
    </div>
  );
}
