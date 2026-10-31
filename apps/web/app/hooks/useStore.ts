import { useQuery } from '@tanstack/react-query';
import type { Category, MenuLink } from '@velora/shared';
import { api } from '../lib/api';

export interface StoreConfig {
  brand: string;
  storeName: string;
  currency: string;
  whatsapp: string | null;
  email: string | null;
  social: Record<string, string> | null;
  shipping: { originConfigured: boolean; pickupAvailable: boolean };
  integrations: { payments: boolean; shipping: boolean; realtime: boolean; email: boolean };
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<StoreConfig>('/config', undefined, { anonymous: true }),
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories', undefined, { anonymous: true }),
    staleTime: 5 * 60_000,
  });
}

export function useMenu(code: 'header' | 'footer' = 'header') {
  return useQuery({
    queryKey: ['menu', code],
    queryFn: () => api.get<Record<string, MenuLink[]>>(`/menus`, undefined, { anonymous: true }),
    staleTime: 5 * 60_000,
    select: (data) => data[code] ?? data['main'] ?? data['footer'] ?? [],
  });
}
