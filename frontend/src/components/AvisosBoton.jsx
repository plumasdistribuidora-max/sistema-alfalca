import { useEffect, useState } from 'react';
import api from '../api';
import { estadoAvisos, activarAvisos, esIOS } from '../utils/avisos';

// Activar los avisos en este celular. Se muestra solo mientras falte hacer algo:
// cuando ya están activos queda una línea chica con el botón de prueba.
export default function AvisosBoton() {
  const [estado, setEstado] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { estadoAvisos().then(setEstado).catch(() => setEstado('no_soporta')); }, []);

  async function activar() {
    setTrabajando(true); setError(''); setMsg('');
    try {
      await activarAvisos();
      setEstado('activo');
      await api.post('/avisos/prueba').catch(() => {});
      setMsg('Listo. Te mandamos un aviso de prueba.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'No se pudieron activar los avisos');
      estadoAvisos().then(setEstado).catch(() => {});
    } finally {
      setTrabajando(false);
    }
  }

  async function probar() {
    setMsg(''); setError('');
    try { await api.post('/avisos/prueba'); setMsg('Aviso de prueba enviado.'); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo mandar'); }
  }

  if (!estado || estado === 'no_soporta') return null;

  if (estado === 'activo') {
    return (
      <div className="flex items-center gap-3 text-xs text-ahg-text/60 flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-600" />Avisos activados en este celular</span>
        <button onClick={probar} className="underline hover:text-ahg-text">Mandar uno de prueba</button>
        {msg && <span className="text-emerald-700">{msg}</span>}
        {error && <span className="text-red-700">{error}</span>}
      </div>
    );
  }

  return (
    <div className="card p-4 border-ahg-primary/40">
      <p className="font-bold text-ahg-text" style={{ fontFamily: 'Nunito, sans-serif' }}>Recibí los avisos en el celular</p>
      {estado === 'falta_instalar' ? (
        <div className="text-sm text-ahg-text/70 mt-1 space-y-1">
          <p>En iPhone los avisos llegan solo si el sistema está en la pantalla de inicio:</p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>Tocá el botón <b>Compartir</b> de Safari (el cuadrado con la flecha hacia arriba).</li>
            <li>Elegí <b>Agregar a pantalla de inicio</b> y después <b>Agregar</b>.</li>
            <li>Abrí Alfalca desde ese ícono nuevo y volvé a esta pantalla para tocar <b>Activar avisos</b>.</li>
          </ol>
        </div>
      ) : estado === 'bloqueado' ? (
        <p className="text-sm text-ahg-text/70 mt-1">
          Los avisos están bloqueados para este sitio. {esIOS()
            ? 'Habilitalos en Configuración → Notificaciones → Alfalca.'
            : 'Habilitalos tocando el candado de la barra de direcciones → Permisos → Notificaciones.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-ahg-text/70 mt-1">Te llega el reporte de cada día y lo que haya para aprobar o responder, aunque no tengas el sistema abierto.</p>
          <button onClick={activar} disabled={trabajando} className="btn-primary mt-3">{trabajando ? 'Activando…' : 'Activar avisos'}</button>
        </>
      )}
      {msg && <p className="text-sm text-emerald-700 mt-2">{msg}</p>}
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
