/**
 * Authentication middleware
 *
 * Validates JWT tokens and API keys, populates req.user with user info.
 * Supports both Bearer token (JWT) and X-API-Key header authentication.
 */

import type { Request, Response, NextFunction } from 'express';

import { createLogger, AuthenticationError } from '@valuerank/shared';
import { db } from '@valuerank/db';

import { verifyToken, extractBearerToken } from './services.js';
import { hashApiKey, isValidApiKeyFormat } from './api-keys.js';
import type { AuthUser, AuthMethod } from './types.js';

const log = createLogger('auth:middleware');

// Extend Express Request to include auth info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthUser | null;
      authMethod: AuthMethod | null;
    }
  }
}

/**
 * Extract and validate authentication from request headers
 *
 * Supports two authentication methods:
 * 1. JWT via Authorization header (Bearer token)
 * 2. API key via X-API-Key header
 *
 * Sets req.user and req.authMethod on success
 * Sets both to null if no auth provided (allows unauthenticated requests through)
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // Initialize auth state
  req.user = null;
  req.authMethod = null;

  // Try Bearer token or Basic auth (Authorization header)
  const authHeader = req.headers.authorization;

  // Check for Basic auth (for Excel OData connector)
  // Format: "Basic base64(username:password)" where password is the API key
  if (authHeader !== undefined && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice(6);
    try {
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const colonIndex = credentials.indexOf(':');
      if (colonIndex > -1) {
        const password = credentials.slice(colonIndex + 1);

        // Use password as API key
        if (password.startsWith('vr_')) {
          const user = await validateApiKey(password);
          if (user !== null) {
            req.user = user;
            req.authMethod = 'api_key';
            log.debug({ userId: user.id }, 'Basic auth (API key) successful');
            next();
            return;
          }
        }
      }
    } catch {
      // Invalid base64, continue to try other methods
    }
  }

  const token = extractBearerToken(authHeader);

  if (token !== null && token !== undefined && token !== '') {
    // Check if Bearer token is actually an API key (for LeChat compatibility)
    if (token.startsWith('vr_')) {
      try {
        const user = await validateApiKey(token);
        if (user !== null) {
          req.user = user;
          req.authMethod = 'api_key';
          log.debug({ userId: user.id }, 'API key (Bearer) authentication successful');
          next();
          return;
        }
        // Invalid API key format or not found - continue without auth
        // (individual routes can require auth if needed)
        next();
        return;
      } catch (err) {
        if (err instanceof AuthenticationError) {
          next(err);
          return;
        }
        log.error({ err }, 'Unexpected error during API key validation');
        next(new AuthenticationError('Invalid API key'));
        return;
      }
    }

    // Try as JWT
    try {
      // Verify JWT (includes 30-second clock skew tolerance)
      const payload = verifyToken(token);

      // Populate request with user info
      req.user = {
        id: payload.sub,
        email: payload.email,
      };
      req.authMethod = 'jwt';

      log.debug({ userId: req.user.id }, 'JWT authentication successful');
      next();
      return;
    } catch (err) {
      // Token is invalid - pass error to error handler
      if (err instanceof AuthenticationError) {
        next(err);
      } else {
        log.error({ err }, 'Unexpected error during JWT validation');
        next(new AuthenticationError('Invalid token'));
      }
      return;
    }
  }

  // Try API key (X-API-Key header or apiKey query param)
  const headerKey = req.headers['x-api-key'];
  const queryKey = req.query.apiKey;
  const apiKey = (typeof headerKey === 'string' ? headerKey : typeof queryKey === 'string' ? queryKey : '');

  if (apiKey.length > 0) {
    try {
      const user = await validateApiKey(apiKey);
      if (user !== null) {
        req.user = user;
        req.authMethod = 'api_key';
        log.debug({ userId: user.id }, 'API key authentication successful');
      }
    } catch (err) {
      if (err instanceof AuthenticationError) {
        next(err);
        return;
      }
      log.error({ err }, 'Unexpected error during API key validation');
      next(new AuthenticationError('Invalid API key'));
      return;
    }
  }

  // No auth provided - allow through as unauthenticated
  // Individual routes/resolvers can require auth if needed
  next();
}

/**
 * Validate an API key and return the associated user
 *
 * @param key - The API key from the X-API-Key header
 * @returns User info if valid, null if invalid
 * @throws AuthenticationError if key is expired
 */
async function validateApiKey(key: string): Promise<AuthUser | null> {
  // Validate format first
  if (!isValidApiKeyFormat(key)) {
    log.debug('Invalid API key format');
    return null;
  }

  // Hash the key for lookup
  const keyHash = hashApiKey(key);

  // Find the API key record
  const apiKeyRecord = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKeyRecord) {
    log.debug('API key not found');
    return null;
  }

  // Check expiry
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    log.debug({ keyId: apiKeyRecord.id }, 'API key expired');
    throw new AuthenticationError('API key expired');
  }

  // Update last_used timestamp (fire and forget)
  db.apiKey
    .update({
      where: { id: apiKeyRecord.id },
      data: { lastUsed: new Date() },
    })
    .catch((err: unknown) => {
      log.warn({ err, keyId: apiKeyRecord.id }, 'Failed to update last_used');
    });

  log.debug(
    { keyId: apiKeyRecord.id, userId: apiKeyRecord.userId },
    'API key validated'
  );

  return {
    id: apiKeyRecord.user.id,
    email: apiKeyRecord.user.email,
  };
}

/**
 * Require authentication middleware
 *
 * Use after authMiddleware to require valid auth
 * Returns 401 if not authenticated
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.user === null || req.user === undefined) {
    next(new AuthenticationError('Authentication required'));
    return;
  }
  next();
}

/**
 * Check if request is a GraphQL introspection query
 *
 * Introspection queries should be allowed without auth
 */
export function isIntrospectionQuery(req: Request): boolean {
  const body = req.body as { query?: string } | undefined;

  if (body === undefined || body === null || body.query === undefined || body.query === null || body.query === '') {
    return false;
  }

  // Check for introspection query patterns
  const query = body.query;
  return (
    query.includes('__schema') ||
    query.includes('__type') ||
    query.includes('IntrospectionQuery')
  );
}

/**
 * GraphQL auth middleware
 *
 * Applies auth check to GraphQL requests, but allows:
 * - Introspection queries (for schema discovery)
 * - Requests with valid authentication
 */
export function graphqlAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Always allow introspection queries
  if (isIntrospectionQuery(req)) {
    next();
    return;
  }

  // Require authentication for all other GraphQL operations
  if (req.user === null || req.user === undefined) {
    next(new AuthenticationError('Authentication required'));
    return;
  }

  next();
}
