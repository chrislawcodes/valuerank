/**
 * MCP Router
 *
 * Express router for MCP protocol handling.
 * Wires up the MCP server to Express and handles HTTP transport.
 * Includes OAuth 2.1 support for Claude.ai integration.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createLogger, AuthenticationError } from '@valuerank/shared';
import { getMcpServer } from './server.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { mcpAuthMiddleware } from './auth.js';
import { mcpRateLimiter } from './rate-limit.js';
import { protectedResourceMetadata } from './oauth/metadata.js';
import { runWithMcpContext } from './request-context.js';
import { jsonRpcError } from './jsonrpc-errors.js';

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

  // HEAD request for protocol version check - no auth required
  // Claude.ai uses this to verify MCP compatibility
  router.head('/', (req, res) => {
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
    res.status(200).end();
  });

  // Protected Resource Metadata at MCP path - no auth required
  // This is the RFC 9728 spec location for resource metadata
  router.get('/.well-known/resource.json', protectedResourceMetadata);

  // Apply rate limiting and auth middleware for all other requests
  router.use(mcpRateLimiter);
  router.use(mcpAuthMiddleware);

  // Track active transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  /**
   * Extract the JSON-RPC request ID from the request body.
   * Returns null if not available (safe default for JSON-RPC error responses).
   */
  function getJsonRpcId(req: Request): unknown {
    const body = req.body as { id?: unknown } | undefined;
    return body?.id ?? null;
  }

  // Handle MCP protocol requests
  router.all('/', async (req, res) => {
    const requestId = req.requestId || 'unknown';
    log.debug({ method: req.method, requestId }, 'MCP request received');

    try {
      // Get or create session ID from header
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // For new sessions or stateless requests, create a new transport
      if (req.method === 'POST' && (sessionId === undefined || sessionId === '')) {
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

        // Handle the request (with user context from auth middleware)
        await runWithMcpContext(
          { user: req.user ?? null },
          () => transport.handleRequest(req, res, req.body)
        );
        return;
      }

      // For existing sessions, reuse the transport
      if (sessionId !== undefined && sessionId !== '') {
        let transport = transports.get(sessionId);

        if (!transport) {
          // Session not found - could be from a different server instance
          // Create a new transport with proper cleanup callbacks
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
            enableJsonResponse: true,
            onsessioninitialized: (newSessionId) => {
              log.info({ sessionId: newSessionId, requestId }, 'MCP session re-initialized');
              transports.set(newSessionId, transport!);
            },
            onsessionclosed: (closedSessionId) => {
              log.info({ sessionId: closedSessionId, requestId }, 'MCP reconnected session closed');
              transports.delete(closedSessionId);
            },
          });
          await mcpServer.connect(transport);
          transports.set(sessionId, transport);
          log.info({ sessionId, requestId }, 'MCP session transport recreated');
        }

        await runWithMcpContext(
          { user: req.user ?? null },
          () => transport.handleRequest(req, res, req.body)
        );
        return;
      }

      // GET requests for SSE streaming (if supported in future)
      if (req.method === 'GET') {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless
          enableJsonResponse: false, // Enable SSE for GET
        });
        await mcpServer.connect(transport);
        await runWithMcpContext(
          { user: req.user ?? null },
          () => transport.handleRequest(req, res)
        );
        return;
      }

      // Unsupported method - return JSON-RPC error
      res.status(405).json(
        jsonRpcError(-32600, `Method ${req.method} not allowed`, getJsonRpcId(req))
      );
    } catch (err) {
      log.error({ err, requestId }, 'MCP request failed');

      if (!res.headersSent) {
        res.status(500).json(
          jsonRpcError(-32603, 'MCP request processing failed', getJsonRpcId(req))
        );
      }
    }
  });

  // Handle DELETE for session termination
  router.delete('/', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId === undefined || sessionId === '') {
      res.status(400).json(
        jsonRpcError(-32600, 'Session ID required for DELETE', getJsonRpcId(req))
      );
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

  // Error handler for auth failures - must return JSON-RPC format
  // This catches AuthenticationError thrown by mcpAuthMiddleware via next(err)
  router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AuthenticationError) {
      log.debug({ path: req.path, error: (err as Error).message }, 'MCP auth error');
      res.status(401).json(
        jsonRpcError(-32001, (err as Error).message, getJsonRpcId(req))
      );
      return;
    }
    // Re-throw non-auth errors to Express default handler
    // (shouldn't normally happen since the route catch block handles errors)
    log.error({ err, path: req.path }, 'Unhandled MCP error');
    res.status(500).json(
      jsonRpcError(-32603, 'Internal server error', getJsonRpcId(req))
    );
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
export { jsonRpcError } from './jsonrpc-errors.js';
export type { JsonRpcErrorResponse } from './jsonrpc-errors.js';
