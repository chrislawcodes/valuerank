/**
 * MCP Authentication Middleware
 *
 * Ensures MCP requests are authenticated via API key.
 * Reuses existing API key validation from auth middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger, AuthenticationError } from '@valuerank/shared';

const log = createLogger('mcp:auth');

/**
 * MCP Auth Middleware
 *
 * Requires valid API key authentication for all MCP requests.
 * Uses the auth state populated by the global authMiddleware.
 *
 * Returns:
 * - 401 if X-API-Key header is missing
 * - 401 if API key is invalid (already handled by authMiddleware)
 * - Continues if valid API key authentication
 */
export function mcpAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Check if request has API key header
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
    log.debug({ path: req.path }, 'MCP request missing API key');
    next(new AuthenticationError('API key required in X-API-Key header'));
    return;
  }

  // Check if user was authenticated (populated by global authMiddleware)
  if (!req.user) {
    log.debug({ path: req.path }, 'MCP request has invalid API key');
    next(new AuthenticationError('Invalid or expired API key'));
    return;
  }

  // Check if auth method is API key (not JWT)
  if (req.authMethod !== 'api_key') {
    log.debug(
      { path: req.path, authMethod: req.authMethod },
      'MCP requires API key authentication'
    );
    next(new AuthenticationError('MCP requires API key authentication'));
    return;
  }

  log.debug({ userId: req.user.id, path: req.path }, 'MCP request authenticated');
  next();
}
