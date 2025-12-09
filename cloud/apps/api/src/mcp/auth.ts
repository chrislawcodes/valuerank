/**
 * MCP Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. OAuth 2.1 Bearer tokens (for Claude.ai and other OAuth clients)
 * 2. API keys (legacy, for backwards compatibility)
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger, AuthenticationError } from '@valuerank/shared';
import { validateAccessToken, buildWwwAuthenticateHeader, getBaseUrl } from './oauth/index.js';

const log = createLogger('mcp:auth');

/**
 * MCP Auth Middleware
 *
 * Authenticates MCP requests via:
 * 1. OAuth 2.1 Bearer token in Authorization header
 * 2. API key in X-API-Key header (legacy support)
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
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
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

  // Try legacy API key authentication
  const apiKey = req.headers['x-api-key'];
  if (apiKey && typeof apiKey === 'string' && apiKey.length > 0) {
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
