/**
 * Tests for API key GraphQL mutations
 *
 * Tests createApiKey mutation for secure key generation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { signToken } from '../../../src/auth/index.js';
import { hashApiKey } from '../../../src/auth/api-keys.js';

const app = createServer();

describe('GraphQL API Key Mutations', () => {
  const createdApiKeyIds: string[] = [];
  let testUser: { id: string; email: string };
  let authHeader: string;

  beforeAll(async () => {
    // Create a test user in the database for API key tests
    testUser = await db.user.create({
      data: {
        email: 'apikey-test@example.com',
        passwordHash: 'test-hash',
      },
    });
    // Generate auth token for this user
    authHeader = `Bearer ${signToken({ id: testUser.id, email: testUser.email })}`;
  });

  afterAll(async () => {
    // Clean up test user and their API keys
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  afterEach(async () => {
    // Clean up created API keys
    if (createdApiKeyIds.length > 0) {
      await db.apiKey.deleteMany({
        where: { id: { in: createdApiKeyIds } },
      });
      createdApiKeyIds.length = 0;
    }
  });

  describe('createApiKey', () => {
    it('creates an API key with valid name', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
              name
              keyPrefix
              createdAt
              expiresAt
              lastUsedAt
            }
            key
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Claude Desktop',
            },
          },
        });

      if (response.status !== 200 || response.body.errors) {
        console.log('Response:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.createApiKey;
      createdApiKeyIds.push(result.apiKey.id);

      expect(result.apiKey.name).toBe('Claude Desktop');
      expect(result.apiKey.keyPrefix).toMatch(/^vr_[a-zA-Z0-9]{7}$/);
      expect(result.apiKey.createdAt).toBeDefined();
      expect(result.apiKey.expiresAt).toBeNull();
      expect(result.apiKey.lastUsedAt).toBeNull();

      // Full key should be returned
      expect(result.key).toMatch(/^vr_[a-zA-Z0-9]{32}$/);
      expect(result.key.startsWith(result.apiKey.keyPrefix)).toBe(true);
    });

    it('stores hashed key in database, not plaintext', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
            }
            key
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: {
            input: { name: 'Hash Test Key' },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.createApiKey;
      createdApiKeyIds.push(result.apiKey.id);

      // Check the database directly
      const dbKey = await db.apiKey.findUnique({
        where: { id: result.apiKey.id },
      });

      expect(dbKey).toBeDefined();
      // Database should NOT store the full key
      expect(dbKey!.keyHash).not.toBe(result.key);
      // Database should store the SHA-256 hash
      expect(dbKey!.keyHash).toBe(hashApiKey(result.key));
      // Prefix should match
      expect(dbKey!.keyPrefix).toBe(result.key.substring(0, 10));
    });

    it('generates unique keys for each request', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
            }
            key
          }
        }
      `;

      const response1 = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: { input: { name: 'Key 1' } },
        })
        .expect(200);

      const response2 = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: { input: { name: 'Key 2' } },
        })
        .expect(200);

      expect(response1.body.errors).toBeUndefined();
      expect(response2.body.errors).toBeUndefined();

      createdApiKeyIds.push(response1.body.data.createApiKey.apiKey.id);
      createdApiKeyIds.push(response2.body.data.createApiKey.apiKey.id);

      // Keys should be different
      expect(response1.body.data.createApiKey.key).not.toBe(
        response2.body.data.createApiKey.key
      );
    });

    it('requires authentication', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
            }
            key
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        // No auth header
        .send({
          query: mutation,
          variables: { input: { name: 'Unauthenticated Key' } },
        });

      // Should get 401 at the middleware level
      expect(response.status).toBe(401);
    });

    it('returns error for empty name', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
            }
            key
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: { input: { name: '' } },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Name is required');
    });

    it('returns error for name exceeding 100 characters', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
            }
            key
          }
        }
      `;

      const longName = 'a'.repeat(101);
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: { input: { name: longName } },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('100 characters');
    });

    it('accepts name at maximum length (100 characters)', async () => {
      const mutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey {
              id
              name
            }
            key
          }
        }
      `;

      const maxName = 'a'.repeat(100);
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: { input: { name: maxName } },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      createdApiKeyIds.push(response.body.data.createApiKey.apiKey.id);
      expect(response.body.data.createApiKey.apiKey.name).toBe(maxName);
    });
  });

  describe('revokeApiKey', () => {
    it('revokes an API key owned by the current user', async () => {
      // First create an API key
      const createMutation = `
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            apiKey { id }
            key
          }
        }
      `;

      const createResponse = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: createMutation,
          variables: { input: { name: 'Key to Revoke' } },
        })
        .expect(200);

      const keyId = createResponse.body.data.createApiKey.apiKey.id;
      const fullKey = createResponse.body.data.createApiKey.key;

      // Revoke the key
      const revokeMutation = `
        mutation RevokeApiKey($id: ID!) {
          revokeApiKey(id: $id)
        }
      `;

      const revokeResponse = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: revokeMutation,
          variables: { id: keyId },
        })
        .expect(200);

      expect(revokeResponse.body.errors).toBeUndefined();
      expect(revokeResponse.body.data.revokeApiKey).toBe(true);

      // Verify the key no longer exists
      const dbKey = await db.apiKey.findUnique({ where: { id: keyId } });
      expect(dbKey).toBeNull();

      // Verify the key can no longer be used for auth
      const authResponse = await request(app)
        .post('/graphql')
        .set('X-API-Key', fullKey)
        .send({ query: '{ definitions { id } }' });

      expect(authResponse.status).toBe(401);
    });

    it('returns error for non-existent key', async () => {
      const mutation = `
        mutation RevokeApiKey($id: ID!) {
          revokeApiKey(id: $id)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader)
        .send({
          query: mutation,
          variables: { id: 'nonexistent-key-id' },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('ApiKey not found');
    });

    it('returns error when trying to revoke another user\'s key', async () => {
      // Create another user and their API key
      const otherUser = await db.user.create({
        data: {
          email: 'other-user@example.com',
          passwordHash: 'test-hash',
        },
      });

      const otherKey = await db.apiKey.create({
        data: {
          userId: otherUser.id,
          name: 'Other User Key',
          keyHash: 'other-key-hash',
          keyPrefix: 'vr_other12',
        },
      });

      // Try to revoke the other user's key
      const mutation = `
        mutation RevokeApiKey($id: ID!) {
          revokeApiKey(id: $id)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', authHeader) // Our test user's auth
        .send({
          query: mutation,
          variables: { id: otherKey.id },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('ApiKey not found');

      // Clean up
      await db.apiKey.delete({ where: { id: otherKey.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    });

    it('requires authentication', async () => {
      const mutation = `
        mutation RevokeApiKey($id: ID!) {
          revokeApiKey(id: $id)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        // No auth header
        .send({
          query: mutation,
          variables: { id: 'some-key-id' },
        });

      expect(response.status).toBe(401);
    });
  });
});
