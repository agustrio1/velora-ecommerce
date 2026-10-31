import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type NotificationPrefs, ROLE_CODE, type RoleCode, type UserProfile } from '@velora/shared';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePushNotification } from '../hooks/usePush';
import { ApiError, api, setTokenProvider } from '../lib/api';
import { config } from '../lib/config';
import { currentIdToken, logout as fbLogout, subscribeAuth } from '../lib/firebase';
import { readGuestToken } from '../lib/guestCart';

export interface PublicUser {
  id: string;
  email: string;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'active' | 'disabled';
  emailVerified: boolean;
  roles: RoleCode[];
  createdAt: string;
}

interface MeResponse {
  user: PublicUser;
  profile: UserProfile | null;
  prefs: NotificationPrefs;
  stats: {
    orders: number;
    byStatus: Record<string, number>;
    unreadNotifications: number;
    wishlist: number;
  };
}

interface AuthValue {
  user: PublicUser | null;
  loading: boolean;
  authReady: boolean;
  isStaff: boolean;
  isSuperAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  // The API reads a fresh ID token per call through this provider.
  useEffect(() => {
    setTokenProvider(() => currentIdToken());
  }, []);

  useEffect(() => {
    const stop = subscribeAuth((fbUser) => {
      setSignedIn(Boolean(fbUser));
      setAuthReady(true);
      // Mirror the Firebase session into an HttpOnly cookie the SSR loaders
      // read. Best-effort: the app still works with Bearer-only API calls.
      if (fbUser) void exchangeSession();
    });
    return stop;
  }, []);

  // Fold a pre-login guest basket into the account basket once, after sign-in.
  useEffect(() => {
    if (!signedIn) return;
    const guest = readGuestToken();
    if (!guest) return;
    void api
      .post('/cart/merge', { guestToken: guest })
      .then(() => queryClient.invalidateQueries())
      .catch(() => undefined);
  }, [signedIn, queryClient]);

  const me = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/account/me', undefined, { anonymous: true }),
    enabled: signedIn,
    staleTime: 30_000,
    // A 401 is a real answer (signed out, disabled, deleted). Anything else —
    // an offline blip right after a reload — deserves one retry before we
    // decide the visitor is a stranger.
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
  });

  // Register this browser for FCM pushes once the visitor is signed in.
  usePushNotification(signedIn);

  const refresh = useCallback(async () => {
    await me.refetch();
  }, [me]);

  const signOut = useCallback(async () => {
    await clearSession();
    await fbLogout();
    // Cart + wishlist + account data all change after a sign-out.
    await queryClient.invalidateQueries();
  }, [queryClient]);

  // A hard reload restores the Firebase session a beat before `/account/me`
  // answers. `authReady` only means "Firebase knows there is a user"; roles and
  // identity are still unknown until that query settles, so the route guards
  // must keep waiting — flipping to /masuk here is the "refresh logs me out" bug.
  const accountKnown = !signedIn || !me.isPending;
  const resolved = authReady && accountKnown;
  // Never trust cached roles after a sign-out: the query stays cached for 5
  // minutes, which used to leave the admin shell rendered with a stale user.
  const user = signedIn ? (me.data?.user ?? null) : null;

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading: signedIn && me.isPending,
      authReady: resolved,
      isStaff: Boolean(user?.roles.some((r) => r === ROLE_CODE.ADMIN || r === ROLE_CODE.SUPER_ADMIN)),
      isSuperAdmin: Boolean(user?.roles.includes(ROLE_CODE.SUPER_ADMIN)),
      refresh,
      signOut,
    }),
    [user, signedIn, me.isPending, resolved, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}

/** Endpoint that mirrors the Firebase session into an HttpOnly cookie. */
const sessionEndpoint = () => `${config.apiBase || ''}/api/auth/session`;

/** Exchange the current Firebase ID token for an HttpOnly SSR session cookie. */
async function exchangeSession(): Promise<void> {
  try {
    const idToken = await currentIdToken();
    if (!idToken) return;
    await fetch(sessionEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ idToken }),
    });
  } catch {
    // Cookie is a progressive enhancement for SSR — ignore failures.
  }
}

/** Clear the SSR session cookie on logout. */
async function clearSession(): Promise<void> {
  try {
    await fetch(sessionEndpoint(), { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    // Ignore — Firebase sign-out below is the source of truth for the client.
  }
}
