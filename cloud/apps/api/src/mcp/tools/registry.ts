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
 * Adds a tool registrar to the registry
 * Used by individual tool modules to register themselves
 *
 * @param registrar - Function that registers a tool on the server
 */
export function addToolRegistrar(registrar: ToolRegistrar): void {
  toolRegistrars.push(registrar);
}
