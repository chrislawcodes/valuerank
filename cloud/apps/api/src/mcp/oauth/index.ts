/**
 * OAuth 2.1 Module for MCP Authentication
 *
 * Exports:
 * - Router for OAuth endpoints
 * - Metadata handlers
 * - Token validation utilities
 * - Storage management
 */

export { createOAuthRouter } from './router.js';
export {
  authorizationServerMetadata,
  protectedResourceMetadata,
  buildWwwAuthenticateHeader,
  getBaseUrl,
} from './metadata.js';
export { validateAccessToken, decodeAccessToken, generateAccessToken } from './tokens.js';
export {
  startAuthCodeCleanup,
  stopAuthCodeCleanup,
  cleanupExpiredRefreshTokens,
  getUserByApiKey,
} from './storage.js';
export { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
export * from './types.js';
export * from './constants.js';
