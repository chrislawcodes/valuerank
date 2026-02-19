/**
 * MCP Request Context
 *
 * Uses AsyncLocalStorage to pass authenticated user context
 * from Express middleware to MCP tool handlers.
 */

import { AsyncLocalStorage } from 'async_hooks';

export type McpUser = {
  id: string;
  email: string;
};

type McpRequestContext = {
  user: McpUser | null;
};

const asyncLocalStorage = new AsyncLocalStorage<McpRequestContext>();

/**
 * Run a callback with MCP request context (user info from auth middleware).
 */
export function runWithMcpContext<T>(ctx: McpRequestContext, fn: () => T): T {
  return asyncLocalStorage.run(ctx, fn);
}

/**
 * Get the authenticated user from the current MCP request context.
 * Returns null if no user is authenticated or if called outside request scope.
 */
export function getMcpUser(): McpUser | null {
  return asyncLocalStorage.getStore()?.user ?? null;
}
