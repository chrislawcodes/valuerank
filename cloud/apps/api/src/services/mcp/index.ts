/**
 * MCP Services Index
 *
 * Re-exports all MCP service utilities.
 */

export {
  buildMcpResponse,
  truncateArray,
  estimateBytes,
  exceedsBudget,
  TOKEN_BUDGETS,
  type MCPResponse,
  type MCPResponseMetadata,
  type ToolName,
} from './response.js';

export {
  formatDefinitionListItem,
  formatRunListItem,
  formatTranscriptSummary,
  formatRunSummary,
  formatDimensionAnalysis,
  type DefinitionListItem,
  type RunListItem,
  type TranscriptSummary,
  type RunSummary,
  type DimensionAnalysis,
} from './formatters.js';

// Validation utilities (Stage 14)
export {
  validateDefinitionContent,
  validateContentStructure,
  calculateScenarioCombinations,
  extractPlaceholders,
  VALIDATION_LIMITS,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type DimensionCoverage,
} from './validation.js';

// Audit logging (Stage 14)
export {
  logAuditEvent,
  logAuditError,
  createDefinitionAudit,
  createRunAudit,
  createValidationAudit,
  type AuditAction,
  type AuditEntry,
  type AuditErrorEntry,
} from './audit.js';
