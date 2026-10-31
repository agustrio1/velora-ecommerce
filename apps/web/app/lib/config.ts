/** Runtime config read from Vite env at build time. */
export const config = {
  apiBase: (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, ''),
  brand: 'VELORA',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '',
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '',
  },
};

/** Firebase web auth is optional: browsing the store must work fully offline. */
export const firebaseConfigured = Boolean(config.firebase.apiKey && config.firebase.projectId && config.firebase.appId);

export const databaseConfigured = Boolean(config.firebase.databaseURL);
