
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type NotificationPrefs,
  ROLE_CODE,
  type RoleCode,
  type UserProfile,
} from '@velora/shared';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { usePushNotification } from '../hooks/usePush';
import { ApiError, api, setTokenProvider } from '../lib/api';
import { config, loadRuntimeConfig } from '../lib/config';
import {
  currentIdToken,
  logout as fbLogout,
  subscribeAuth,
} from '../lib/firebase';
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

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const queryClient = useQueryClient();

  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  /**
   * The API reads a fresh Firebase ID token per request.
   */
  useEffect(() => {
    setTokenProvider(() => currentIdToken());
  }, []);

  /**
   * Load runtime Firebase configuration before subscribing to Firebase Auth.
   *
   * This prevents Firebase from initializing with empty build-time
   * configuration when deploying without .env.local.
   */
  useEffect(() => {
    let cancelled = false;
    let stop: () => void = () => undefined;

    async function initializeAuth() {
      try {
        await loadRuntimeConfig();

        if (cancelled) {
          return;
        }

        stop = subscribeAuth((fbUser) => {
          setSignedIn(Boolean(fbUser));
          setAuthReady(true);

          // Mirror the Firebase session into an HttpOnly cookie
          // for SSR loaders. Bearer-only API calls remain supported.
          if (fbUser) {
            void exchangeSession();
          }
        });
      } catch (error) {
        console.error('[VELORA] Auth initialization failed:', error);

        if (!cancelled) {
          setSignedIn(false);
          setAuthReady(true);
        }
      }
    }

    void initializeAuth();

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  /**
   * Merge the guest basket into the account basket after sign-in.
   */
  useEffect(() => {
    if (!signedIn) {
      return;
    }

    const guest = readGuestToken();

    if (!guest) {
      return;
    }

    void api
      .post('/cart/merge', { guestToken: guest })
      .then(() => queryClient.invalidateQueries())
      .catch(() => undefined);
  }, [signedIn, queryClient]);

  /**
   * Load the authenticated account.
   */
  const me = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () =>
      api.get<MeResponse>(
        '/account/me',
        undefined,
        { anonymous: true },
      ),
    enabled: signedIn,
    staleTime: 30_000,

    // A 401 is a definitive unauthenticated response.
    // Other failures get one retry for temporary network issues.
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 401) &&
      count < 1,
  });

  /**
   * Register this browser for FCM push notifications.
   */
  usePushNotification(signedIn);

  const refresh = useCallback(async () => {
    await me.refetch();
  }, [me]);

  const signOut = useCallback(async () => {
    await clearSession();
    await fbLogout();

    // Clear stale account-dependent data after sign-out.
    await queryClient.invalidateQueries();
  }, [queryClient]);

  /**
   * Firebase may restore the previous session after a page reload.
   * Route guards must wait until both Auth and account data are resolved.
   */
  const accountKnown = !signedIn || !me.isPending;
  const resolved = authReady && accountKnown;

  // Never trust cached roles after signing out.
  const user = signedIn ? (me.data?.user ?? null) : null;

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading: signedIn && me.isPending,
      authReady: resolved,

      isStaff: Boolean(
        user?.roles.some(
          (role) =>
            role === ROLE_CODE.ADMIN ||
            role === ROLE_CODE.SUPER_ADMIN,
        ),
      ),

      isSuperAdmin: Boolean(
        user?.roles.includes(ROLE_CODE.SUPER_ADMIN),
      ),

      refresh,
      signOut,
    }),
    [
      user,
      signedIn,
      me.isPending,
      resolved,
      refresh,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      'useAuth harus dipakai di dalam AuthProvider',
    );
  }

  return ctx;
}

/**
 * Endpoint that mirrors the Firebase session into an HttpOnly cookie.
 */
const sessionEndpoint = () =>
  `${config.apiBase || ''}/api/auth/session`;

/**
 * Exchange the Firebase ID token for an HttpOnly SSR session cookie.
 */
async function exchangeSession(): Promise<void> {
  try {
    const idToken = await currentIdToken();

    if (!idToken) {
      return;
    }

    await fetch(sessionEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ idToken }),
    });
  } catch {
    // SSR cookie is progressive enhancement.
    // Ignore failures; Bearer authentication remains available.
  }
}

/**
 * Clear the SSR session cookie on logout.
 */
async function clearSession(): Promise<void> {
  try {
    await fetch(sessionEndpoint(), {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    // Firebase sign-out remains the source of truth.
  }
}
