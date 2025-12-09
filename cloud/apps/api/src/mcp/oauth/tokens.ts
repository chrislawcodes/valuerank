/**
 * OAuth Token Generation and Validation
 *
 * Handles JWT access token creation and validation
 */

import jwt from 'jsonwebtoken';
import { createLogger } from '@valuerank/shared';
import type { AccessTokenPayload } from './types.js';
import { ACCESS_TOKEN_EXPIRY_SECONDS } from './constants.js';
import { getBaseUrl } from './metadata.js';
import type { Request } from 'express';

const log = createLogger('mcp:oauth:tokens');

/**
 * Get JWT secret from environment
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Generate an access token (JWT)
 */
export function generateAccessToken(
  req: Request,
  userId: string,
  clientId: string,
  scope: string,
  resource: string
): string {
  const baseUrl = getBaseUrl(req);
  const now = Math.floor(Date.now() / 1000);

  const payload: AccessTokenPayload = {
    sub: userId,
    aud: resource,
    iss: baseUrl,
    exp: now + ACCESS_TOKEN_EXPIRY_SECONDS,
    iat: now,
    scope,
    client_id: clientId,
  };

  const token = jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256' });

  log.debug({ userId, clientId, scope, resource }, 'Access token generated');
  return token;
}

/**
 * Validate and decode an access token
 */
export function validateAccessToken(
  token: string,
  expectedAudience: string
): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      audience: expectedAudience,
    }) as AccessTokenPayload;

    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      log.debug('Access token expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      log.debug({ error: err.message }, 'Invalid access token');
    } else {
      log.error({ err }, 'Token validation error');
    }
    return null;
  }
}

/**
 * Decode an access token without validation (for debugging)
 */
export function decodeAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.decode(token);
    return decoded as AccessTokenPayload | null;
  } catch {
    return null;
  }
}
