/**
 * Cloudflare bindings + runtime configuration for the VELORA Worker.
 * Secrets arrive from `wrangler secret put` / `.dev.vars`; nothing sensitive is
 * ever read from the client.
 */

export interface Env {
  // Bindings
  DB: D1Database;
  MEDIA: R2Bucket;
  VELORA_CACHE: KVNamespace;
  ASSETS: Fetcher;

  // Plain vars (wrangler.toml [vars])
  APP_ENV?: string;
  APP_URL?: string;
  LOG_LEVEL?: string;
  BRAND_NAME?: string;
  CORS_ALLOWED_ORIGINS?: string;
  MEDIA_PUBLIC_BASE_URL?: string;

  // Secrets — Duitku
  DUITKU_MERCHANT_CODE?: string;
  DUITKU_API_KEY?: string;
  DUITKU_ENVIRONMENT?: string;

  // Secrets — Biteship
  BITESHIP_API_KEY?: string;
  BITESHIP_ENVIRONMENT?: string;
  /** Optional shared secret for the inbound Biteship webhook. */
  BITESHIP_WEBHOOK_SECRET?: string;

  // Secrets — Firebase service account (server side only: FCM + RTDB REST)
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  /** Web app API key, only used for Firebase Realtime Database REST auth= param. */
  FIREBASE_WEB_API_KEY?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  /**
   * Explicit Realtime Database host. Projects created after 2019 live on
   * `<project>-default-rtdb.<region>.firebasedatabase.app` — the legacy
   * `<project>.firebaseio.com` host answers 404, so it must be configurable.
   */
  FIREBASE_DATABASE_URL?: string;
  VITE_FIREBASE_DATABASE_URL?: string;

  // Secrets — email
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;

  // Misc
  WEBHOOK_SIGNING_SECRET?: string;
  /** HMAC secret for signing the SSR session cookie (HttpOnly `velora_session`). */
  SESSION_SECRET?: string;
}

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface RuntimeFlags {
  env: AppEnvironment;
  appUrl: string;
  isProduction: boolean;
  duitku: {
    configured: boolean;
    merchantCode: string;
    apiKey: string;
    sandbox: boolean;
    baseUrl: string;
    expiryMinutes: number;
  };
  biteship: {
    configured: boolean;
    apiKey: string;
    sandbox: boolean;
    baseUrl: string;
  };
  firebase: {
    projectId: string | null;
    configured: boolean;
    clientEmail: string | null;
    privateKey: string | null;
    /** RTDB base URL without a trailing slash, always non-null (best-effort default). */
    databaseUrl: string | null;
  };
  email: {
    configured: boolean;
    provider: string;
    apiKey: string | null;
    from: string | null;
  };
}

const DUITKU = {
  sandboxBase: 'https://sandbox.duitku.com/webapi/api/merchant',
  liveBase: 'https://passport.duitku.com/webapi/api/merchant',
  paymentMethodPath: '/paymentmethod/getpaymentmethod',
  createTransactionPath: '/v2/inquiry',
  transactionStatusPath: '/transactionStatus',
  /** Hosted payment page (step 1 redirect) — sandbox and production differ. */
  sandboxPayUrl: 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry/page',
  livePayUrl: 'https://merchant.duitku.com/page',
} as const;

export function flags(c: Env): RuntimeFlags {
  const env: AppEnvironment =
    c.APP_ENV === 'production' ? 'production' : c.APP_ENV === 'staging' ? 'staging' : 'development';
  const duitkuSandbox = (c.DUITKU_ENVIRONMENT ?? 'sandbox').toLowerCase() !== 'production';
  const biteshipSandbox = (c.BITESHIP_ENVIRONMENT ?? 'sandbox').toLowerCase() !== 'production';
  const projectId = c.FIREBASE_PROJECT_ID || c.VITE_FIREBASE_PROJECT_ID || null;
  const privateKey = c.FIREBASE_PRIVATE_KEY ? c.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
  /* Legacy `firebaseio.com` returns 404 for new projects, so an explicit host wins. */
  const databaseUrl =
    (c.FIREBASE_DATABASE_URL || c.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '') ||
    (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : null);

  return {
    env,
    appUrl: (c.APP_URL || '').replace(/\/$/, ''),
    isProduction: env === 'production',
    duitku: {
      configured: Boolean(c.DUITKU_MERCHANT_CODE && c.DUITKU_API_KEY),
      merchantCode: c.DUITKU_MERCHANT_CODE ?? '',
      apiKey: c.DUITKU_API_KEY ?? '',
      sandbox: duitkuSandbox,
      baseUrl: duitkuSandbox ? DUITKU.sandboxBase : DUITKU.liveBase,
      expiryMinutes: 60,
    },
    biteship: {
      configured: Boolean(c.BITESHIP_API_KEY),
      apiKey: c.BITESHIP_API_KEY ?? '',
      sandbox: biteshipSandbox,
      baseUrl: 'https://api.biteship.com',
    },
    firebase: {
      projectId,
      configured: Boolean(projectId && c.FIREBASE_CLIENT_EMAIL && privateKey),
      clientEmail: c.FIREBASE_CLIENT_EMAIL ?? null,
      privateKey,
      databaseUrl,
    },
    email: {
      configured: Boolean(c.EMAIL_API_KEY && c.EMAIL_FROM),
      provider: c.EMAIL_PROVIDER ?? 'resend',
      apiKey: c.EMAIL_API_KEY ?? null,
      from: c.EMAIL_FROM ?? null,
    },
  };
}

export const DUITKU_ENDPOINTS = DUITKU;

/** Firebase Auth ID token audience/issuer derived from the project id. */
export function firebaseIssuer(projectId: string): string {
  return `https://securetoken.google.com/${projectId}`;
}
