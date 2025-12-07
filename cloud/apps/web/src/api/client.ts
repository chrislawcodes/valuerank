import { createClient, cacheExchange, fetchExchange, Client } from 'urql';

// Create urql client - auth header injection will be added in Phase 3
export function createUrqlClient(getToken?: () => string | null): Client {
  return createClient({
    url: '/graphql',
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => {
      const token = getToken?.();
      if (!token) {
        return {};
      }
      return {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
    },
  });
}

// Default client instance (will be replaced with auth-aware client)
export const client = createUrqlClient();
