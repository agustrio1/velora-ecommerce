import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Taxonomies } from '../lib/api-types';

/** Categories, brands, colors and sizes for admin product & taxonomy screens. */
export function useTaxonomies() {
  return useQuery<Taxonomies>({
    queryKey: ['admin', 'taxonomies'],
    queryFn: () => api.get<Taxonomies>('/admin/taxonomies', undefined, { anonymous: true }),
    staleTime: 5 * 60_000,
  });
}
