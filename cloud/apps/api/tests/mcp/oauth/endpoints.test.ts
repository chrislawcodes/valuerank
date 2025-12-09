/**
 * OAuth Endpoint Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { hashApiKey, generateApiKey } from '../../../src/auth/api-keys.js';
import { generateCodeVerifier, generateCodeChallenge } from '../../../src/mcp/oauth/pkce.js';
import type { Express } from 'express';

describe('OAuth Endpoints', () => {
  let app: Express;
  let testUser: { id: string; email: string };
  let testApiKey: string;

  beforeAll(async () => {
    app = createServer();

    // Create test user
    testUser = await db.user.create({
      data: {
        email: `oauth-test-${Date.now()}@valuerank.ai`,
        passwordHash: 'test-hash',
      },
    });

    // Create test API key
    testApiKey = generateApiKey();
    await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'OAuth Test Key',
        keyHash: hashApiKey(testApiKey),
        keyPrefix: testApiKey.slice(0, 10),
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.oAuthRefreshToken.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  describe('GET /.well-known/oauth-authorization-server', () => {
    it('returns authorization server metadata', async () => {
      const res = await request(app)
        .get('/.well-known/oauth-authorization-server')
        .expect(200);

      expect(res.body.issuer).toBeDefined();
      expect(res.body.authorization_endpoint).toContain('/oauth/authorize');
      expect(res.body.token_endpoint).toContain('/oauth/token');
      expect(res.body.registration_endpoint).toContain('/oauth/register');
      expect(res.body.scopes_supported).toContain('mcp:read');
      expect(res.body.scopes_supported).toContain('mcp:write');
      expect(res.body.response_types_supported).toContain('code');
      expect(res.body.grant_types_supported).toContain('authorization_code');
      expect(res.body.grant_types_supported).toContain('refresh_token');
      expect(res.body.code_challenge_methods_supported).toContain('S256');
    });
  });

  describe('GET /mcp/.well-known/resource.json', () => {
    it('returns protected resource metadata', async () => {
      const res = await request(app)
        .get('/mcp/.well-known/resource.json')
        .expect(200);

      expect(res.body.resource).toContain('/mcp');
      expect(res.body.authorization_servers).toBeInstanceOf(Array);
      expect(res.body.authorization_servers.length).toBeGreaterThan(0);
      expect(res.body.scopes_supported).toContain('mcp:read');
      expect(res.body.bearer_methods_supported).toContain('header');
    });
  });

  describe('HEAD /mcp', () => {
    it('returns MCP protocol version header', async () => {
      const res = await request(app)
        .head('/mcp')
        .expect(200);

      expect(res.headers['mcp-protocol-version']).toBe('2025-06-18');
    });
  });

  describe('POST /oauth/register', () => {
    let createdClientId: string;

    afterAll(async () => {
      if (createdClientId) {
        await db.oAuthClient.deleteMany({ where: { clientId: createdClientId } });
      }
    });

    it('registers a new OAuth client', async () => {
      const res = await request(app)
        .post('/oauth/register')
        .send({
          redirect_uris: ['https://example.com/callback'],
          client_name: 'Test Client',
        })
        .expect(201);

      expect(res.body.client_id).toBeDefined();
      expect(res.body.client_secret).toBeDefined();
      expect(res.body.redirect_uris).toEqual(['https://example.com/callback']);
      expect(res.body.client_name).toBe('Test Client');
      expect(res.body.token_endpoint_auth_method).toBe('client_secret_post');
      expect(res.body.grant_types).toContain('authorization_code');

      createdClientId = res.body.client_id;
    });

    it('rejects registration without redirect_uris', async () => {
      const res = await request(app)
        .post('/oauth/register')
        .send({
          client_name: 'Invalid Client',
        })
        .expect(400);

      expect(res.body.error).toBe('invalid_request');
    });

    it('rejects registration with invalid redirect_uri', async () => {
      const res = await request(app)
        .post('/oauth/register')
        .send({
          redirect_uris: ['http://external.com/callback'],
        })
        .expect(400);

      expect(res.body.error).toBe('invalid_request');
    });
  });

  describe('OAuth Authorization Flow', () => {
    let clientId: string;
    let clientSecret: string;
    let codeVerifier: string;
    let codeChallenge: string;

    beforeAll(async () => {
      // Register a test client
      const res = await request(app)
        .post('/oauth/register')
        .send({
          redirect_uris: ['https://example.com/callback', 'http://localhost:3000/callback'],
          client_name: 'Flow Test Client',
        });

      clientId = res.body.client_id;
      clientSecret = res.body.client_secret;
    });

    beforeEach(() => {
      // Generate fresh PKCE values for each test
      codeVerifier = generateCodeVerifier();
      codeChallenge = generateCodeChallenge(codeVerifier);
    });

    afterAll(async () => {
      await db.oAuthRefreshToken.deleteMany({ where: { clientId } });
      await db.oAuthClient.deleteMany({ where: { clientId } });
    });

    describe('GET /oauth/authorize', () => {
      it('returns HTML form when no API key provided', async () => {
        const res = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          })
          .expect(401);

        expect(res.text).toContain('Authorize ValueRank MCP');
        expect(res.text).toContain('API Key');
      });

      it('redirects with code when API key is valid', async () => {
        const res = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
            state: 'test-state',
          })
          .expect(302);

        const location = new URL(res.headers.location);
        expect(location.origin).toBe('https://example.com');
        expect(location.pathname).toBe('/callback');
        expect(location.searchParams.get('code')).toBeDefined();
        expect(location.searchParams.get('state')).toBe('test-state');
      });

      it('rejects invalid client_id', async () => {
        const res = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: 'invalid-client',
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          })
          .expect(400);

        expect(res.body.error).toBe('invalid_client');
      });

      it('rejects mismatched redirect_uri', async () => {
        const res = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://other.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          })
          .expect(400);

        expect(res.body.error).toBe('invalid_request');
      });

      it('rejects invalid API key', async () => {
        const res = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', 'vr_invalid_api_key_12345678901234567890')
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          })
          .expect(401);

        expect(res.body.error).toBe('access_denied');
      });
    });

    describe('POST /oauth/token', () => {
      it('exchanges authorization code for tokens', async () => {
        // First, get an authorization code
        const authRes = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          });

        const authCode = new URL(authRes.headers.location).searchParams.get('code');

        // Exchange code for tokens
        const tokenRes = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            redirect_uri: 'https://example.com/callback',
            code_verifier: codeVerifier,
          })
          .expect(200);

        expect(tokenRes.body.access_token).toBeDefined();
        expect(tokenRes.body.token_type).toBe('Bearer');
        expect(tokenRes.body.expires_in).toBe(3600);
        expect(tokenRes.body.refresh_token).toBeDefined();
        expect(tokenRes.body.scope).toContain('mcp:read');
      });

      it('rejects reused authorization code', async () => {
        // Get an authorization code
        const authRes = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          });

        const authCode = new URL(authRes.headers.location).searchParams.get('code');

        // First exchange - should succeed
        await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            redirect_uri: 'https://example.com/callback',
            code_verifier: codeVerifier,
          })
          .expect(200);

        // Second exchange - should fail (code is single-use)
        const res = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            redirect_uri: 'https://example.com/callback',
            code_verifier: codeVerifier,
          })
          .expect(400);

        expect(res.body.error).toBe('invalid_grant');
      });

      it('rejects invalid PKCE verifier', async () => {
        // Get an authorization code
        const authRes = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          });

        const authCode = new URL(authRes.headers.location).searchParams.get('code');

        // Try with wrong verifier
        const res = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            redirect_uri: 'https://example.com/callback',
            code_verifier: generateCodeVerifier(), // Different verifier
          })
          .expect(400);

        expect(res.body.error).toBe('invalid_grant');
        expect(res.body.error_description).toContain('PKCE');
      });

      it('refreshes tokens with refresh_token grant', async () => {
        // Get authorization code and exchange for tokens
        const authRes = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          });

        const authCode = new URL(authRes.headers.location).searchParams.get('code');

        const tokenRes = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            redirect_uri: 'https://example.com/callback',
            code_verifier: codeVerifier,
          });

        const refreshToken = tokenRes.body.refresh_token;

        // Use refresh token to get new access token
        const refreshRes = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          })
          .expect(200);

        expect(refreshRes.body.access_token).toBeDefined();
        expect(refreshRes.body.access_token).not.toBe(tokenRes.body.access_token);
        expect(refreshRes.body.refresh_token).toBeDefined();
        expect(refreshRes.body.refresh_token).not.toBe(refreshToken); // Rotation
      });

      it('rejects reused refresh token', async () => {
        // Get tokens
        const authRes = await request(app)
          .get('/oauth/authorize')
          .set('X-API-Key', testApiKey)
          .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: 'https://example.com/callback',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            resource: 'http://localhost/mcp',
          });

        const authCode = new URL(authRes.headers.location).searchParams.get('code');

        const tokenRes = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            redirect_uri: 'https://example.com/callback',
            code_verifier: codeVerifier,
          });

        const refreshToken = tokenRes.body.refresh_token;

        // First refresh - should succeed
        await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          })
          .expect(200);

        // Second refresh with same token - should fail (rotation)
        const res = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          })
          .expect(400);

        expect(res.body.error).toBe('invalid_grant');
      });
    });
  });
});
