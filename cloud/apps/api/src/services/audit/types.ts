import type { AuditAction, AuditableEntityType } from '@valuerank/db';

/**
 * Filters for querying audit logs.
 */
export type AuditLogFilters = {
  entityType?: AuditableEntityType;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
};

/**
 * Pagination options for audit log queries.
 */
export type AuditLogPagination = {
  first?: number;
  after?: string;
};

/**
 * Configuration for the audited mutation wrapper.
 * @template TArgs - The type of mutation arguments
 * @template TResult - The type of mutation result
 */
export type AuditConfig<TArgs = unknown, TResult = unknown> = {
  /** The audit action type */
  action: AuditAction;
  /** The entity type being audited */
  entityType: AuditableEntityType;
  /**
   * Custom function to extract entity ID from args/result.
   * If not provided, assumes result has an `id` property.
   */
  extractEntityId?: (args: TArgs, result: TResult) => string;
  /**
   * Optional function to generate metadata for the audit log.
   */
  metadata?: (args: TArgs, result: TResult) => Record<string, unknown>;
};
