/**
 * Authentication module public API
 *
 * Re-exports auth services for use by other modules
 */

// Types
export type {
  JWTPayload,
  AuthUser,
  AuthMethod,
  AuthContext,
  LoginRequest,
  LoginResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ApiKeyListItem,
} from './types.js';

// Password and JWT services
export {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractBearerToken,
} from './services.js';

// API key services
export {
  generateApiKey,
  hashApiKey,
  getKeyPrefix,
  isValidApiKeyFormat,
} from './api-keys.js';

// Middleware
export {
  authMiddleware,
  requireAuth,
  graphqlAuthMiddleware,
  isIntrospectionQuery,
} from './middleware.js';
