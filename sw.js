// =====================================================
// Service Worker — Schoonmaakplan GTE
// =====================================================
// Doel: foundation voor toekomstige push-notificaties + offline-fallback.
// Hou bewust minimaal: deze app draait altijd online tegen Firestore, dus
// we cachen niet aggressief — dat zou stale data riskeren.
//
// Dit bestand:
//   1. Vangt 'push'-events op (voor server-driven notificaties — vereist
//      een echte push-service zoals FCM/VAPID; nog niet geconfigureerd op
//      backend, maar de hook ligt klaar)
//   2. Vangt 'notificationclick' op zodat een tap op een notificatie de
//      app opent en focust
//   3. Vangt 'message' op zodat de app SW kan vragen een lokale notif
//      te tonen (workaround voor browsers die showNotification alleen
//      vanuit een SW toestaan)

const SW_VERSION = 'gte-cleaning-sw-v1';

self.addEventListener('install', (event) => {
  // Geen pre-caching; we activeren direct.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push-event: ontvangt server-driven notificaties wanneer FCM/VAPID is
// geconfigureerd. Voor nu logt 'm gewoon — geen backend die push verstuurt.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = { title: 'Schoonmaakplan', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Schoonmaakplan';
  const body = data.body || '';
  const options = {
    body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge,
    tag: data.tag || 'cleaning-shift',
    data: data.url ? { url: data.url } : undefined,
    requireInteraction: !!data.requireInteraction
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification-klik: open of focus de app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Bestaand venster gevonden → focus
      for (const client of clients) {
        if ('focus' in client) {
          try { client.focus(); } catch (e) {}
          return;
        }
      }
      // Anders: open nieuw venster
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Message-handler: app kan SW vragen lokale notif te tonen. Bv. bij
// shift-momenten via een setTimeout in de app.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'show-notification') {
    const title = msg.title || 'Schoonmaakplan';
    const options = {
      body: msg.body || '',
      icon: msg.icon || '/favicon.ico',
      tag: msg.tag || 'cleaning-shift',
      requireInteraction: !!msg.requireInteraction
    };
    self.registration.showNotification(title, options);
  }
});
