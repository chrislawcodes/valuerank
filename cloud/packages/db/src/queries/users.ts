/**
 * User and API key query helpers.
 * Handles authentication-related database operations.
 */

import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { db } from '../client.js';
import type { User, ApiKey } from '@prisma/client';

const log = createLogger('db:users');

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  name?: string;
};

export type CreateApiKeyInput = {
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  expiresAt?: Date;
};

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type UserWithApiKeys = User & {
  apiKeys: ApiKey[];
};

export type ApiKeyInfo = Omit<ApiKey, 'keyHash'>;

// ============================================================================
// USER CREATE OPERATIONS
// ============================================================================

/**
 * Create a new user.
 */
export async function createUser(data: CreateUserInput): Promise<User> {
  if (!data.email?.trim()) {
    throw new ValidationError('Email is required', { field: 'email' });
  }
  if (!data.passwordHash) {
    throw new ValidationError('Password hash is required', { field: 'passwordHash' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    throw new ValidationError('Invalid email format', { field: 'email' });
  }

  log.info({ email: data.email }, 'Creating user');

  try {
    return await db.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash: data.passwordHash,
        name: data.name,
      },
    });
  } catch (error) {
    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes('Unique constraint')
    ) {
      throw new ValidationError('Email already exists', { field: 'email' });
    }
    throw error;
  }
}

// ============================================================================
// USER READ OPERATIONS
// ============================================================================

/**
 * Get a user by ID.
 */
export async function getUserById(id: string): Promise<User> {
  log.debug({ id }, 'Fetching user by ID');

  const user = await db.user.findUnique({ where: { id } });
  if (!user) {
    log.warn({ id }, 'User not found');
    throw new NotFoundError('User', id);
  }

  return user;
}

/**
 * Get a user by email.
 * Returns null if not found (for login flows).
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  log.debug({ email }, 'Fetching user by email');

  return db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
}

/**
 * Get a user with their API keys.
 */
export async function getUserWithApiKeys(id: string): Promise<UserWithApiKeys> {
  const user = await db.user.findUnique({
    where: { id },
    include: { apiKeys: true },
  });

  if (!user) {
    throw new NotFoundError('User', id);
  }

  return user;
}

// ============================================================================
// USER UPDATE OPERATIONS
// ============================================================================

/**
 * Update a user's profile.
 */
export async function updateUser(
  id: string,
  data: { name?: string; passwordHash?: string }
): Promise<User> {
  log.info({ id }, 'Updating user');

  // Verify exists
  await getUserById(id);

  return db.user.update({
    where: { id },
    data,
  });
}

// ============================================================================
// API KEY OPERATIONS
// ============================================================================

/**
 * Create a new API key for a user.
 */
export async function createApiKey(data: CreateApiKeyInput): Promise<ApiKey> {
  if (!data.userId) {
    throw new ValidationError('User ID is required', { field: 'userId' });
  }
  if (!data.name?.trim()) {
    throw new ValidationError('API key name is required', { field: 'name' });
  }
  if (!data.keyHash) {
    throw new ValidationError('Key hash is required', { field: 'keyHash' });
  }
  if (!data.keyPrefix) {
    throw new ValidationError('Key prefix is required', { field: 'keyPrefix' });
  }

  // Verify user exists
  await getUserById(data.userId);

  log.info({ userId: data.userId, name: data.name }, 'Creating API key');

  return db.apiKey.create({
    data: {
      userId: data.userId,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      expiresAt: data.expiresAt,
    },
  });
}

/**
 * Get an API key by its prefix.
 * Used for authentication - matches the prefix and returns the full key record.
 */
export async function getApiKeyByPrefix(prefix: string): Promise<ApiKey | null> {
  log.debug({ prefix }, 'Looking up API key by prefix');

  const apiKey = await db.apiKey.findFirst({
    where: { keyPrefix: prefix },
  });

  if (apiKey) {
    // Update last used timestamp
    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsed: new Date() },
    });
  }

  return apiKey;
}

/**
 * List all API keys for a user (without revealing the hash).
 */
export async function listApiKeysForUser(userId: string): Promise<ApiKeyInfo[]> {
  log.debug({ userId }, 'Listing API keys for user');

  const apiKeys = await db.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  // Remove keyHash from response for security
  return apiKeys.map(({ keyHash: _keyHash, ...rest }) => rest);
}

/**
 * Delete an API key.
 */
export async function deleteApiKey(id: string): Promise<void> {
  log.info({ id }, 'Deleting API key');

  const apiKey = await db.apiKey.findUnique({ where: { id } });
  if (!apiKey) {
    throw new NotFoundError('ApiKey', id);
  }

  await db.apiKey.delete({ where: { id } });
}

/**
 * Delete all API keys for a user.
 */
export async function deleteAllApiKeysForUser(userId: string): Promise<{ count: number }> {
  log.info({ userId }, 'Deleting all API keys for user');

  return db.apiKey.deleteMany({ where: { userId } });
}
