
import {
  type FirebaseApp,
  getApps,
  initializeApp,
} from 'firebase/app';

import {
  type Auth,
  EmailAuthProvider,
  GoogleAuthProvider,
  type User,
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';

import {
  type MessagePayload,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';

import { config, firebaseConfigured } from './config';

/**
 * Firebase is used for client-side authentication and web push.
 *
 * Configuration is loaded at runtime from the Cloudflare Worker.
 * The Worker independently verifies every Firebase ID token and
 * derives authorization roles from D1.
 *
 * When Firebase is unavailable, public store browsing remains available.
 */

let app: FirebaseApp | null = null;
let authRef: Auth | null = null;

/**
 * Initialize Firebase lazily.
 *
 * This function must only be called after runtime configuration
 * has been loaded.
 */
function ensureApp(): FirebaseApp {
  if (app) {
    return app;
  }

  const existing = getApps();

  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  app = initializeApp({
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    storageBucket: config.firebase.storageBucket,
    messagingSenderId: config.firebase.messagingSenderId,
    appId: config.firebase.appId,
    measurementId: config.firebase.measurementId,
    databaseURL: config.firebase.databaseURL,
  });

  return app;
}

/**
 * Require a configured Firebase application.
 */
function requireApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase belum dikonfigurasi. Periksa Cloudflare Firebase runtime configuration.',
    );
  }

  return ensureApp();
}

/**
 * Get Firebase Auth instance.
 */
function requireAuth(): Auth {
  if (!authRef) {
    authRef = getAuth(requireApp());
  }

  return authRef;
}

/**
 * Check whether Firebase configuration is available.
 */
export function isFirebaseReady(): boolean {
  return firebaseConfigured;
}

/**
 * Subscribe to Firebase authentication state.
 */
export function subscribeAuth(
  cb: (user: User | null) => void,
): () => void {
  if (!firebaseConfigured) {
    cb(null);
    return () => undefined;
  }

  return onAuthStateChanged(requireAuth(), cb);
}

/**
 * Get current Firebase ID token.
 *
 * Returns null when the user is signed out or Firebase is unavailable.
 */
export async function currentIdToken(
  force = false,
): Promise<string | null> {
  if (!firebaseConfigured) {
    return null;
  }

  const user = requireAuth().currentUser;

  if (!user) {
    return null;
  }

  return user.getIdToken(force);
}

/**
 * Sign in using email and password.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(
    requireAuth(),
    email.trim(),
    password,
  );

  return credential.user;
}

/**
 * Register a new account.
 */
export async function register(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(
    requireAuth(),
    email.trim(),
    password,
  );

  if (name.trim()) {
    await updateProfile(credential.user, {
      displayName: name.trim(),
    });
  }

  return credential.user;
}

/**
 * Sign in using Google OAuth popup.
 */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: 'select_account',
  });

  const credential = await signInWithPopup(
    requireAuth(),
    provider,
  );

  return credential.user;
}

/**
 * Send password reset email.
 */
export async function requestReset(
  email: string,
): Promise<void> {
  await sendPasswordResetEmail(
    requireAuth(),
    email.trim(),
  );
}

/**
 * Check whether the current account has an email/password provider.
 */
export function hasPasswordProvider(): boolean {
  if (!firebaseConfigured) {
    return false;
  }

  const user = requireAuth().currentUser;

  return Boolean(
    user?.providerData.some(
      (provider) => provider.providerId === 'password',
    ),
  );
}

/**
 * Change password for the signed-in account.
 *
 * The current password is used to reauthenticate before updating.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const auth = requireAuth();
  const user = auth.currentUser;
  const email = user?.email;

  if (!user || !email) {
    throw new Error(
      'Sesi berakhir. Masuk kembali untuk mengubah kata sandi.',
    );
  }

  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(
      email,
      currentPassword,
    ),
  );

  await updatePassword(user, newPassword);
}

/**
 * Sign out from Firebase.
 */
export async function logout(): Promise<void> {
  if (!firebaseConfigured) {
    return;
  }

  await signOut(requireAuth());
}

/**
 * Force-refresh the current Firebase ID token.
 */
export async function forceTokenRefresh(): Promise<string | null> {
  if (!firebaseConfigured) {
    return null;
  }

  const user = requireAuth().currentUser;

  if (!user) {
    return null;
  }

  return getIdToken(user, true);
}

/* -------------------------------------------------------------------------- */
/* Push notifications / Firebase Cloud Messaging                             */
/* -------------------------------------------------------------------------- */

/**
 * Check whether Firebase Web Push is configurable in this browser.
 */
export function pushConfigurable(): boolean {
  return (
    firebaseConfigured &&
    Boolean(config.firebase.vapidKey) &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

/**
 * Register this browser for Firebase Cloud Messaging.
 *
 * Returns null when:
 * - Firebase is not configured.
 * - Browser does not support FCM.
 * - Notification permission is denied.
 * - VAPID key is unavailable.
 * - Registration fails.
 */
export async function registerPushToken(): Promise<string | null> {
  if (!pushConfigurable()) {
    return null;
  }

  try {
    const supported = await isSupported();

    if (!supported) {
      return null;
    }

    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        return null;
      }
    }

    const registration = await navigator.serviceWorker.register(
      swSrc(),
      {
        scope: '/',
      },
    );

    const messaging = getMessaging(requireApp());

    return await getToken(messaging, {
      vapidKey: config.firebase.vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (error) {
    console.error(
      '[VELORA] Push notification registration failed:',
      error,
    );

    return null;
  }
}

/**
 * Listen for foreground Firebase messages.
 */
export function onForegroundPush(
  cb: (payload: MessagePayload) => void,
): () => void {
  if (!pushConfigurable()) {
    return () => undefined;
  }

  try {
    return onMessage(
      getMessaging(requireApp()),
      cb,
    );
  } catch (error) {
    console.error(
      '[VELORA] Foreground push initialization failed:',
      error,
    );

    return () => undefined;
  }
}

/**
 * Build the Firebase Messaging service worker URL.
 *
 * Firebase Web SDK configuration is passed through the registration URL
 * instead of being hardcoded into a committed static file.
 */
function swSrc(): string {
  const params = new URLSearchParams({
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    storageBucket: config.firebase.storageBucket,
    messagingSenderId: config.firebase.messagingSenderId,
    appId: config.firebase.appId,
    measurementId: config.firebase.measurementId,
  });

  return `/firebase-messaging-sw.js?${params.toString()}`;
}
