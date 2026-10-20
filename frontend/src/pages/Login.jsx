import { useLayoutEffect, useRef, useState } from 'react';
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
  const escenaRef               = useRef(null);
  const formRef                 = useRef(null);

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
      className={`min-h-screen flex items-center justify-center bg-ahg-bg px-4 overflow-hidden ${anima ? 'tj-anima' : ''}`}
      onPointerDown={() => setAnima(false)}
    >
      <div className="w-full max-w-sm">
        <div ref={escenaRef} className="tj-escena mb-10">
          <TarjetaIntro />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="tj-form card p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@alfalca.com.ar"
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
