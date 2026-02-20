/**
 * Audit action types for the audit log.
 */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTION';

/**
 * Entity types that can be audited.
 */
export type AuditableEntityType =
  | 'Definition'
  | 'Run'
  | 'Tag'
  | 'Domain'
  | 'DefinitionTag'
  | 'DefinitionDomain'
  | 'LlmModel'
  | 'LlmProvider'
  | 'SystemSetting'
  | 'ApiKey'
  | 'AnalysisResult'
  | 'System'; // For queue operations

/**
 * Input type for creating an audit log entry.
 */
export type CreateAuditLogInput = {
  action: AuditAction;
  entityType: AuditableEntityType;
  entityId: string;
  userId: string | null;
  metadata?: Record<string, unknown>;
};
