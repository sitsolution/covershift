/**
 * Coverline Admin — Web Push Service Worker
 *
 * Handles incoming push events (background) and notification click navigation.
 * Served from /sw.js (Vite public/ directory).
 */

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Coverline', body: event.data.text(), data: {} };
  }

  const title = payload.title || 'Coverline';
  const options = {
    body: payload.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-48.png',
    data: payload.data || {},
    requireInteraction: false,
    tag: payload.data?.entity_type
      ? `${payload.data.entity_type}-${payload.data.entity_id}`
      : 'coverline',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const data = event.notification.data || {};
  let path = '/dashboard';

  if (data.entity_type === 'shift')        path = `/shifts/${data.entity_id}`;
  else if (data.entity_type === 'application') path = `/bookings/${data.entity_id}`;
  else if (data.entity_type === 'document')    path = '/documents';
  else if (data.entity_type === 'payment')     path = '/billing';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(path);
            return client.focus();
          }
        }
        return clients.openWindow(path);
      }),
  );
});
