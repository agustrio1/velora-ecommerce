import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
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
import { type MessagePayload, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { config, firebaseConfigured } from './config';

/**
 * Firebase is used only for web auth on the client. The Worker re-verifies every
 * ID token against Google and derives roles from D1, so a tampered token here
 * grants nothing. When Firebase isn't configured the store still browses.
 */

let app: FirebaseApp | null = null;
let authRef: Auth | null = null;

function ensureApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length) return existing[0];
  app = initializeApp(toFirebaseConfig());
  return app;
}

function requireApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error('Firebase belum dikonfigurasi. Isi VITE_FIREBASE_* pada apps/web/.env.');
  }
  return ensureApp();
}

function requireAuth(): Auth {
  if (!authRef) authRef = getAuth(requireApp());
  return authRef;
}

function toFirebaseConfig() {
  return {
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    appId: config.firebase.appId,
    messagingSenderId: config.firebase.messagingSenderId,
    databaseURL: config.firebase.databaseURL,
  };
}

export function isFirebaseReady(): boolean {
  return firebaseConfigured;
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  if (!firebaseConfigured) {
    cb(null);
    return () => undefined;
  }
  return onAuthStateChanged(requireAuth(), cb);
}

/** Force-refreshed ID token, or null when signed out / unconfigured. */
export async function currentIdToken(force = false): Promise<string | null> {
  if (!firebaseConfigured) return null;
  const user = requireAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(force);
}

export async function signIn(email: string, password: string): Promise<User> {
  return signInWithEmailAndPassword(requireAuth(), email.trim(), password).then((r) => r.user);
}

export async function register(name: string, email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim() });
  }
  return cred.user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(requireAuth(), provider);
  return cred.user;
}

export async function requestReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email.trim());
}

/** Google-only accounts have no password provider until a reset link adds one. */
export function hasPasswordProvider(): boolean {
  if (!firebaseConfigured) return false;
  const user = requireAuth().currentUser;
  return Boolean(user?.providerData.some((provider) => provider.providerId === 'password'));
}

/**
 * Change the password of the signed-in account. Firebase refuses credential
 * updates from a stale session, so the current password doubles as proof of
 * ownership instead of forcing a sign-out / sign-in round trip.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const auth = requireAuth();
  const user = auth.currentUser;
  const email = user?.email;
  if (!user || !email) throw new Error('Sesi berakhir. Masuk kembali untuk mengubah kata sandi.');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, currentPassword));
  await updatePassword(user, newPassword);
}

export async function logout(): Promise<void> {
  if (!firebaseConfigured) return;
  await signOut(requireAuth());
}

export function forceTokenRefresh(): Promise<string | null> {
  if (!firebaseConfigured) return Promise.resolve(null);
  const user = requireAuth().currentUser;
  return user ? getIdToken(user, true) : Promise.resolve(null);
}

/* ------------------------------ push / FCM -------------------------------- */

/** Web push is opt-in and needs Firebase, a VAPID key and a SW-capable browser. */
export function pushConfigurable(): boolean {
  return (
    firebaseConfigured &&
    Boolean(config.firebase.vapidKey) &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'Notification' in window
  );
}

/**
 * Ask for notification permission and mint an FCM device token for the signed-in
 * browser. Returns null when the platform is unsupported, permission is denied,
 * or Firebase/FCM isn't configured — callers must degrade quietly so the store
 * keeps working without push (per DOC section 11).
 */
export async function registerPushToken(): Promise<string | null> {
  if (!pushConfigurable()) return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return null;
    }
    const registration = await navigator.serviceWorker.register(swSrc(), { scope: '/' });
    const messaging = getMessaging(requireApp());
    return await getToken(messaging, {
      vapidKey: config.firebase.vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}

/** Subscribe to pushes delivered while the app is in the foreground. */
export function onForegroundPush(cb: (payload: MessagePayload) => void): () => void {
  if (!pushConfigurable()) return () => undefined;
  try {
    return onMessage(getMessaging(requireApp()), cb);
  } catch {
    return () => undefined;
  }
}

/**
 * Public Firebase web config values are safe to expose (see .env.example) but
 * never belong in a committed static file, so the service worker receives them
 * through its registration URL instead of a hard-coded blob.
 */
function swSrc(): string {
  const params = new URLSearchParams({
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    messagingSenderId: config.firebase.messagingSenderId,
    appId: config.firebase.appId,
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}
