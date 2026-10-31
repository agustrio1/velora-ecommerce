import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductSummary } from '@velora/shared';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

export const WISHLIST_KEY = ['wishlist'];

interface WishlistItems {
  items: ProductSummary[];
}

export function useWishlist() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const query = useQuery<WishlistItems>({
    queryKey: WISHLIST_KEY,
    queryFn: () => api.get<WishlistItems>('/wishlist', undefined, { anonymous: true }),
    enabled: Boolean(user),
  });

  const ids = new Set((query.data?.items ?? []).map((i) => i.id));

  const toggle = useMutation({
    mutationFn: async (productId: string) => {
      if (ids.has(productId)) return api.del<WishlistItems>(`/wishlist/${productId}`);
      return api.post<WishlistItems>('/wishlist', { productId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
    onError: (err) => toast.push(err instanceof Error ? err.message : 'Wishlist gagal', 'error'),
  });

  return {
    ids,
    has: (productId: string) => ids.has(productId),
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    toggle: (productId: string) => {
      if (!user) {
        toast.push('Masuk untuk menyimpan ke wishlist', 'info');
        return;
      }
      toggle.mutate(productId);
    },
    requireAuth: !user,
  };
}
