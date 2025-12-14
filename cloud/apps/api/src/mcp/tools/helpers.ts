/**
 * MCP Tool Helpers
 *
 * Shared helper functions for MCP tools.
 * Extracted to reduce duplication across tool implementations.
 */

import type { AuditEntry, AuditAction } from '../../services/mcp/index.js';

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

/**
 * Standard MCP response type
 */
export type McpResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Formats an error response for MCP tools.
 *
 * @param code - Error code (e.g., 'NOT_FOUND', 'INVALID_STATE')
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @returns Formatted MCP error response
 */
export function formatError(code: string, message: string, details?: unknown): McpResponse {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: code, message, details }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Formats a success response for MCP tools.
 *
 * @param data - Response data to serialize
 * @returns Formatted MCP success response
 */
export function formatSuccess(data: unknown): McpResponse {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// ============================================================================
// AUDIT HELPERS
// ============================================================================

/**
 * Operations audit action types (Feature #018)
 */
export type OperationsAuditAction =
  | 'recover_run'
  | 'trigger_recovery'
  | 'get_job_queue_status'
  | 'get_unsummarized_transcripts'
  | 'recompute_analysis';

/**
 * Creates a standardized audit entry for operations tools.
 *
 * @param params - Audit parameters
 * @returns Audit entry ready for logging
 */
export function createOperationsAudit(params: {
  action: OperationsAuditAction;
  userId: string;
  runId: string;
  requestId: string;
  details?: Record<string, unknown>;
}): AuditEntry {
  return {
    action: params.action as unknown as AuditAction, // Extend in audit.ts for full type safety
    userId: params.userId,
    entityId: params.runId,
    entityType: 'run',
    requestId: params.requestId,
    metadata: params.details,
  };
}
