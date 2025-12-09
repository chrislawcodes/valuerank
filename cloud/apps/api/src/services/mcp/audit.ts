/**
 * MCP Audit Logging Service
 *
 * Provides audit trail for all MCP write operations.
 * Logs are structured for easy querying and analysis.
 *
 * ## Log Format
 *
 * All audit entries are logged as structured JSON with:
 * - action: The MCP operation (create_definition, fork_definition, start_run, etc.)
 * - userId: The user performing the operation (MCP user ID)
 * - entityId: The ID of the created/modified entity
 * - entityType: Type of entity (definition, run, validation)
 * - requestId: Unique request ID for correlation
 * - timestamp: ISO 8601 timestamp
 * - metadata: Operation-specific details (parentId, models, etc.)
 *
 * ## Querying Logs
 *
 * Logs are output via pino structured logging. Query with:
 *
 * ```bash
 * # Find all create_definition operations
 * grep "create_definition" logs/api.log | jq
 *
 * # Find operations by user
 * grep '"userId":"user-123"' logs/api.log
 *
 * # Find all MCP audit entries
 * grep '"context":"mcp:audit"' logs/api.log
 *
 * # Using pino-pretty for human-readable output
 * cat logs/api.log | pino-pretty
 * ```
 *
 * ## Log Retention
 *
 * Audit logs should be retained according to your organization's
 * data retention policy. These logs may contain operation metadata
 * but not actual scenario content.
 */

import { createLogger } from '@valuerank/shared';

const auditLog = createLogger('mcp:audit');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Audit action types for MCP write operations
 */
export type AuditAction =
  | 'create_definition'
  | 'fork_definition'
  | 'validate_definition'
  | 'start_run'
  | 'generate_scenarios_preview'
  // Delete operations (Feature #014)
  | 'delete_definition'
  | 'delete_run'
  // LLM management operations (Feature #014)
  | 'create_llm_model'
  | 'update_llm_model'
  | 'deprecate_llm_model'
  | 'reactivate_llm_model'
  | 'set_default_llm_model'
  | 'update_llm_provider'
  | 'set_infra_model';

/**
 * Audit entry for MCP write operations
 */
export type AuditEntry = {
  action: AuditAction;
  userId: string;
  entityId: string;
  entityType: 'definition' | 'run' | 'validation' | 'llm_model' | 'llm_provider' | 'system_setting';
  requestId: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
};

/**
 * Audit entry for failed operations
 */
export type AuditErrorEntry = {
  action: AuditAction;
  userId: string;
  requestId: string;
  error: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
};

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Logs a successful MCP write operation.
 *
 * @param entry - Audit entry with operation details
 */
export function logAuditEvent(entry: AuditEntry): void {
  const timestamp = entry.timestamp ?? new Date();

  auditLog.info(
    {
      action: entry.action,
      userId: entry.userId,
      entityId: entry.entityId,
      entityType: entry.entityType,
      requestId: entry.requestId,
      timestamp: timestamp.toISOString(),
      ...entry.metadata,
    },
    `MCP write: ${entry.action}`
  );
}

/**
 * Logs a failed MCP write operation.
 *
 * @param entry - Error audit entry with failure details
 */
export function logAuditError(entry: AuditErrorEntry): void {
  const timestamp = entry.timestamp ?? new Date();

  auditLog.error(
    {
      action: entry.action,
      userId: entry.userId,
      requestId: entry.requestId,
      error: entry.error,
      timestamp: timestamp.toISOString(),
      ...entry.metadata,
    },
    `MCP write failed: ${entry.action}`
  );
}

/**
 * Creates a standardized audit entry for definition operations.
 */
export function createDefinitionAudit(params: {
  action: 'create_definition' | 'fork_definition';
  userId: string;
  definitionId: string;
  requestId: string;
  parentId?: string;
  name?: string;
}): AuditEntry {
  return {
    action: params.action,
    userId: params.userId,
    entityId: params.definitionId,
    entityType: 'definition',
    requestId: params.requestId,
    metadata: {
      parentId: params.parentId,
      definitionName: params.name,
    },
  };
}

/**
 * Creates a standardized audit entry for run operations.
 */
export function createRunAudit(params: {
  userId: string;
  runId: string;
  definitionId: string;
  requestId: string;
  models: string[];
  samplePercentage?: number;
}): AuditEntry {
  return {
    action: 'start_run',
    userId: params.userId,
    entityId: params.runId,
    entityType: 'run',
    requestId: params.requestId,
    metadata: {
      definitionId: params.definitionId,
      models: params.models,
      samplePercentage: params.samplePercentage,
    },
  };
}

/**
 * Creates a standardized audit entry for validation operations.
 * Validation doesn't persist, but we log for usage tracking.
 */
export function createValidationAudit(params: {
  userId: string;
  requestId: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
}): AuditEntry {
  return {
    action: 'validate_definition',
    userId: params.userId,
    entityId: 'validation', // No entity created
    entityType: 'validation',
    requestId: params.requestId,
    metadata: {
      valid: params.valid,
      errorCount: params.errorCount,
      warningCount: params.warningCount,
    },
  };
}

/**
 * Creates a standardized audit entry for delete operations.
 */
export function createDeleteAudit(params: {
  action: 'delete_definition' | 'delete_run';
  userId: string;
  entityId: string;
  entityType: 'definition' | 'run';
  requestId: string;
  deletedCount?: {
    primary: number;
    scenarios?: number;
    transcripts?: number;
    analysisResults?: number;
  };
}): AuditEntry {
  return {
    action: params.action,
    userId: params.userId,
    entityId: params.entityId,
    entityType: params.entityType,
    requestId: params.requestId,
    metadata: {
      deletedCount: params.deletedCount,
    },
  };
}

/**
 * Creates a standardized audit entry for LLM management operations.
 */
export function createLlmAudit(params: {
  action:
    | 'create_llm_model'
    | 'update_llm_model'
    | 'deprecate_llm_model'
    | 'reactivate_llm_model'
    | 'set_default_llm_model'
    | 'update_llm_provider'
    | 'set_infra_model';
  userId: string;
  entityId: string;
  entityType: 'llm_model' | 'llm_provider' | 'system_setting';
  requestId: string;
  details?: Record<string, unknown>;
}): AuditEntry {
  return {
    action: params.action,
    userId: params.userId,
    entityId: params.entityId,
    entityType: params.entityType,
    requestId: params.requestId,
    metadata: params.details,
  };
}
