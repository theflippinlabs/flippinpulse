/* Novarys service worker — handles Web Push and click-through. */
self.addEventListener('push', (event) => {
  let data = { title: 'Novarys', body: '' , url: '/app' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) { /* fallback used above */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Novarys', {
      body: data.body || '',
      icon: '/apple-icon.png',
      badge: '/apple-icon.png',
      data: { url: data.url || '/app' },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client && client.url.endsWith(url)) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
