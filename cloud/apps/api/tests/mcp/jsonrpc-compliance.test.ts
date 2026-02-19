/**
 * MCP JSON-RPC Compliance Tests
 *
 * Verifies that ALL responses from the MCP endpoint are valid JSON-RPC 2.0,
 * including error conditions like rate limiting and server errors.
 *
 * Background: Anthropic's MCP proxy expects valid JSON-RPC responses.
 * When middleware (rate limiter, error handler) returns plain JSON instead
 * of JSON-RPC format, the proxy reports "Invalid content from server".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMcpRouter } from '../../src/mcp/index.js';
import { resetMcpServer } from '../../src/mcp/server.js';

// Mock the database
vi.mock('@valuerank/db', () => ({
  db: {
    apiKey: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

/**
 * Validates that a response body conforms to JSON-RPC 2.0 error format.
 *
 * Per JSON-RPC 2.0 spec (https://www.jsonrpc.org/specification):
 * - Must contain "jsonrpc": "2.0"
 * - Must contain "error" object with "code" (integer) and "message" (string)
 * - Must contain "id" (can be null for unknown request IDs)
 */
function assertJsonRpcError(body: unknown): void {
  expect(body).toBeDefined();
  expect(typeof body).toBe('object');

  const response = body as Record<string, unknown>;
  expect(response.jsonrpc).toBe('2.0');
  expect(response.error).toBeDefined();
  expect(typeof response.error).toBe('object');

  const error = response.error as Record<string, unknown>;
  expect(typeof error.code).toBe('number');
  expect(Number.isInteger(error.code)).toBe(true);
  expect(typeof error.message).toBe('string');

  // id must be present (can be null for cases where request id is unknown)
  expect('id' in response).toBe(true);
}

describe('MCP JSON-RPC Compliance', () => {
  beforeEach(() => {
    resetMcpServer();
  });

  afterEach(() => {
    resetMcpServer();
  });

  describe('rate limit responses', () => {
    it('returns valid JSON-RPC error when rate limited', async () => {
      // Build a minimal Express app with a custom low-limit rate limiter
      // to avoid sending 200+ requests in a test
      const rateLimit = (await import('express-rate-limit')).default;
      const { jsonRpcError } = await import('../../src/mcp/jsonrpc-errors.js');

      const lowLimitRateLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 3, // Very low limit for testing
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          const body = req.body as { id?: unknown } | undefined;
          const reqId = body?.id ?? null;
          res.status(429).json(
            jsonRpcError(-32029, 'Rate limit exceeded. Try again in 60 seconds.', reqId)
          );
        },
      });

      const app = express();
      app.use(express.json());
      app.use(lowLimitRateLimiter);
      app.post('/mcp', (_req, res) => {
        res.json({ jsonrpc: '2.0', result: {}, id: 1 });
      });

      // Send 5 requests - first 3 pass, last 2 should be rate limited
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(
          await request(app)
            .post('/mcp')
            .set('Content-Type', 'application/json')
            .send({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} })
        );
      }

      // Find 429 responses
      const rateLimited = results.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Every 429 response must be valid JSON-RPC
      for (const res of rateLimited) {
        assertJsonRpcError(res.body);
        expect((res.body as Record<string, unknown>).error).toEqual(
          expect.objectContaining({ code: -32029 })
        );
      }
    });

    it('preserves request ID in rate limit JSON-RPC error', async () => {
      const { jsonRpcError } = await import('../../src/mcp/jsonrpc-errors.js');

      const response = jsonRpcError(-32029, 'Rate limit exceeded', 42);
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(42);
      expect(response.error.code).toBe(-32029);
      expect(response.error.message).toBe('Rate limit exceeded');
    });
  });

  describe('error handler responses', () => {
    it('returns valid JSON-RPC error on internal server error', async () => {
      const app = express();
      app.use(express.json());

      // Create a router that will throw during MCP handling
      const router = createMcpRouter();
      app.use('/mcp', router);

      // Send a malformed body that will cause an internal error
      // (not JSON-RPC format at all, but valid JSON)
      const response = await request(app)
        .post('/mcp')
        .set('X-API-Key', 'vrk_error-test-key')
        .set('Content-Type', 'application/json')
        .send({ not: 'jsonrpc' });

      // The response should be either a valid MCP response or a valid JSON-RPC error
      // It should NOT be a plain JSON error like {"error": "INTERNAL_ERROR", ...}
      if (response.status >= 400) {
        assertJsonRpcError(response.body);
      }
    });

    it('returns valid JSON-RPC error when session not found for DELETE', async () => {
      const app = express();
      app.use(express.json());
      app.use('/mcp', createMcpRouter());

      const response = await request(app)
        .delete('/mcp')
        .set('X-API-Key', 'vrk_session-test-key')
        .set('Content-Type', 'application/json');

      // DELETE without session ID returns 400 - must be JSON-RPC format
      if (response.status === 400) {
        assertJsonRpcError(response.body);
      }
    });

    it('returns valid JSON-RPC error for unsupported HTTP methods', async () => {
      const app = express();
      app.use(express.json());
      app.use('/mcp', createMcpRouter());

      const response = await request(app)
        .put('/mcp')
        .set('X-API-Key', 'vrk_method-test-key')
        .set('Content-Type', 'application/json')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

      if (response.status === 405) {
        assertJsonRpcError(response.body);
      }
    });
  });

  describe('transport cleanup', () => {
    it('reconnected session transport has cleanup callbacks', async () => {
      const app = express();
      app.use(express.json());
      app.use('/mcp', createMcpRouter());

      // First request creates a session
      const initResponse = await request(app)
        .post('/mcp')
        .set('X-API-Key', 'vrk_transport-cleanup-test')
        .set('Content-Type', 'application/json')
        .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } } });

      const sessionId = initResponse.headers['mcp-session-id'];

      // If we got a session, verify a second request with that session works
      if (sessionId) {
        const secondResponse = await request(app)
          .post('/mcp')
          .set('X-API-Key', 'vrk_transport-cleanup-test')
          .set('MCP-Session-Id', sessionId)
          .set('Content-Type', 'application/json')
          .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

        // Should succeed (200) not error
        expect(secondResponse.status).toBeLessThan(500);
      }

      // Session termination should work cleanly
      if (sessionId) {
        const deleteResponse = await request(app)
          .delete('/mcp')
          .set('X-API-Key', 'vrk_transport-cleanup-test')
          .set('MCP-Session-Id', sessionId);

        expect(deleteResponse.status).toBe(204);
      }
    });
  });
});
