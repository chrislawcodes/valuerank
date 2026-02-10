/**
 * MCP Authentication Middleware
 *
 * Supports multiple authentication methods:
 * 1. OAuth 2.1 Bearer tokens (for Claude.ai and other OAuth clients)
 * 2. API keys in Bearer token position (for LeChat and similar clients)
 * 3. API keys via X-API-Key header (legacy support)
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger, AuthenticationError } from '@valuerank/shared';
import { validateAccessToken, buildWwwAuthenticateHeader, getBaseUrl } from './oauth/index.js';

const log = createLogger('mcp:auth');

/**
 * Check if a string looks like an API key (vr_ prefix)
 */
function looksLikeApiKey(token: string): boolean {
  return token.startsWith('vr_');
}

/**
 * MCP Auth Middleware
 *
 * Authenticates MCP requests via:
 * 1. OAuth 2.1 Bearer token in Authorization header
 * 2. API key as Bearer token (for clients that only support Bearer)
 * 3. API key in X-API-Key header (legacy support)
 *
 * Returns:
 * - 401 with WWW-Authenticate if no valid credentials
 * - Continues if valid authentication
 */
export function mcpAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Try OAuth Bearer token first
  const authHeader = req.headers.authorization;
  if (authHeader !== undefined && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Check if this is an API key in Bearer position (for LeChat compatibility)
    if (looksLikeApiKey(token)) {
      // Treat as API key - check if global authMiddleware already validated it
      // by manually setting the X-API-Key header and checking req.user
      if (req.user && req.authMethod === 'api_key') {
        log.debug({ userId: req.user.id, path: req.path }, 'MCP API key (Bearer) authenticated');
        next();
        return;
      }

      // API key not yet validated - this shouldn't happen since authMiddleware
      // doesn't check Bearer tokens for API keys. Log and reject.
      log.debug({ path: req.path, keyPrefix: token.slice(0, 10) }, 'API key in Bearer position not validated');
      res.setHeader('WWW-Authenticate', buildWwwAuthenticateHeader(req, 'invalid_token', 'API key is invalid'));
      next(new AuthenticationError('Invalid or expired API key'));
      return;
    }

    // Try as OAuth token
    const baseUrl = getBaseUrl(req);
    const resourceUri = `${baseUrl}/mcp`;

    const payload = validateAccessToken(token, resourceUri);
    if (payload) {
      // Set user info from token
      req.user = { id: payload.sub, email: '' }; // Email not in token, but ID is sufficient
      req.authMethod = 'oauth';
      log.debug({ userId: payload.sub, clientId: payload.client_id, path: req.path }, 'MCP OAuth authenticated');
      next();
      return;
    }

    // Invalid Bearer token
    log.debug({ path: req.path }, 'Invalid OAuth Bearer token');
    res.setHeader('WWW-Authenticate', buildWwwAuthenticateHeader(req, 'invalid_token', 'Token is invalid or expired'));
    next(new AuthenticationError('Invalid or expired access token'));
    return;
  }

  // Try legacy API key authentication via X-API-Key header
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== undefined && typeof apiKey === 'string' && apiKey !== '') {
    // Check if user was authenticated by global authMiddleware
    if (req.user && req.authMethod === 'api_key') {
      log.debug({ userId: req.user.id, path: req.path }, 'MCP API key authenticated');
      next();
      return;
    }

    // API key present but not validated
    log.debug({ path: req.path }, 'Invalid API key');
    res.setHeader('WWW-Authenticate', buildWwwAuthenticateHeader(req, 'invalid_token', 'API key is invalid'));
    next(new AuthenticationError('Invalid or expired API key'));
    return;
  }

  // No authentication provided - return 401 with OAuth challenge
  log.debug({ path: req.path }, 'MCP request missing authentication');
  res.setHeader('WWW-Authenticate', buildWwwAuthenticateHeader(req));
  next(new AuthenticationError('Authentication required. Use OAuth Bearer token or X-API-Key header.'));
}

/**
 * MCP Auth Middleware that allows unauthenticated requests
 * Used for HEAD requests to check MCP-Protocol-Version
 */
export function mcpAuthOptional(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // For HEAD requests, allow through without auth (metadata check)
  if (req.method === 'HEAD') {
    next();
    return;
  }

  // For all other requests, require auth
  mcpAuthMiddleware(req, res, next);
}
