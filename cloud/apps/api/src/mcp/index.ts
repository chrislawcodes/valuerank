/**
 * MCP Router
 *
 * Express router for MCP protocol handling.
 * Wires up the MCP server to Express and handles HTTP transport.
 * Includes OAuth 2.1 support for Claude.ai integration.
 */

import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createLogger } from '@valuerank/shared';
import { getMcpServer } from './server.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { mcpAuthMiddleware } from './auth.js';
import { mcpRateLimiter } from './rate-limit.js';
import { protectedResourceMetadata } from './oauth/index.js';

const log = createLogger('mcp:router');

/** MCP Protocol Version */
const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * Creates the MCP Express router
 *
 * Sets up:
 * - Rate limiting
 * - Authentication
 * - MCP protocol handling via StreamableHTTPServerTransport
 */
export function createMcpRouter(): Router {
  const router = Router();

  // Get MCP server and register tools + resources
  const mcpServer = getMcpServer();
  registerAllTools(mcpServer);
  registerAllResources(mcpServer);

  // Protected Resource Metadata (RFC 9728) - no auth required
  // Claude.ai fetches this to discover the authorization server
  router.get('/.well-known/resource.json', protectedResourceMetadata);

  // HEAD request for protocol version check - no auth required
  // Claude.ai uses this to verify MCP compatibility
  router.head('/', (req, res) => {
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
    res.status(200).end();
  });

  // Apply rate limiting and auth middleware for all other requests
  router.use(mcpRateLimiter);
  router.use(mcpAuthMiddleware);

  // Track active transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Handle MCP protocol requests
  router.all('/', async (req, res) => {
    const requestId = req.requestId || 'unknown';
    log.debug({ method: req.method, requestId }, 'MCP request received');

    try {
      // Get or create session ID from header
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // For new sessions or stateless requests, create a new transport
      if (req.method === 'POST' && !sessionId) {
        // Create new transport for this session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true, // Use JSON responses instead of SSE for simplicity
          onsessioninitialized: (newSessionId) => {
            log.info({ sessionId: newSessionId, requestId }, 'MCP session initialized');
            transports.set(newSessionId, transport);
          },
          onsessionclosed: (closedSessionId) => {
            log.info({ sessionId: closedSessionId, requestId }, 'MCP session closed');
            transports.delete(closedSessionId);
          },
        });

        // Connect transport to server
        await mcpServer.connect(transport);

        // Handle the request
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // For existing sessions, reuse the transport
      if (sessionId) {
        let transport = transports.get(sessionId);

        if (!transport) {
          // Session not found - could be from a different server instance
          // Create a new transport and try to handle it
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
            enableJsonResponse: true,
          });
          await mcpServer.connect(transport);
          transports.set(sessionId, transport);
        }

        await transport.handleRequest(req, res, req.body);
        return;
      }

      // GET requests for SSE streaming (if supported in future)
      if (req.method === 'GET') {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless
          enableJsonResponse: false, // Enable SSE for GET
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      // Unsupported method
      res.status(405).json({
        error: 'METHOD_NOT_ALLOWED',
        message: `Method ${req.method} not allowed`,
      });
    } catch (err) {
      log.error({ err, requestId }, 'MCP request failed');

      if (!res.headersSent) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'MCP request processing failed',
        });
      }
    }
  });

  // Handle DELETE for session termination
  router.delete('/', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Session ID required for DELETE',
      });
      return;
    }

    const transport = transports.get(sessionId);
    if (transport) {
      await transport.close();
      transports.delete(sessionId);
      log.info({ sessionId }, 'MCP session terminated');
    }

    res.status(204).send();
  });

  log.info('MCP router created');
  return router;
}

// Export everything needed
export { getMcpServer, resetMcpServer } from './server.js';
export { registerAllTools } from './tools/index.js';
export { registerAllResources, RESOURCE_URIS } from './resources/index.js';
export { mcpAuthMiddleware } from './auth.js';
export { mcpRateLimiter } from './rate-limit.js';
