
/**
 * Application configuration.
 *
 * Firebase Web SDK configuration is loaded at runtime from the Cloudflare
 * Worker endpoint, so production builds do not depend on local .env files.
 */

export const config = {
  apiBase: (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, ''),
  brand: 'VELORA',

  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    messagingSenderId:
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '',
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '',
  },
};

export let firebaseConfigured = Boolean(
  config.firebase.apiKey &&
  config.firebase.projectId &&
  config.firebase.appId,
);

export let databaseConfigured = Boolean(
  config.firebase.databaseURL,
);

let runtimeConfigPromise: Promise<void> | null = null;

/**
 * Load Firebase Web SDK configuration from the Cloudflare Worker.
 *
 * Safe to call multiple times: concurrent calls share one request.
 * Build-time values remain as fallback when available.
 */
export function loadRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = (async () => {
      try {
        const response = await fetch('/api/runtime-config', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(
            `Runtime config request failed: ${response.status}`,
          );
        }

        const result = (await response.json()) as {
          firebase?: Partial<typeof config.firebase>;
        };

        const runtime = result.firebase;

        if (runtime) {
          for (
            const key of Object.keys(config.firebase) as Array<
              keyof typeof config.firebase
            >
          ) {
            const value = runtime[key];

            if (typeof value === 'string' && value.trim()) {
              config.firebase[key] = value.trim();
            }
          }
        }
      } catch (error) {
        console.error(
          '[VELORA] Failed to load Firebase runtime configuration:',
          error,
        );
      } finally {
        firebaseConfigured = Boolean(
          config.firebase.apiKey &&
          config.firebase.projectId &&
          config.firebase.appId,
        );

        databaseConfigured = Boolean(
          config.firebase.databaseURL,
        );
      }
    })();
  }

  return runtimeConfigPromise;
}
