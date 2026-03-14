// Client
export { db } from './client.js';
export type { PrismaClient } from '@prisma/client';
export { Prisma } from '@prisma/client';

// Types - Re-export Prisma generated types
export type {
  User,
  ApiKey,
  Definition,
  Run,
  RunStatus,
  Transcript,
  Scenario,
  AssumptionVignetteSelection,
  AssumptionScenarioPair,
  RunScenarioSelection,
  Experiment,
  RunComparison,
  AnalysisResult,
  AnalysisStatus,
  AssumptionAnalysisSnapshot,
  AssumptionAnalysisStatus,
  Rubric,
  Cohort,
  Tag,
  Domain,
  DefinitionTag,
  LlmProvider,
  LlmModel,
  LlmModelStatus,
  SystemSetting,
  AuditLog,
  Preamble,
  PreambleVersion,
  RunTag,
  DomainContext,
  ValueStatement,
} from '@prisma/client';

// Audit types
export type {
  AuditAction,
  AuditableEntityType,
  CreateAuditLogInput,
} from './types/audit.js';

// JSONB content types
export * from './types.js';

// Schema migration utilities
export * from './schema-migration.js';

// Query helpers
export * from './queries/index.js';
