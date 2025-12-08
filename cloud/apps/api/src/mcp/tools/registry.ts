/**
 * MCP Tool Registry
 *
 * Manages tool registrars separately from imports to avoid circular dependency issues.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Tool handler type that registers tools on an MCP server
 */
export type ToolRegistrar = (server: McpServer) => void;

/**
 * Array of tool registrars
 */
export const toolRegistrars: ToolRegistrar[] = [];

/**
 * Track which servers have had tools registered to avoid duplicate registration
 * Using WeakSet so servers can be garbage collected when no longer referenced
 */
const registeredServers = new WeakSet<McpServer>();

/**
 * Checks if tools have already been registered on this server
 */
export function isServerRegistered(server: McpServer): boolean {
  return registeredServers.has(server);
}

/**
 * Marks a server as having tools registered
 */
export function markServerRegistered(server: McpServer): void {
  registeredServers.add(server);
}

/**
 * Adds a tool registrar to the registry
 * Used by individual tool modules to register themselves
 *
 * @param registrar - Function that registers a tool on the server
 */
export function addToolRegistrar(registrar: ToolRegistrar): void {
  toolRegistrars.push(registrar);
}
