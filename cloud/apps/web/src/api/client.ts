import type { Client} from 'urql';
import { createClient, cacheExchange, fetchExchange, mapExchange } from 'urql';
import { getStoredToken, clearStoredToken } from '../auth/context';

// API base URL - empty string means same origin (dev), full URL for production
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Custom exchange to handle 401 responses
const authErrorExchange = mapExchange({
  onResult(result) {
    // Check for 401 errors in GraphQL response
    if (result.error?.graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHORIZED')) {
      clearStoredToken();
      window.location.href = '/login';
    }
    // Check for network 401 response
    if (result.error?.networkError && 'response' in result.error.networkError) {
      const response = (result.error.networkError as { response?: { status?: number } }).response;
      if (response?.status === 401) {
        clearStoredToken();
        window.location.href = '/login';
      }
    }
    return result;
  },
});

// Create urql client with auth header injection and 401 handling
export function createUrqlClient(getToken: () => string | null = getStoredToken): Client {
  return createClient({
    url: `${API_BASE_URL}/graphql`,
    exchanges: [cacheExchange, authErrorExchange, fetchExchange],
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
