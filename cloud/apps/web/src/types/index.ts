// User type from GraphQL API
export type User = {
  id: string;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

// API Key type for display (excludes full key value)
export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string;
};

// Auth state for context
export type AuthState = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};
