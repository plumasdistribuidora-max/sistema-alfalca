import { useEffect, useRef } from 'react';

const SVG = {
  logo: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#4C1D95"/><text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="sans-serif" font-weight="500" font-size="24" letter-spacing="1">AHG</text></svg>',
  alfajor: '<svg viewBox="0 0 100 100"><defs><linearGradient id="aT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4329"/><stop offset="1" stop-color="#4a2c1a"/></linearGradient><linearGradient id="aS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3620"/><stop offset="1" stop-color="#3a2012"/></linearGradient><linearGradient id="aG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a94e"/><stop offset="1" stop-color="#d4882f"/></linearGradient><linearGradient id="aD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b5651f"/><stop offset="1" stop-color="#904913"/></linearGradient></defs><g transform="translate(50 50) scale(1.28) translate(-50 -50)"><ellipse cx="50" cy="84" rx="36" ry="6" fill="#000" opacity="0.1"/><path d="M16 40 C 14 44, 16 47, 15 51 C 17 55, 14 58, 16 62 C 15 66, 18 68, 17 71 C 30 79, 70 79, 83 71 C 82 68, 85 66, 84 62 C 86 58, 83 55, 85 51 C 84 47, 86 44, 84 40 Z" fill="url(#aS)"/><path d="M27 55 h46 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-46 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z" fill="url(#aG)"/><path d="M27 47 h46 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-46 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z" fill="url(#aD)"/><path d="M48 58 q2 3 4 0" fill="none" stroke="#904913" stroke-width="2" stroke-linecap="round"/><ellipse cx="50" cy="40" rx="34" ry="13" fill="url(#aT)"/><ellipse cx="50" cy="38" rx="34" ry="13" fill="#5e3a23"/><ellipse cx="44" cy="35" rx="14" ry="5" fill="#7a4f30" opacity="0.6"/></g></svg>',
  cafe: '<svg viewBox="0 0 100 100"><defs><linearGradient id="cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e2ded4"/></linearGradient><radialGradient id="co" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#7a4f2e"/><stop offset="1" stop-color="#3a2415"/></radialGradient></defs><ellipse cx="46" cy="82" rx="28" ry="5" fill="#000" opacity="0.1"/><ellipse cx="46" cy="79" rx="24" ry="5" fill="#d8d3c7"/><path d="M24 46 h44 v10 a22 24 0 0 1 -44 0 z" fill="url(#cu)"/><path d="M68 49 q13 -1 13 12 q0 13 -14 12.5 l0 -5 q9 0.5 9 -7.5 q0 -7.5 -8 -7 z" fill="#eceae2"/><ellipse cx="46" cy="46" rx="22" ry="7" fill="#2a1810"/><ellipse cx="46" cy="45" rx="22" ry="7" fill="url(#co)"/><ellipse cx="46" cy="44.5" rx="19" ry="5.5" fill="#6b4528"/><ellipse cx="40" cy="43" rx="8" ry="2.2" fill="#c9a06a" opacity="0.5"/><path d="M37 30 q-5 -8 0 -15" fill="none" stroke="#c9b8a8" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/><path d="M46 30 q-5 -8 0 -15" fill="none" stroke="#c9b8a8" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/><path d="M55 30 q-5 -8 0 -15" fill="none" stroke="#c9b8a8" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/></svg>',
  medialuna: '<span class="ahg-emoji">🥐</span>',
};

const seq = ['logo', 'alfajor', 'logo', 'cafe', 'logo', 'medialuna', 'logo'];

const STEP     = 850;
const SPIN_GAP = 6000;

export default function Home() {
  const ballRef = useRef(null);

  useEffect(() => {
    const ball = ballRef.current;
    if (!ball) return;

    const timers = [];

    ball.innerHTML = SVG[seq[0]];

    seq.forEach((key, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => ball.classList.add('ahg-flip'), STEP * i));
      timers.push(setTimeout(() => {
        ball.innerHTML = SVG[key];
        ball.classList.remove('ahg-flip');
      }, STEP * i + 400));
    });

    const spinStart = STEP * seq.length + 600;

    function spinLoop() {
      ball.animate(
        [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }],
        { duration: 1300, easing: 'ease-in-out' }
      );
    }

    timers.push(setTimeout(() => {
      spinLoop();
      const iv = setInterval(spinLoop, SPIN_GAP);
      timers.push({ _iv: iv });
    }, spinStart));

    return () => {
      timers.forEach(x => {
        if (x && x._iv) clearInterval(x._iv);
        else clearTimeout(x);
      });
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="ahg-stage">
        <div className="ahg-ball" ref={ballRef} />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-stone-900">Sistema ALFALCA</h1>
        <p className="text-stone-500">Elegí una opción del menú para empezar</p>
      </div>
    </div>
  );
}
