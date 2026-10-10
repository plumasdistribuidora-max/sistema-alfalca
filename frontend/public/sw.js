// Service worker de Alfalca: solo recibe los avisos y abre la pantalla que corresponde.
// No guarda nada en caché: el sistema siempre se carga del servidor.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titulo: 'Alfalca', texto: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.titulo || 'Alfalca', {
    body: d.texto || '',
    icon: '/marca/app-192.png',
    badge: '/marca/badge-96.png',
    tag: d.etiqueta || undefined,
    renotify: !!d.etiqueta,
    data: { url: d.url || '/' },
  }));
});

// Al tocar el aviso: si el sistema ya está abierto, lo trae adelante en esa pantalla;
// si no, lo abre. Si la sesión se venció, el sistema pide la contraseña y vuelve acá.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abiertas) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        try { await c.navigate(url); } catch { /* iOS no siempre deja navegar: queda adelante igual */ }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
