/* eslint-disable */
/**
 * FCM background message handler. Firebase v11 compat SDK is loaded from the
 * official CDN. The public web config is passed through the registration URL by
 * apps/web/src/lib/firebase.ts (see swSrc) so nothing secret is committed here.
 *
 * Foreground messages are handled by the app itself via onForegroundPush(); this
 * worker only covers pushes delivered while the tab is closed or in the background.
 */

const FCM_SDK_VERSION = '11.10.0';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

importScripts(
  `https://www.gstatic.com/firebasejs/${FCM_SDK_VERSION}/firebase-app-compat.js`,
  `https://www.gstatic.com/firebasejs/${FCM_SDK_VERSION}/firebase-messaging-compat.js`,
);

const query = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: query.get('apiKey') || '',
  authDomain: query.get('authDomain') || '',
  projectId: query.get('projectId') || '',
  messagingSenderId: query.get('messagingSenderId') || '',
  appId: query.get('appId') || '',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const title = notification.title || (payload.data && payload.data.title) || 'VELORA';
  const options = {
    body: notification.body || (payload.data && payload.data.body) || '',
    image: notification.image || (payload.data && payload.data.image) || undefined,
    data: { ...(payload.data || {}), ...(payload.fcm || {}) },
    tag: (payload.data && payload.data.tag) || 'velora',
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
