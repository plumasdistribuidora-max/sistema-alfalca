import { useEffect, useRef } from 'react';

export default function Home() {
  const sceneRef = useRef(null);
  const trailRef = useRef(null);
  const capRef   = useRef(null);

  useEffect(() => {
    var scene = sceneRef.current;
    var trail = trailRef.current;
    var cap   = capRef.current;
    if (!scene || !trail) return;

    var ICON = {
      logo: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#4C1D95"/><text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="sans-serif" font-weight="500" font-size="24" letter-spacing="1">AHG</text></svg>',
      alfajor: '<svg viewBox="0 0 100 100"><defs><linearGradient id="F_aT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4329"/><stop offset="1" stop-color="#4a2c1a"/></linearGradient><linearGradient id="F_aS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3620"/><stop offset="1" stop-color="#3a2012"/></linearGradient><linearGradient id="F_aG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a94e"/><stop offset="1" stop-color="#d4882f"/></linearGradient><linearGradient id="F_aD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b5651f"/><stop offset="1" stop-color="#904913"/></linearGradient></defs><g transform="translate(50 50) scale(1.28) translate(-50 -50)"><ellipse cx="50" cy="84" rx="36" ry="6" fill="#000" opacity="0.1"/><path d="M16 40 C 14 44, 16 47, 15 51 C 17 55, 14 58, 16 62 C 15 66, 18 68, 17 71 C 30 79, 70 79, 83 71 C 82 68, 85 66, 84 62 C 86 58, 83 55, 85 51 C 84 47, 86 44, 84 40 Z" fill="url(#F_aS)"/><path d="M27 55 h46 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-46 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z" fill="url(#F_aG)"/><path d="M27 47 h46 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-46 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z" fill="url(#F_aD)"/><path d="M48 58 q2 3 4 0" fill="none" stroke="#904913" stroke-width="2" stroke-linecap="round"/><ellipse cx="50" cy="40" rx="34" ry="13" fill="url(#F_aT)"/><ellipse cx="50" cy="38" rx="34" ry="13" fill="#5e3a23"/><ellipse cx="44" cy="35" rx="14" ry="5" fill="#7a4f30" opacity="0.6"/></g></svg>',
      cafe: '<svg viewBox="0 0 100 100"><defs><linearGradient id="F_cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e2ded4"/></linearGradient><radialGradient id="F_co" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#7a4f2e"/><stop offset="1" stop-color="#3a2415"/></radialGradient></defs><ellipse cx="46" cy="82" rx="28" ry="5" fill="#000" opacity="0.1"/><ellipse cx="46" cy="79" rx="24" ry="5" fill="#d8d3c7"/><path d="M24 46 h44 v10 a22 24 0 0 1 -44 0 z" fill="url(#F_cu)"/><path d="M68 49 q13 -1 13 12 q0 13 -14 12.5 l0 -5 q9 0.5 9 -7.5 q0 -7.5 -8 -7 z" fill="#eceae2"/><ellipse cx="46" cy="46" rx="22" ry="7" fill="#2a1810"/><ellipse cx="46" cy="45" rx="22" ry="7" fill="url(#F_co)"/><ellipse cx="46" cy="44.5" rx="19" ry="5.5" fill="#6b4528"/><ellipse cx="40" cy="43" rx="8" ry="2.2" fill="#c9a06a" opacity="0.5"/><path d="M37 30 q-5 -8 0 -15" fill="none" stroke="#c9b8a8" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/><path d="M46 30 q-5 -8 0 -15" fill="none" stroke="#c9b8a8" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/><path d="M55 30 q-5 -8 0 -15" fill="none" stroke="#c9b8a8" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/></svg>',
      medialuna: '<svg viewBox="0 0 100 100"><ellipse cx="50" cy="72" rx="36" ry="4" fill="#000" opacity="0.08"/><path d="M44 44 C 34 39, 22 41, 18 50 C 14 58, 17 67, 25 66 C 33 65, 40 56, 44 49 Z" fill="#F2BC3C"/><path d="M56 44 C 66 39, 78 41, 82 50 C 86 58, 83 67, 75 66 C 67 65, 60 56, 56 49 Z" fill="#F2BC3C"/><path d="M29 49 C 25 54, 24 60, 27 65" fill="none" stroke="#D9901F" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/><path d="M71 49 C 75 54, 76 60, 73 65" fill="none" stroke="#D9901F" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/><path d="M33 38 C 39 32, 61 32, 67 38 L 69 60 C 63 68, 37 68, 31 60 Z" fill="#EFA62E"/><path d="M33 40 C 38 43, 41 48, 41 54 C 36 52, 33 47, 31 41 Z" fill="#CE8519" opacity="0.6"/><path d="M67 40 C 62 43, 59 48, 59 54 C 64 52, 67 47, 69 41 Z" fill="#CE8519" opacity="0.6"/><path d="M43 38 C 46 34, 54 34, 57 38 L 58 58 C 54 63, 46 63, 42 58 Z" fill="#FBD05A"/><path d="M42 39 C 41 48, 41 54, 43 60" fill="none" stroke="#D9901F" stroke-width="2" stroke-linecap="round" opacity="0.65"/><path d="M58 39 C 59 48, 59 54, 57 60" fill="none" stroke="#D9901F" stroke-width="2" stroke-linecap="round" opacity="0.65"/><ellipse cx="50" cy="39" rx="12" ry="2.8" fill="#fff" opacity="0.28"/></svg>',
    };
    var BRAND = { alfajor: 'Entre Dos', cafe: 'Casa Entre Dos', medialuna: 'Hojaldre' };
    var timers = [];

    var Wpx, Hpx, CX, FLOOR, START;
    function measure() {
      Wpx  = scene.clientWidth;
      Hpx  = scene.clientHeight;
      CX   = Wpx / 2;
      FLOOR = Hpx * 0.72;
      START = -60;
      trail.setAttribute('viewBox', '0 0 ' + Wpx + ' ' + Hpx);
      trail.setAttribute('preserveAspectRatio', 'none');
    }

    function bouncePos(t, fromX, toX) {
      var x  = fromX + (toX - fromX) * t;
      var H1 = Hpx * 0.42, H2 = Hpx * 0.24, H3 = Hpx * 0.11;
      var arcs = [{ s: 0, e: 0.4, h: H1 }, { s: 0.4, e: 0.72, h: H2 }, { s: 0.72, e: 1, h: H3 }];
      var y = FLOOR;
      for (var i = 0; i < arcs.length; i++) {
        var a = arcs[i];
        if (t >= a.s && t <= a.e) {
          var lt = (t - a.s) / (a.e - a.s);
          y = FLOOR - a.h * 4 * lt * (1 - lt);
          break;
        }
      }
      return { x: x, y: y };
    }

    function makeLogo() {
      var d = document.createElement('div');
      d.className = 'ahg-logo-center';
      d.innerHTML = ICON.logo;
      scene.appendChild(d);
      return d;
    }

    function makeMover(key) {
      var d = document.createElement('div');
      d.className = 'ahg-mover';
      d.innerHTML = '<div class="ahg-ic">' + ICON[key] + '</div><div class="ahg-tag">' + BRAND[key] + '</div>';
      scene.appendChild(d);
      return d;
    }

    function animateBounce(el, dur, onArrive) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#4C1D95');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('opacity', '0.6');
      trail.appendChild(path);
      var start = null, dpath = '';
      function frame(ts) {
        if (!start) start = ts;
        var t = Math.min((ts - start) / dur, 1);
        var p = bouncePos(t, START, CX);
        el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        if (dpath === '') dpath = 'M ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        else dpath += ' L ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        path.setAttribute('d', dpath);
        if (t < 1) { requestAnimationFrame(frame); }
        else { if (onArrive) onArrive(path); }
      }
      requestAnimationFrame(frame);
    }

    function eraseLine(path) {
      if (!path) return;
      path.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
      setTimeout(function () { if (path.parentNode) path.remove(); }, 520);
    }

    function run() {
      scene.querySelectorAll('.ahg-mover,.ahg-logo-center').forEach(function (n) { n.remove(); });
      trail.innerHTML = '';
      if (cap) cap.textContent = '';
      measure();

      var DUR = 2200;
      var logo = makeLogo();
      animateBounce(logo, DUR, function (logoLine) {
        if (cap) cap.textContent = 'ALFALCA Holding Group';
        eraseLine(logoLine);
      });

      var prods = ['alfajor', 'cafe', 'medialuna'];
      var startAfter = DUR + 500;
      prods.forEach(function (key, i) {
        var t0 = startAfter + i * (DUR + 700);
        timers.push(setTimeout(function () {
          if (cap) cap.textContent = BRAND[key];
          var m = makeMover(key);
          animateBounce(m, DUR, function (linePath) {
            m.animate(
              [{ opacity: 1, transform: 'translate(' + CX + 'px,' + FLOOR + 'px) scale(1)' },
               { opacity: 0, transform: 'translate(' + CX + 'px,' + FLOOR + 'px) scale(0.15)' }],
              { duration: 350, easing: 'ease-in', fill: 'forwards' }
            );
            logo.animate(
              [{ transform: 'translate(' + CX + 'px,' + FLOOR + 'px) scale(1)' },
               { transform: 'translate(' + CX + 'px,' + FLOOR + 'px) scale(1.22)' },
               { transform: 'translate(' + CX + 'px,' + FLOOR + 'px) scale(1)' }],
              { duration: 450, easing: 'ease-out' }
            );
            setTimeout(function () { eraseLine(linePath); }, 400);
          });
        }, t0));
      });

      var settle = startAfter + prods.length * (DUR + 700) + 400;
      timers.push(setTimeout(function () {
        if (cap) cap.textContent = 'ALFALCA Holding Group';
        function spin() {
          logo.animate(
            [{ transform: 'translate(' + CX + 'px,' + FLOOR + 'px) rotateY(0deg)' },
             { transform: 'translate(' + CX + 'px,' + FLOOR + 'px) rotateY(360deg)' }],
            { duration: 1300, easing: 'ease-in-out' }
          );
        }
        spin();
        var iv = setInterval(spin, 6000);
        timers.push({ _iv: iv });
      }, settle));
    }

    var startTimer = setTimeout(run, 150);
    timers.push(startTimer);

    return function () {
      timers.forEach(function (x) {
        if (x && x._iv) { clearInterval(x._iv); }
        else { clearTimeout(x); }
      });
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="ahg-scene" ref={sceneRef}>
        <svg className="ahg-trail" ref={trailRef}></svg>
      </div>
      <p ref={capRef} style={{ fontSize: '11px', fontWeight: 500, color: '#4C1D95', minHeight: '18px', letterSpacing: '0.03em' }}></p>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-stone-900">Sistema ALFALCA</h1>
        <p className="text-stone-500">Elegí una opción del menú para empezar</p>
      </div>
    </div>
  );
}
