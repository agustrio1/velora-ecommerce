
/* eslint-disable */

/**
 * VELORA Firebase Cloud Messaging Service Worker.
 *
 * Handles background notifications when the application is closed
 * or running in the background.
 *
 * Firebase public configuration is passed through the service worker
 * registration URL. Never put service-account credentials here.
 */

const FCM_SDK_VERSION = '11.10.0';
const DEFAULT_NOTIFICATION_TITLE = 'VELORA';
const DEFAULT_NOTIFICATION_URL = '/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Load Firebase Compat SDK.
 */
importScripts(
  `https://www.gstatic.com/firebasejs/${FCM_SDK_VERSION}/firebase-app-compat.js`,
  `https://www.gstatic.com/firebasejs/${FCM_SDK_VERSION}/firebase-messaging-compat.js`,
);

/**
 * Read Firebase configuration from the registration URL.
 */
const query = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: query.get('apiKey') || '',
  authDomain: query.get('authDomain') || '',
  projectId: query.get('projectId') || '',
  storageBucket: query.get('storageBucket') || '',
  messagingSenderId: query.get('messagingSenderId') || '',
  appId: query.get('appId') || '',
  measurementId: query.get('measurementId') || '',
};

/**
 * Initialize Firebase only when the required configuration exists.
 */
const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId,
);

let messaging = null;

if (firebaseConfigured) {
  firebase.initializeApp(firebaseConfig);
  messaging = firebase.messaging();
}

/**
 * Handle background Firebase messages.
 */
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};

    const title =
      notification.title ||
      data.title ||
      DEFAULT_NOTIFICATION_TITLE;

    const options = {
      body:
        notification.body ||
        data.body ||
        '',

      icon: data.icon || '/favicon.svg',

      badge: data.badge || '/favicon.svg',

      image:
        notification.image ||
        data.image ||
        undefined,

      data: {
        ...data,
        ...(payload.fcm || {}),
      },

      tag: data.tag || 'velora',

      renotify: false,
    };

    self.registration.showNotification(title, options);
  });
}

/**
 * Resolve a safe internal navigation URL.
 */
function resolveNotificationUrl(value) {
  try {
    const url = new URL(
      value || DEFAULT_NOTIFICATION_URL,
      self.location.origin,
    );

    if (url.origin !== self.location.origin) {
      return DEFAULT_NOTIFICATION_URL;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_NOTIFICATION_URL;
  }
}

/**
 * Handle notification clicks.
 *
 * Focus an existing Velora tab when possible.
 * Otherwise open a new application tab.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = resolveNotificationUrl(
    event.notification.data?.link,
  );

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (!('focus' in client)) {
            continue;
          }

          try {
            await client.navigate(targetUrl);
            return client.focus();
          } catch {
            // Try another available client.
          }
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
