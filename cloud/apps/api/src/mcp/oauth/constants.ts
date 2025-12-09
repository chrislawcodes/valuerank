/**
 * OAuth 2.1 Constants for MCP Authentication
 */

/** Default scopes supported by the MCP server */
export const SUPPORTED_SCOPES = ['mcp:read', 'mcp:write'] as const;

/** Default scope granted to clients */
export const DEFAULT_SCOPE = 'mcp:read mcp:write';

/** Authorization code expiration (10 minutes) */
export const AUTH_CODE_EXPIRY_MS = 10 * 60 * 1000;

/** Access token expiration (1 hour) */
export const ACCESS_TOKEN_EXPIRY_SECONDS = 3600;

/** Refresh token expiration (30 days) */
export const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Client secret expiration (never - 0 means no expiry) */
export const CLIENT_SECRET_EXPIRY_SECONDS = 0;

/** Maximum number of stored auth codes (memory limit) */
export const MAX_AUTH_CODES = 10000;

/** Auth code cleanup interval (5 minutes) */
export const AUTH_CODE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Allowed redirect URI schemes */
export const ALLOWED_REDIRECT_SCHEMES = ['https', 'http'] as const;

/** Localhost hosts allowed for http:// redirects */
export const LOCALHOST_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

/** Claude.ai callback URLs to allowlist */
export const CLAUDE_CALLBACK_URLS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const;
