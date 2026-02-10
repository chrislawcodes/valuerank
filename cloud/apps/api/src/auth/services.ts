/**
 * Authentication services
 *
 * Password hashing with bcrypt and JWT token management
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { createLogger, AuthenticationError } from '@valuerank/shared';

import { config } from '../config.js';
import type { JWTPayload, AuthUser } from './types.js';

const log = createLogger('auth');

/** bcrypt cost factor - 12 provides ~250ms hash time */
const BCRYPT_COST_FACTOR = 12;

/** Clock skew tolerance in seconds for JWT validation */
const CLOCK_SKEW_SECONDS = 30;

/**
 * Hash a password using bcrypt
 *
 * @param password - Plain text password
 * @returns bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/**
 * Verify a password against a bcrypt hash
 *
 * @param password - Plain text password to verify
 * @param hash - bcrypt hash to compare against
 * @returns true if password matches hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Sign a JWT token for a user
 *
 * @param user - User to create token for
 * @returns Signed JWT token
 */
export function signToken(user: AuthUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode a JWT token
 *
 * @param token - JWT token to verify
 * @returns Decoded payload
 * @throws AuthenticationError if token is invalid or expired
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      clockTolerance: CLOCK_SKEW_SECONDS,
    }) as JWTPayload;

    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      log.warn({ err }, 'Token expired');
      throw new AuthenticationError('Token expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      log.warn({ err }, 'Invalid token');
      throw new AuthenticationError('Invalid token');
    }
    log.error({ err }, 'Token verification failed');
    throw new AuthenticationError('Invalid token');
  }
}

/**
 * Extract Bearer token from Authorization header
 *
 * @param authHeader - Authorization header value
 * @returns Token string or null if not present/invalid format
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (authHeader === undefined || authHeader === null || authHeader === '') {
    return null;
  }

  // Accept both "Bearer <token>" and just "<token>"
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // If no Bearer prefix, treat the whole string as the token
  return authHeader;
}
