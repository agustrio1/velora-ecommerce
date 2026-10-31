/**
 * Guest cart token storage. The token is a basket key issued by POST
 * /api/cart/session — it is never an identity and grants no authorization.
 * Kept in localStorage so a basket survives a reload before sign-in.
 */
const KEY = 'velora.guestCart';

export function readGuestToken(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && /^[a-zA-Z0-9_.-]{16,64}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeGuestToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode / storage disabled — the basket simply won't persist */
  }
}

export function clearGuestToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
