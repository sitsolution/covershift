/**
 * Web Push subscription management for the Covershift admin panel.
 *
 * Flow:
 *  1. After login, call subscribeWebPush().
 *  2. Browser shows a "Allow notifications?" prompt (once per origin).
 *  3. On approval the browser creates a PushSubscription and we POST it to
 *     the backend (/users/me/web-push-subscription).
 *  4. The backend uses pywebpush + VAPID to send pushes whenever notify() fires.
 *  5. The service worker (public/sw.js) displays the notification in the background.
 *
 * The VAPID public key comes from the backend (/users/me/vapid-public-key), so
 * rotating the key pair in the backend .env needs no frontend change: a browser
 * subscribed with an old key is re-subscribed with the current one.
 */

import api from './api';

async function fetchVapidPublicKey(): Promise<string | null> {
  const { data } = await api.get<{ vapidPublicKey: string }>('/users/me/vapid-public-key');
  return data.vapidPublicKey || null;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const bytes = new Uint8Array(a);
  return bytes.every((value, i) => value === b[i]);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function sendSubscriptionToBackend(sub: PushSubscription): Promise<void> {
  const p256dhBuffer = sub.getKey('p256dh');
  const authBuffer = sub.getKey('auth');

  await api.post('/users/me/web-push-subscription', {
    endpoint: sub.endpoint,
    p256dhKey: p256dhBuffer ? arrayBufferToBase64(p256dhBuffer) : '',
    authKey: authBuffer ? arrayBufferToBase64(authBuffer) : '',
  });
}

export async function subscribeWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return;   // web push not configured on the server
    const serverKey = urlBase64ToUint8Array(publicKey);

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Already subscribed with the current key: just re-sync with the backend.
    // Subscribed with an old key: pushes signed by the new key would be
    // rejected, so drop it and subscribe again.
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      if (sameKey(existing.options.applicationServerKey, serverKey)) {
        await sendSubscriptionToBackend(existing);
        return;
      }
      await existing.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey as BufferSource,
    });

    await sendSubscriptionToBackend(subscription);
  } catch (err) {
    // Permission denied or SW registration failed — non-fatal
    console.warn('[WebPush] Subscription failed:', err);
  }
}

export async function unsubscribeWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await api.delete('/users/me/web-push-subscription', {
      data: { endpoint: subscription.endpoint },
    });

    await subscription.unsubscribe();
  } catch (err) {
    console.warn('[WebPush] Unsubscribe failed:', err);
  }
}
