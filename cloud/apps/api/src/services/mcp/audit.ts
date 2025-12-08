/**
 * MCP Audit Logging Service
 *
 * Provides audit trail for all MCP write operations.
 * Logs are structured for easy querying and analysis.
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
  | 'generate_scenarios_preview';

/**
 * Audit entry for MCP write operations
 */
export type AuditEntry = {
  action: AuditAction;
  userId: string;
  entityId: string;
  entityType: 'definition' | 'run' | 'validation';
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
