import { createClient, cacheExchange, fetchExchange, Client } from 'urql';
import { getStoredToken } from '../auth/context';

// Create urql client with auth header injection
export function createUrqlClient(getToken: () => string | null = getStoredToken): Client {
  return createClient({
    url: '/graphql',
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => {
      const token = getToken();
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

// Default client instance with auth header injection
export const client = createUrqlClient();
