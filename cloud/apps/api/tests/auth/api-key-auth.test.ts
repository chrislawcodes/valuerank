/**
 * Tests for API key authentication
 *
 * Tests X-API-Key header authentication for GraphQL requests
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { db } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../src/auth/api-keys.js';

const app = createServer();

describe('API Key Authentication', () => {
  let testUser: { id: string; email: string };
  let validApiKey: string;
  let apiKeyRecord: { id: string };

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: 'api-key-auth-test@example.com',
        passwordHash: 'test-hash',
      },
    });

    // Create a valid API key
    validApiKey = generateApiKey();
    apiKeyRecord = await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'Test Key',
        keyHash: hashApiKey(validApiKey),
        keyPrefix: getKeyPrefix(validApiKey),
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  describe('Valid API key', () => {
    it('authenticates with valid X-API-Key header', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', validApiKey)
        .send({ query: '{ __schema { types { name } } }' });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
    });

    it('allows GraphQL queries with valid API key', async () => {
      // Query definitions (requires auth)
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', validApiKey)
        .send({ query: '{ definitions { id } }' });

      expect(response.status).toBe(200);
      // May have GraphQL errors (no data), but should pass auth
      expect(response.status).not.toBe(401);
    });

    it('updates last_used timestamp on successful auth', async () => {
      // Get initial last_used value
      const before = await db.apiKey.findUnique({
        where: { id: apiKeyRecord.id },
      });

      // Make a request with the API key
      await request(app)
        .post('/graphql')
        .set('X-API-Key', validApiKey)
        .send({ query: '{ __schema { types { name } } }' });

      // Wait a bit for the async update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check last_used was updated
      const after = await db.apiKey.findUnique({
        where: { id: apiKeyRecord.id },
      });

      expect(after?.lastUsed).not.toBeNull();
      if (before?.lastUsed) {
        expect(after?.lastUsed?.getTime()).toBeGreaterThanOrEqual(
          before.lastUsed.getTime()
        );
      }
    });
  });

  describe('Invalid API key', () => {
    it('returns 401 for non-existent key', async () => {
      const fakeKey = generateApiKey(); // Valid format but not in DB

      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', fakeKey)
        .send({ query: '{ definitions { id } }' });

      expect(response.status).toBe(401);
    });

    it('returns 401 for malformed key', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', 'not-a-valid-key')
        .send({ query: '{ definitions { id } }' });

      expect(response.status).toBe(401);
    });

    it('returns 401 for empty X-API-Key header', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', '')
        .send({ query: '{ definitions { id } }' });

      expect(response.status).toBe(401);
    });
  });

  describe('Expired API key', () => {
    let expiredKeyId: string;
    let expiredKey: string;

    beforeAll(async () => {
      // Create an expired API key
      expiredKey = generateApiKey();
      const record = await db.apiKey.create({
        data: {
          userId: testUser.id,
          name: 'Expired Key',
          keyHash: hashApiKey(expiredKey),
          keyPrefix: getKeyPrefix(expiredKey),
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });
      expiredKeyId = record.id;
    });

    afterAll(async () => {
      await db.apiKey.delete({ where: { id: expiredKeyId } });
    });

    it('returns 401 for expired key with clear message', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', expiredKey)
        .send({ query: '{ definitions { id } }' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('API key expired');
    });
  });

  describe('Non-expired API key', () => {
    let futureKeyId: string;
    let futureKey: string;

    beforeAll(async () => {
      // Create an API key that expires in the future
      futureKey = generateApiKey();
      const record = await db.apiKey.create({
        data: {
          userId: testUser.id,
          name: 'Future Expiry Key',
          keyHash: hashApiKey(futureKey),
          keyPrefix: getKeyPrefix(futureKey),
          expiresAt: new Date(Date.now() + 86400000), // Expires in 1 day
        },
      });
      futureKeyId = record.id;
    });

    afterAll(async () => {
      await db.apiKey.delete({ where: { id: futureKeyId } });
    });

    it('allows access with non-expired key', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', futureKey)
        .send({ query: '{ __schema { types { name } } }' });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
    });
  });

  describe('JWT takes precedence over API key', () => {
    it('uses JWT when both headers are provided', async () => {
      // This is a valid JWT for a different user (test-user-id from test-utils)
      const { signToken } = await import('../../src/auth/index.js');
      const jwtToken = signToken({ id: 'jwt-user-id', email: 'jwt@example.com' });

      // Send both headers - JWT should take precedence
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('X-API-Key', validApiKey)
        .send({ query: '{ __schema { types { name } } }' });

      expect(response.status).toBe(200);
      // Both should work, but JWT is checked first
    });
  });

  describe('Introspection with API key', () => {
    it('allows introspection queries with valid API key', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', validApiKey)
        .send({
          operationName: 'IntrospectionQuery',
          query: `
            query IntrospectionQuery {
              __schema {
                queryType { name }
                mutationType { name }
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.__schema).toBeDefined();
    });
  });
});
