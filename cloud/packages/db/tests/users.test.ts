/**
 * Integration tests for user and API key query helpers.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createUser,
  getUserById,
  getUserByEmail,
  getUserWithApiKeys,
  updateUser,
  createApiKey,
  getApiKeyByPrefix,
  listApiKeysForUser,
  deleteApiKey,
  deleteAllApiKeysForUser,
} from '../src/queries/users.js';

const prisma = new PrismaClient();

// Skip tests if no database URL
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

skipIfNoDb('User Queries (Integration)', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createUser', () => {
    it('creates a user with valid email and password hash', async () => {
      const result = await createUser({
        email: 'users-db-test@example.com',
        passwordHash: 'hashed_password_123',
        name: 'Test User',
      });

      expect(result.id).toBeDefined();
      expect(result.email).toBe('users-db-test@example.com');
      expect(result.name).toBe('Test User');
    });

    it('normalizes email to lowercase', async () => {
      const result = await createUser({
        email: 'USERS-DB-TEST@EXAMPLE.COM',
        passwordHash: 'hash',
      });

      expect(result.email).toBe('users-db-test@example.com');
    });

    it('throws on empty email', async () => {
      await expect(
        createUser({ email: '', passwordHash: 'hash' })
      ).rejects.toThrow('Email is required');
    });

    it('throws on invalid email format', async () => {
      await expect(
        createUser({ email: 'not-an-email', passwordHash: 'hash' })
      ).rejects.toThrow('Invalid email format');
    });

    it('throws on duplicate email', async () => {
      await createUser({
        email: 'duplicate@example.com',
        passwordHash: 'hash1',
      });

      await expect(
        createUser({
          email: 'duplicate@example.com',
          passwordHash: 'hash2',
        })
      ).rejects.toThrow('Email already exists');
    });

    it('throws on missing password hash', async () => {
      await expect(
        createUser({ email: 'users-db-test@example.com', passwordHash: '' })
      ).rejects.toThrow('Password hash is required');
    });
  });

  describe('getUserById', () => {
    it('returns user when exists', async () => {
      const created = await createUser({
        email: 'byid@example.com',
        passwordHash: 'hash',
      });

      const result = await getUserById(created.id);

      expect(result.id).toBe(created.id);
      expect(result.email).toBe('byid@example.com');
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(getUserById('non-existent-id')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getUserByEmail', () => {
    it('returns user when exists', async () => {
      await createUser({
        email: 'byemail@example.com',
        passwordHash: 'hash',
      });

      const result = await getUserByEmail('byemail@example.com');

      expect(result).not.toBeNull();
      expect(result?.email).toBe('byemail@example.com');
    });

    it('returns null when not exists', async () => {
      const result = await getUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('is case insensitive', async () => {
      await createUser({
        email: 'case@example.com',
        passwordHash: 'hash',
      });

      const result = await getUserByEmail('CASE@EXAMPLE.COM');

      expect(result).not.toBeNull();
    });
  });

  describe('getUserWithApiKeys', () => {
    it('returns user with their API keys', async () => {
      const user = await createUser({
        email: 'withkeys@example.com',
        passwordHash: 'hash',
      });

      await createApiKey({
        userId: user.id,
        name: 'Key 1',
        keyHash: 'hash1',
        keyPrefix: 'vr_k1_',
      });

      const result = await getUserWithApiKeys(user.id);

      expect(result.id).toBe(user.id);
      expect(result.apiKeys).toHaveLength(1);
      expect(result.apiKeys[0].name).toBe('Key 1');
    });

    it('throws NotFoundError when user not exists', async () => {
      await expect(getUserWithApiKeys('non-existent')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('updateUser', () => {
    it('updates user name', async () => {
      const user = await createUser({
        email: 'update@example.com',
        passwordHash: 'hash',
      });

      const result = await updateUser(user.id, { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('updates password hash', async () => {
      const user = await createUser({
        email: 'updatepw@example.com',
        passwordHash: 'old_hash',
      });

      const result = await updateUser(user.id, { passwordHash: 'new_hash' });

      expect(result.passwordHash).toBe('new_hash');
    });

    it('throws NotFoundError for non-existent user', async () => {
      await expect(updateUser('non-existent', { name: 'Test' })).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('API Key Operations', () => {
    it('creates an API key for a user', async () => {
      const user = await createUser({
        email: 'apikey@example.com',
        passwordHash: 'hash',
      });

      const apiKey = await createApiKey({
        userId: user.id,
        name: 'Test Key',
        keyHash: 'hashed_key_value',
        keyPrefix: 'vr_test_',
      });

      expect(apiKey.id).toBeDefined();
      expect(apiKey.name).toBe('Test Key');
      expect(apiKey.keyPrefix).toBe('vr_test_');
      expect(apiKey.userId).toBe(user.id);
    });

    it('throws on non-existent user', async () => {
      await expect(
        createApiKey({
          userId: 'non-existent',
          name: 'Test',
          keyHash: 'hash',
          keyPrefix: 'vr_',
        })
      ).rejects.toThrow('User not found');
    });

    it('getApiKeyByPrefix returns key when exists', async () => {
      const user = await createUser({
        email: 'prefix@example.com',
        passwordHash: 'hash',
      });

      await createApiKey({
        userId: user.id,
        name: 'Prefix Key',
        keyHash: 'hash123',
        keyPrefix: 'vr_unique_',
      });

      const result = await getApiKeyByPrefix('vr_unique_');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Prefix Key');
    });

    it('getApiKeyByPrefix returns null when not exists', async () => {
      const result = await getApiKeyByPrefix('non_existent_');

      expect(result).toBeNull();
    });

    it('listApiKeysForUser returns all keys without hashes', async () => {
      const user = await createUser({
        email: 'list@example.com',
        passwordHash: 'hash',
      });

      await createApiKey({
        userId: user.id,
        name: 'Key 1',
        keyHash: 'hash1',
        keyPrefix: 'vr_1_',
      });
      await createApiKey({
        userId: user.id,
        name: 'Key 2',
        keyHash: 'hash2',
        keyPrefix: 'vr_2_',
      });

      const keys = await listApiKeysForUser(user.id);

      expect(keys.length).toBe(2);
      // Verify keyHash is not included
      expect(keys.every((k) => !('keyHash' in k))).toBe(true);
    });

    it('deleteApiKey removes the key', async () => {
      const user = await createUser({
        email: 'delete@example.com',
        passwordHash: 'hash',
      });

      const apiKey = await createApiKey({
        userId: user.id,
        name: 'To Delete',
        keyHash: 'hash',
        keyPrefix: 'vr_del_',
      });

      await deleteApiKey(apiKey.id);

      const keys = await listApiKeysForUser(user.id);
      expect(keys.length).toBe(0);
    });

    it('deleteApiKey throws NotFoundError for non-existent key', async () => {
      await expect(deleteApiKey('non-existent')).rejects.toThrow(
        'ApiKey not found'
      );
    });

    it('cascade deletes API keys when user is deleted', async () => {
      const user = await createUser({
        email: 'cascade@example.com',
        passwordHash: 'hash',
      });

      await createApiKey({
        userId: user.id,
        name: 'Cascaded Key',
        keyHash: 'hash',
        keyPrefix: 'vr_cas_',
      });

      // Delete the user directly
      await prisma.user.delete({ where: { id: user.id } });

      // API key should also be deleted
      const result = await getApiKeyByPrefix('vr_cas_');
      expect(result).toBeNull();
    });

    it('throws on missing user ID', async () => {
      await expect(
        createApiKey({
          userId: '',
          name: 'Test',
          keyHash: 'hash',
          keyPrefix: 'vr_',
        })
      ).rejects.toThrow('User ID is required');
    });

    it('throws on missing key name', async () => {
      const user = await createUser({
        email: 'keyname@example.com',
        passwordHash: 'hash',
      });

      await expect(
        createApiKey({
          userId: user.id,
          name: '',
          keyHash: 'hash',
          keyPrefix: 'vr_',
        })
      ).rejects.toThrow('API key name is required');
    });

    it('throws on missing key hash', async () => {
      const user = await createUser({
        email: 'keyhash@example.com',
        passwordHash: 'hash',
      });

      await expect(
        createApiKey({
          userId: user.id,
          name: 'Test',
          keyHash: '',
          keyPrefix: 'vr_',
        })
      ).rejects.toThrow('Key hash is required');
    });

    it('throws on missing key prefix', async () => {
      const user = await createUser({
        email: 'keyprefix@example.com',
        passwordHash: 'hash',
      });

      await expect(
        createApiKey({
          userId: user.id,
          name: 'Test',
          keyHash: 'hash',
          keyPrefix: '',
        })
      ).rejects.toThrow('Key prefix is required');
    });

    it('creates API key with expiration', async () => {
      const user = await createUser({
        email: 'expires@example.com',
        passwordHash: 'hash',
      });

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

      const result = await createApiKey({
        userId: user.id,
        name: 'Expiring Key',
        keyHash: 'hash',
        keyPrefix: 'vr_exp_',
        expiresAt,
      });

      expect(result.expiresAt).toEqual(expiresAt);
    });
  });

  describe('deleteAllApiKeysForUser', () => {
    it('deletes all API keys for a user', async () => {
      const user = await createUser({
        email: 'deleteall@example.com',
        passwordHash: 'hash',
      });

      await createApiKey({
        userId: user.id,
        name: 'Key 1',
        keyHash: 'hash1',
        keyPrefix: 'vr_d1_',
      });
      await createApiKey({
        userId: user.id,
        name: 'Key 2',
        keyHash: 'hash2',
        keyPrefix: 'vr_d2_',
      });

      const result = await deleteAllApiKeysForUser(user.id);

      expect(result.count).toBe(2);

      const keys = await listApiKeysForUser(user.id);
      expect(keys.length).toBe(0);
    });

    it('returns zero count when user has no keys', async () => {
      const user = await createUser({
        email: 'nokeys@example.com',
        passwordHash: 'hash',
      });

      const result = await deleteAllApiKeysForUser(user.id);

      expect(result.count).toBe(0);
    });
  });
});
