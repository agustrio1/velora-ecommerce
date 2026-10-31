import { ROUTES } from '@velora/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

/** Gate a customer-only route; remembers where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <Spinner />;
  if (!user) return <Navigate to={ROUTES.login} replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Gate the admin area. Roles are authoritative only from the server; this is
 *  UX sugar — every /api/admin call is still re-checked by `requireAdmin`. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, isStaff, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <Spinner />;
  if (!user) return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  if (!isStaff) return <Navigate to={ROUTES.home} replace />;
  return <>{children}</>;
}
