import { QueryClient } from '@tanstack/react-query';

/**
 * Builds a QueryClient with the storefront defaults: list/detail data is briefly
 * fresh, mutations are not retried blindly, and errors surface in the UI.
 *
 * One client per render — never a module singleton. On the Worker a module-level
 * cache survives between requests, so request N+1 would render the HTML from
 * request N's data and React would report a hydration mismatch on load.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
