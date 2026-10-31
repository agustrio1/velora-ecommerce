import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartView } from '@velora/shared';
import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api';
import { clearGuestToken, readGuestToken, writeGuestToken } from '../lib/guestCart';

export const CART_KEY = ['cart'];

/** Makes sure a guest basket exists so anonymous visitors can add to cart. */
async function ensureGuestSession(): Promise<void> {
  if (readGuestToken()) return;
  const { guestToken } = await api.post<{ guestToken: string }>('/cart/session');
  writeGuestToken(guestToken);
}

/**
 * A stored basket key can outlive its cart row (pruning, or a key issued by an
 * older deployment). Discard it, mint a new one and let the caller retry once
 * instead of failing every add for the rest of the browser session.
 */
async function renewGuestSession(): Promise<void> {
  clearGuestToken();
  await ensureGuestSession();
}

export function useCart() {
  const auth = useAuth();
  const query = useQuery<CartView>({
    queryKey: CART_KEY,
    queryFn: () => api.get<CartView>('/cart'),
    staleTime: 10_000,
    // Wait for the auth bootstrap: fetching before the ID token is available
    // caches the empty guest basket, so a signed-in header badge would show 0.
    enabled: auth.authReady,
  });
  return {
    cart: query.data,
    itemCount: query.data?.itemCount ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
    signedIn: Boolean(auth.user),
  };
}

export function useCartActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const auth = useAuth();

  const sync = useCallback(() => qc.invalidateQueries({ queryKey: CART_KEY }), [qc]);

  const fail = useCallback(
    (err: unknown) => {
      const message = err instanceof ApiError ? err.message : 'Aksi keranjang gagal, coba lagi.';
      toast.push(message, 'error');
    },
    [toast],
  );

  const add = useMutation({
    mutationFn: async (input: { variantId: string; quantity: number }) => {
      if (!auth.user) await ensureGuestSession();
      try {
        return await api.post<CartView>('/cart/items', input);
      } catch (err) {
        if (auth.user || !(err instanceof ApiError) || err.status !== 400) throw err;
        await renewGuestSession();
        return api.post<CartView>('/cart/items', input);
      }
    },
    onSuccess: (cart) => {
      qc.setQueryData(CART_KEY, cart);
      toast.push('Ditambahkan ke keranjang', 'success');
    },
    onError: fail,
  });

  const updateQty = useMutation({
    mutationFn: (input: { lineId: string; quantity: number }) =>
      api.patch<CartView>(`/cart/items/${input.lineId}`, { quantity: input.quantity }),
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (lineId: string) => api.del<CartView>(`/cart/items/${lineId}`),
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
    onError: fail,
  });

  const clear = useMutation({
    mutationFn: () => api.del<CartView>('/cart'),
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
    onError: fail,
  });

  const swap = useMutation({
    mutationFn: (input: { lineId: string; variantId: string }) => api.post<CartView>('/cart/items/swap', input),
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
    onError: fail,
  });

  return { add, updateQty, remove, clear, swap, sync };
}
