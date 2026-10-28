import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import TarjetaIntro from '../components/TarjetaIntro';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login }               = useAuth();
  const navigate                = useNavigate();
  const [params]                = useSearchParams();
  // La tarjeta arranca en el medio de la pantalla y sube hasta su lugar: la
  // distancia depende del alto del formulario, por eso se mide.
  const [anima, setAnima]       = useState(true);
  // Del 28/10 al 31/10 la tarjeta se disfraza de Halloween; el 1/11 vuelve la
  // de siempre. ?tema=halloween la muestra cualquier día para verla.
  const hoy = new Date();
  const halloween = params.get('tema') === 'halloween' ||
    (hoy.getFullYear() === 2026 && hoy.getMonth() === 9 && hoy.getDate() >= 28);
  const escenaRef               = useRef(null);
  const formRef                 = useRef(null);
  // Safari abre solo el cartel de contraseñas guardadas apenas ve un campo de
  // login (aunque esté bloqueado, y también en navegación privada) y tapa la
  // tarjeta. Hasta que la persona toca, en vez de campos hay recuadros con el
  // mismo aspecto; al tocar uno se ponen los campos de verdad y se le da el foco
  // en el mismo toque, así en el celular se abre el teclado.
  const [campos, setCampos]     = useState(false);
  const emailRef                = useRef(null);
  const claveRef                = useRef(null);
  function activar(cual) {
    flushSync(() => setCampos(true));
    (cual === 'clave' ? claveRef : emailRef).current?.focus();
  }

  // La animación espera a que esté la foto del papel (si tarda más de 1,5 s,
  // arranca igual con el gris de fondo).
  const [papel, setPapel]       = useState(false);
  useEffect(() => {
    const img = new Image();
    const listo = () => setPapel(true);
    img.onload = listo; img.onerror = listo;
    img.src = '/marca/papel-grafito.jpg';
    if (img.complete) listo();
    const t = setTimeout(listo, 1500);
    return () => clearTimeout(t);
  }, []);

  useLayoutEffect(() => {
    if (!escenaRef.current || !formRef.current) return;
    const baja = (formRef.current.offsetHeight + 40) / 2;
    escenaRef.current.style.setProperty('--tj-baja', `${baja}px`);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.data.token, res.data.data.user);
      // Si llegó acá desde un aviso con la sesión vencida, vuelve a esa pantalla.
      const volver = params.get('volver');
      navigate(volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 overflow-hidden ${halloween ? 'tj-noche' : 'bg-ahg-bg'} ${anima ? 'tj-anima' : ''} ${papel ? '' : 'tj-espera'}`}
      onPointerDown={() => setAnima(false)}
    >
      <div className="w-full max-w-sm">
        <div ref={escenaRef} className="tj-escena mb-10">
          <TarjetaIntro halloween={halloween} />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="tj-form card p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="label">Email</label>
            {campos ? (
              <input
                ref={emailRef}
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@alfalca.com.ar"
                autoComplete="username"
                required
              />
            ) : (
              <div role="textbox" tabIndex={0} className="input text-ahg-text/40 cursor-text"
                onClick={() => activar('email')} onFocus={() => activar('email')}>
                usuario@alfalca.com.ar
              </div>
            )}
          </div>
          <div>
            <label className="label">Contraseña</label>
            {campos ? (
              <input
                ref={claveRef}
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            ) : (
              <div role="textbox" tabIndex={0} className="input text-ahg-text/40 cursor-text"
                onClick={() => activar('clave')} onFocus={() => activar('clave')}>
                ••••••••
              </div>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}
            onClick={e => { if (!campos) { e.preventDefault(); activar('email'); } }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
