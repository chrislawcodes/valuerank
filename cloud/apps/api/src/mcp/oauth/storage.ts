/**
 * OAuth Storage Layer
 *
 * Manages storage for:
 * - Authorization codes (in-memory, short-lived)
 * - OAuth clients (database)
 * - Refresh tokens (database)
 */

import crypto from 'crypto';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type {
  StoredAuthCode,
  StoredOAuthClient,
  StoredRefreshToken,
  CodeChallengeMethod,
  GrantType,
  ResponseType,
  TokenEndpointAuthMethod,
} from './types.js';
import {
  AUTH_CODE_EXPIRY_MS,
  AUTH_CODE_CLEANUP_INTERVAL_MS,
  MAX_AUTH_CODES,
  REFRESH_TOKEN_EXPIRY_MS,
} from './constants.js';

const log = createLogger('mcp:oauth:storage');

// In-memory store for authorization codes (short-lived)
const authCodes = new Map<string, StoredAuthCode>();

// Cleanup interval reference
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Hash a secret using SHA-256
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Start the auth code cleanup interval
 */
export function startAuthCodeCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = new Date();
    let cleaned = 0;

    for (const [code, stored] of authCodes) {
      if (stored.expiresAt < now) {
        authCodes.delete(code);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned expired auth codes');
    }
  }, AUTH_CODE_CLEANUP_INTERVAL_MS);

  log.info('Auth code cleanup started');
}

/**
 * Stop the auth code cleanup interval
 */
export function stopAuthCodeCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info('Auth code cleanup stopped');
  }
}

// ============================================================================
// Authorization Code Storage (In-Memory)
// ============================================================================

/**
 * Store an authorization code
 */
export function storeAuthCode(data: Omit<StoredAuthCode, 'code' | 'expiresAt' | 'createdAt'>): string {
  // Enforce memory limit
  if (authCodes.size >= MAX_AUTH_CODES) {
    // Remove oldest entries
    const entries = Array.from(authCodes.entries());
    entries.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    const toRemove = entries.slice(0, Math.floor(MAX_AUTH_CODES * 0.1));
    for (const [code] of toRemove) {
      authCodes.delete(code);
    }
    log.warn({ removed: toRemove.length }, 'Auth code limit reached, removed oldest');
  }

  const code = generateSecureToken(32);
  const now = new Date();

  authCodes.set(code, {
    ...data,
    code,
    expiresAt: new Date(now.getTime() + AUTH_CODE_EXPIRY_MS),
    createdAt: now,
  });

  log.debug({ clientId: data.clientId }, 'Auth code stored');
  return code;
}

/**
 * Retrieve and consume an authorization code (one-time use)
 */
export function consumeAuthCode(code: string): StoredAuthCode | null {
  const stored = authCodes.get(code);

  if (!stored) {
    log.debug('Auth code not found');
    return null;
  }

  // Always delete - codes are single use
  authCodes.delete(code);

  // Check expiration
  if (stored.expiresAt < new Date()) {
    log.debug({ clientId: stored.clientId }, 'Auth code expired');
    return null;
  }

  log.debug({ clientId: stored.clientId }, 'Auth code consumed');
  return stored;
}

// ============================================================================
// OAuth Client Storage (Database)
// ============================================================================

/**
 * Create a new OAuth client via Dynamic Client Registration
 */
export async function createOAuthClient(
  data: Omit<StoredOAuthClient, 'clientId' | 'clientSecretHash' | 'createdAt'>
): Promise<{ client: StoredOAuthClient; clientSecret: string }> {
  const clientId = generateSecureToken(16);
  const clientSecret = generateSecureToken(32);
  const clientSecretHash = hashSecret(clientSecret);

  const client = await db.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash,
      clientName: data.clientName,
      redirectUris: data.redirectUris,
      tokenEndpointAuthMethod: data.tokenEndpointAuthMethod,
      grantTypes: data.grantTypes,
      responseTypes: data.responseTypes,
      scope: data.scope,
    },
  });

  log.info({ clientId, clientName: data.clientName }, 'OAuth client created');

  return {
    client: {
      clientId: client.clientId,
      clientSecretHash: client.clientSecretHash,
      clientName: client.clientName ?? undefined,
      redirectUris: client.redirectUris as string[],
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod as TokenEndpointAuthMethod,
      grantTypes: client.grantTypes as GrantType[],
      responseTypes: client.responseTypes as ResponseType[],
      scope: client.scope,
      createdAt: client.createdAt,
    },
    clientSecret,
  };
}

/**
 * Get an OAuth client by ID
 */
export async function getOAuthClient(clientId: string): Promise<StoredOAuthClient | null> {
  const client = await db.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) return null;

  return {
    clientId: client.clientId,
    clientSecretHash: client.clientSecretHash,
    clientName: client.clientName ?? undefined,
    redirectUris: client.redirectUris as string[],
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod as TokenEndpointAuthMethod,
    grantTypes: client.grantTypes as GrantType[],
    responseTypes: client.responseTypes as ResponseType[],
    scope: client.scope,
    createdAt: client.createdAt,
  };
}

/**
 * Validate client credentials
 */
export async function validateClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<StoredOAuthClient | null> {
  const client = await getOAuthClient(clientId);

  if (!client || !client.clientSecretHash) {
    return null;
  }

  const secretHash = hashSecret(clientSecret);
  if (secretHash !== client.clientSecretHash) {
    log.debug({ clientId }, 'Invalid client secret');
    return null;
  }

  return client;
}

/**
 * Delete an OAuth client
 */
export async function deleteOAuthClient(clientId: string): Promise<boolean> {
  try {
    await db.oAuthClient.delete({ where: { clientId } });
    log.info({ clientId }, 'OAuth client deleted');
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Refresh Token Storage (Database)
// ============================================================================

/**
 * Create a refresh token
 */
export async function createRefreshToken(
  data: Omit<StoredRefreshToken, 'token' | 'tokenHash' | 'expiresAt' | 'createdAt'>
): Promise<string> {
  const token = generateSecureToken(32);
  const tokenHash = hashSecret(token);
  const now = new Date();

  await db.oAuthRefreshToken.create({
    data: {
      tokenHash,
      clientId: data.clientId,
      userId: data.userId,
      scope: data.scope,
      resource: data.resource,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_EXPIRY_MS),
    },
  });

  log.debug({ clientId: data.clientId, userId: data.userId }, 'Refresh token created');
  return token;
}

/**
 * Validate and consume a refresh token (rotation)
 * Returns the token data if valid, null otherwise
 */
export async function consumeRefreshToken(
  token: string,
  clientId: string
): Promise<Omit<StoredRefreshToken, 'token' | 'tokenHash'> | null> {
  const tokenHash = hashSecret(token);

  const stored = await db.oAuthRefreshToken.findUnique({
    where: { tokenHash },
  });

  if (!stored) {
    log.debug('Refresh token not found');
    return null;
  }

  // Validate client
  if (stored.clientId !== clientId) {
    log.warn({ clientId, storedClientId: stored.clientId }, 'Refresh token client mismatch');
    return null;
  }

  // Delete the token (rotation - each token is single use)
  await db.oAuthRefreshToken.delete({ where: { tokenHash } });

  // Check expiration
  if (stored.expiresAt < new Date()) {
    log.debug({ clientId }, 'Refresh token expired');
    return null;
  }

  log.debug({ clientId, userId: stored.userId }, 'Refresh token consumed');
  return {
    clientId: stored.clientId,
    userId: stored.userId,
    scope: stored.scope,
    resource: stored.resource,
    expiresAt: stored.expiresAt,
    createdAt: stored.createdAt,
  };
}

/**
 * Revoke all refresh tokens for a user/client combination
 */
export async function revokeRefreshTokens(userId: string, clientId?: string): Promise<number> {
  const result = await db.oAuthRefreshToken.deleteMany({
    where: {
      userId,
      ...(clientId && { clientId }),
    },
  });

  log.info({ userId, clientId, count: result.count }, 'Refresh tokens revoked');
  return result.count;
}

/**
 * Clean up expired refresh tokens
 */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const result = await db.oAuthRefreshToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    log.info({ count: result.count }, 'Expired refresh tokens cleaned up');
  }

  return result.count;
}

// ============================================================================
// User Lookup (for API key to user mapping)
// ============================================================================

/**
 * Get user by API key (for authorization)
 * This maps API keys to users for OAuth token issuance
 */
export async function getUserByApiKey(apiKey: string): Promise<{ id: string; email: string } | null> {
  const keyHash = hashSecret(apiKey);

  const apiKeyRecord = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKeyRecord) return null;

  // Check expiration
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return null;
  }

  // Update last used
  await db.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsed: new Date() },
  });

  return {
    id: apiKeyRecord.user.id,
    email: apiKeyRecord.user.email,
  };
}
