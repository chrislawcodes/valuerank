/**
 * Tests for user GraphQL queries
 *
 * Tests `me` and `apiKeys` queries
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { signToken } from '../../../src/auth/index.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../../src/auth/api-keys.js';

const app = createServer();

describe('GraphQL User Queries', () => {
  let testUser: { id: string; email: string; name: string | null; createdAt: Date };
  let authHeader: string;
  let testApiKey1: { id: string; name: string; keyPrefix: string };
  let testApiKey2: { id: string; name: string; keyPrefix: string };

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: 'user-queries-test@example.com',
        passwordHash: 'test-hash',
        name: 'Test User',
      },
    });
    authHeader = `Bearer ${signToken({ id: testUser.id, email: testUser.email })}`;

    // Create two API keys for the user
    const key1 = generateApiKey();
    testApiKey1 = await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'Key One',
        keyHash: hashApiKey(key1),
        keyPrefix: getKeyPrefix(key1),
      },
    });

    const key2 = generateApiKey();
    testApiKey2 = await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'Key Two',
        keyHash: hashApiKey(key2),
        keyPrefix: getKeyPrefix(key2),
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  describe('me query', () => {
    it('returns current user when authenticated', async () => {
      const query = `
        query Me {
          me {
            id
            email
            name
            createdAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.me).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        name: 'Test User',
      });
      expect(response.body.data.me.createdAt).toBeDefined();
    });

    it('returns null when not authenticated', async () => {
      const query = `
        query Me {
          me {
            id
            email
          }
        }
      `;

      // Introspection-like queries bypass auth, but me query checks ctx.user
      const response = await request(app)
        .post('/graphql')
        .send({ query });

      // Should return 401 since GraphQL auth middleware requires auth
      expect(response.status).toBe(401);
    });

    it('returns null when user is deleted after authentication', async () => {
      // Create a temporary user
      const tempUser = await db.user.create({
        data: {
          email: 'deleted-user-test@example.com',
          passwordHash: 'test-hash',
        },
      });
      const tempAuthHeader = `Bearer ${signToken({ id: tempUser.id, email: tempUser.email })}`;

      // Delete the user before making the query
      await db.user.delete({ where: { id: tempUser.id } });

      const query = `
        query Me {
          me {
            id
            email
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', tempAuthHeader)
        .send({ query })
        .expect(200);

      // Should return null for me since user no longer exists in database
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.me).toBeNull();
    });
  });

  describe('apiKeys query', () => {
    it('returns all API keys for current user', async () => {
      const query = `
        query ApiKeys {
          apiKeys {
            id
            name
            keyPrefix
            createdAt
            lastUsedAt
            expiresAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.apiKeys).toHaveLength(2);

      // Should be ordered by createdAt desc (newest first)
      const keys = response.body.data.apiKeys;
      expect(keys.some((k: { id: string }) => k.id === testApiKey1.id)).toBe(true);
      expect(keys.some((k: { id: string }) => k.id === testApiKey2.id)).toBe(true);

      // Verify key data shape
      const key = keys.find((k: { id: string }) => k.id === testApiKey1.id);
      expect(key.name).toBe('Key One');
      expect(key.keyPrefix).toMatch(/^vr_/);
      expect(key.createdAt).toBeDefined();
    });

    it('only returns key prefix, not full key', async () => {
      const query = `
        query ApiKeys {
          apiKeys {
            id
            keyPrefix
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Verify keyPrefix is short (vr_ + 7 chars = 10 chars)
      for (const key of response.body.data.apiKeys) {
        expect(key.keyPrefix.length).toBe(10);
        expect(key.keyPrefix).toMatch(/^vr_[a-zA-Z0-9]{7}$/);
      }
    });

    it('does not return keys from other users', async () => {
      // Create another user with an API key
      const otherUser = await db.user.create({
        data: {
          email: 'other-user-keys@example.com',
          passwordHash: 'test-hash',
        },
      });

      const otherKey = generateApiKey();
      const otherApiKey = await db.apiKey.create({
        data: {
          userId: otherUser.id,
          name: 'Other User Key',
          keyHash: hashApiKey(otherKey),
          keyPrefix: getKeyPrefix(otherKey),
        },
      });

      // Query as our test user
      const query = `
        query ApiKeys {
          apiKeys {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Should only have our test user's keys
      const keyIds = response.body.data.apiKeys.map((k: { id: string }) => k.id);
      expect(keyIds).toContain(testApiKey1.id);
      expect(keyIds).toContain(testApiKey2.id);
      expect(keyIds).not.toContain(otherApiKey.id);

      // Clean up
      await db.apiKey.delete({ where: { id: otherApiKey.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    });

    it('requires authentication', async () => {
      const query = `
        query ApiKeys {
          apiKeys {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        // No auth header
        .send({ query });

      expect(response.status).toBe(401);
    });

    it('returns empty array when user has no keys', async () => {
      // Create a new user with no keys
      const newUser = await db.user.create({
        data: {
          email: 'no-keys-user@example.com',
          passwordHash: 'test-hash',
        },
      });
      const newAuthHeader = `Bearer ${signToken({ id: newUser.id, email: newUser.email })}`;

      const query = `
        query ApiKeys {
          apiKeys {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', newAuthHeader)
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.apiKeys).toEqual([]);

      // Clean up
      await db.user.delete({ where: { id: newUser.id } });
    });
  });
});
