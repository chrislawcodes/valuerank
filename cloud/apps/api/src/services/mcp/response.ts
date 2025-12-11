/**
 * MCP Response Builder
 *
 * Utilities for building MCP tool responses with token budget enforcement.
 */

import { createLogger } from '@valuerank/shared';

const log = createLogger('mcp:response');

/**
 * Response metadata included with all MCP tool responses
 */
export type MCPResponseMetadata = {
  bytes: number;
  truncated: boolean;
  executionMs: number;
  requestId: string;
};

/**
 * Standard MCP tool response structure
 */
export type MCPResponse<T> = {
  data: T;
  metadata: MCPResponseMetadata;
};

/**
 * Token budget limits per tool (in bytes)
 */
export const TOKEN_BUDGETS = {
  list_definitions: 2 * 1024, // 2KB
  list_runs: 2 * 1024, // 2KB
  get_run_summary: 5 * 1024, // 5KB
  get_dimension_analysis: 2 * 1024, // 2KB
  get_transcript_summary: 1 * 1024, // 1KB
  get_transcript: 10 * 1024, // 10KB
  graphql_query: 10 * 1024, // 10KB
} as const;

export type ToolName = keyof typeof TOKEN_BUDGETS;

/**
 * Options for response building
 */
type BuildResponseOptions<T> = {
  toolName: ToolName;
  data: T;
  requestId: string;
  startTime: number;
  truncator?: (data: T) => T;
};

/**
 * Builds an MCP response with token budget enforcement
 *
 * @param options - Response building options
 * @returns MCP response with data and metadata
 */
export function buildMcpResponse<T>(options: BuildResponseOptions<T>): MCPResponse<T> {
  const { toolName, data, requestId, startTime, truncator } = options;
  const maxBytes = TOKEN_BUDGETS[toolName];
  const executionMs = Date.now() - startTime;

  let responseData = data;
  let truncated = false;

  // Check size and truncate if needed
  const serialized = JSON.stringify(data);
  const bytes = Buffer.byteLength(serialized, 'utf8');

  if (bytes > maxBytes) {
    if (truncator) {
      responseData = truncator(data);
      truncated = true;
      log.debug(
        { toolName, originalBytes: bytes, maxBytes, requestId },
        'Response truncated to fit token budget'
      );
    } else {
      log.warn(
        { toolName, bytes, maxBytes, requestId },
        'Response exceeds token budget but no truncator provided'
      );
      truncated = true;
    }
  }

  const finalBytes = truncated
    ? Buffer.byteLength(JSON.stringify(responseData), 'utf8')
    : bytes;

  return {
    data: responseData,
    metadata: {
      bytes: finalBytes,
      truncated,
      executionMs,
      requestId,
    },
  };
}

/**
 * Generic truncation helper for arrays
 *
 * @param items - Array to truncate
 * @param maxItems - Maximum number of items to keep
 * @returns Truncated array
 */
export function truncateArray<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) {
    return items;
  }
  return items.slice(0, maxItems);
}

/**
 * Estimates the byte size of a JSON-serializable value
 *
 * @param value - Value to estimate size for
 * @returns Estimated byte size
 */
export function estimateBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * Checks if data exceeds the token budget for a tool
 *
 * @param toolName - Name of the tool
 * @param data - Data to check
 * @returns True if data exceeds budget
 */
export function exceedsBudget(toolName: ToolName, data: unknown): boolean {
  return estimateBytes(data) > TOKEN_BUDGETS[toolName];
}
