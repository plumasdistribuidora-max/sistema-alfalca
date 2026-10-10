// Avisos en el celular.
//
// En Android alcanza con dar permiso desde Chrome. En iPhone el aviso solo funciona si
// el sistema está agregado a la pantalla de inicio y se abre desde ese ícono (iOS 16.4
// o más nuevo): desde Safari común no hay forma.

import api from '../api';

export const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const estaInstalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const soportaAvisos = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Qué le pasa a este aparato: listo | activo | bloqueado | falta_instalar | no_soporta
export async function estadoAvisos() {
  if (esIOS() && !estaInstalada()) return 'falta_instalar';
  if (!soportaAvisos()) return 'no_soporta';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activo' : 'listo';
}

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function base64AUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Tiene que llamarse desde un toque del usuario: iPhone no deja pedir permiso solo.
export async function activarAvisos() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error(permiso === 'denied'
    ? 'Los avisos quedaron bloqueados. Hay que habilitarlos desde la configuración del celular.'
    : 'No se dio el permiso para los avisos.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { data } = await api.get('/avisos/clave');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(data.data.clave) });
  }
  await api.post('/avisos/suscribir', { suscripcion: sub.toJSON() });
}

// Al cerrar sesión: este aparato deja de recibir avisos de esta persona.
export async function desactivarAvisos() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    await api.post('/avisos/desuscribir', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* cerrar sesión no puede fallar por esto */ }
}
