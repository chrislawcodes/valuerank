import { builder } from '../builder.js';

// RunStatus enum - mirrors Prisma RunStatus
// Registered with builder, not exported as value
builder.enumType('RunStatus', {
  values: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const,
  description: 'Status of a run execution',
});

// AnalysisStatus enum - mirrors Prisma AnalysisStatus
// Registered with builder, referenced via builder.enumRef in other files
builder.enumType('AnalysisStatus', {
  values: ['CURRENT', 'SUPERSEDED'] as const,
  description: 'Status of an analysis result',
});

// RunPriority enum - priority level for runs
// Note: Not exported as other enums - referenced by string name in input types
builder.enumType('RunPriority', {
  values: ['LOW', 'NORMAL', 'HIGH'] as const,
  description: 'Priority level for run execution (affects job queue ordering)',
});

// LlmModelStatus enum - mirrors Prisma LlmModelStatus
builder.enumType('LlmModelStatus', {
  values: ['ACTIVE', 'DEPRECATED'] as const,
  description: 'Lifecycle status of an LLM model',
});
