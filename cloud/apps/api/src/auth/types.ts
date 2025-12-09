/**
 * Authentication type definitions
 *
 * JWT payload structure, auth context, and request/response types
 */

/**
 * JWT token payload structure
 * Stored in the token and available after validation
 */
export type JWTPayload = {
  /** User ID (cuid) */
  sub: string;
  /** User email */
  email: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiry (Unix timestamp) */
  exp: number;
};

/**
 * Authenticated user info available in request context
 */
export type AuthUser = {
  id: string;
  email: string;
};

/**
 * Authentication method used for the current request
 */
export type AuthMethod = 'jwt' | 'api_key' | 'oauth';

/**
 * Authentication context added to Express request
 */
export type AuthContext = {
  user: AuthUser | null;
  authMethod: AuthMethod | null;
};

/**
 * Login request body
 */
export type LoginRequest = {
  email: string;
  password: string;
};

/**
 * Login response
 */
export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

/**
 * Create API key request
 */
export type CreateApiKeyRequest = {
  name: string;
  expiresAt?: Date;
};

/**
 * Create API key response (full key shown only once)
 */
export type CreateApiKeyResponse = {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: Date;
  expiresAt: Date | null;
};

/**
 * API key listing (prefix only, never full key)
 */
export type ApiKeyListItem = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
};
