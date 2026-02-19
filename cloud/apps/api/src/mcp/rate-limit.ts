/**
 * MCP Rate Limiting
 *
 * Per-API-key rate limiting for MCP endpoints.
 * Uses express-rate-limit with custom key generator.
 *
 * IMPORTANT: Rate limit responses must be valid JSON-RPC 2.0 format.
 * Anthropic's MCP proxy expects JSON-RPC responses from this endpoint.
 * Returning plain JSON (non-JSON-RPC) causes "Invalid content from server" errors.
 */

import rateLimit from 'express-rate-limit';
import { createLogger } from '@valuerank/shared';
import { jsonRpcError } from './jsonrpc-errors.js';

const log = createLogger('mcp:rate-limit');

/**
 * Rate limiter for MCP endpoints
 *
 * Configuration:
 * - 200 requests per minute per API key
 * - Uses X-API-Key header as the rate limit key
 * - Returns standard rate limit headers
 * - Returns 429 with JSON-RPC error format when exceeded
 */
export const mcpRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 200, // 200 requests per window per API key
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  keyGenerator: (req) => {
    // Use API key as the rate limit key
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      // Use first 16 chars to avoid logging full key
      return apiKey.substring(0, 16);
    }
    // Fallback to IP for unauthenticated requests (will be rejected by auth middleware)
    return req.ip ?? 'unknown';
  },
  handler: (req, res, _next) => {
    const apiKeyPrefix = (req.headers['x-api-key'] as string)?.substring(0, 8) ?? 'none';
    log.warn(
      { ip: req.ip, path: req.path, apiKeyPrefix },
      'MCP rate limit exceeded'
    );
    // Extract request ID from JSON-RPC body if available
    const body = req.body as { id?: unknown } | undefined;
    const requestId = body?.id ?? null;
    res.status(429).json(
      jsonRpcError(-32029, 'Rate limit exceeded. Try again in 60 seconds.', requestId)
    );
  },
  // Skip rate limiting in test environment
  skip: () => process.env.NODE_ENV === 'test',
});
