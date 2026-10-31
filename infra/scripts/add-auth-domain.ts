import { readFileSync } from 'node:fs';

/**
 * Adds a domain to the Firebase Authentication "Authorized domains" list.
 *
 *   bun run infra/scripts/add-auth-domain.ts velora.pribadiagus321.workers.dev
 *
 * Uses the service account in `.dev.vars` (FIREBASE_PROJECT_ID,
 * FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) to mint an OAuth2 access token
 * for the Identity Toolkit Admin API. The domain list is replaced wholesale, so
 * the current list is read first and the new domain appended.
 */

const DOMAIN = process.argv[2];
if (!DOMAIN) {
  console.error('Usage: bun run infra/scripts/add-auth-domain.ts <domain>');
  process.exit(1);
}

const vars = new Map<string, string>();
for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
  const at = line.indexOf('=');
  if (at <= 0 || line.trimStart().startsWith('#')) continue;
  const value = line
    .slice(at + 1)
    .trim()
    .replace(/^"(.*)"$/, '$1');
  vars.set(line.slice(0, at).trim(), value);
}

const projectId = vars.get('FIREBASE_PROJECT_ID');
const clientEmail = vars.get('FIREBASE_CLIENT_EMAIL');
const privateKeyPem = vars.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKeyPem) {
  console.error('FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY missing from .dev.vars');
  process.exit(1);
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return Buffer.from(bytes).toString('base64url');
}

const pem = privateKeyPem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
const key = await crypto.subtle.importKey(
  'pkcs8',
  Buffer.from(pem, 'base64'),
  { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  false,
  ['sign'],
);

const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: clientEmail,
  scope: 'https://www.googleapis.com/auth/identitytoolkit',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
};
const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
});
const token = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
if (!token.access_token) {
  console.error('Token exchange failed:', token.error, token.error_description);
  process.exit(1);
}

const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
const headers = { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' };

const currentRes = await fetch(configUrl, { headers });
const current = (await currentRes.json()) as { authorizedDomains?: string[]; error?: { message?: string } };
if (!currentRes.ok) {
  console.error('Reading auth config failed:', currentRes.status, current.error?.message ?? '');
  process.exit(1);
}

const domains = current.authorizedDomains ?? [];
if (domains.includes(DOMAIN)) {
  console.log(`Already authorized: ${domains.join(', ')}`);
  process.exit(0);
}

const patchRes = await fetch(`${configUrl}?updateMask=authorizedDomains`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ authorizedDomains: [...domains, DOMAIN] }),
});
const patched = (await patchRes.json()) as { authorizedDomains?: string[]; error?: { message?: string } };
if (!patchRes.ok) {
  console.error('Update failed:', patchRes.status, patched.error?.message ?? '');
  process.exit(1);
}

console.log('Authorized domains:', (patched.authorizedDomains ?? []).join(', '));
