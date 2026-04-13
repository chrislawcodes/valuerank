import { builder } from '../../builder.js';
import { ValidationError } from '@valuerank/shared';

export type DomainMutationResult = {
  success: boolean;
  affectedDefinitions: number;
};

export type DomainTrialRunEntry = {
  definitionId: string;
  runId: string;
  modelIds: string[];
};

export type DomainTrialRunResult = {
  domainEvaluationId: string | null;
  scopeCategory: string;
  success: boolean;
  totalDefinitions: number;
  targetedDefinitions: number;
  startedRuns: number;
  failedDefinitions: number;
  skippedForBudget: number;
  projectedCostUsd: number;
  blockedByActiveLaunch: boolean;
  runs: DomainTrialRunEntry[];
};

export type DomainEvaluationLaunchInput = {
  domainId: string;
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  temperature?: number | null;
  maxBudgetUsd?: number | null;
  definitionIds?: string[];
  modelIds?: string[];
  samplePercentage: number;
  samplesPerScenario: number;
  targetBatchCount?: number | null;
  userId: string;
  log: {
    error: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
  };
  auditOperationType: 'run-trials-for-domain' | 'start-domain-evaluation';
};

export type DomainEvaluationModelBackfillInput = {
  domainEvaluationId: string;
  modelIds: string[];
  definitionIds?: string[];
  targetBatchCount?: number | null;
  userId: string;
  log: {
    error: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
  };
  auditOperationType: 'backfill-domain-evaluation-models';
};

export type RetryDomainTrialCellResult = {
  success: boolean;
  definitionId: string;
  modelId: string;
  runId: string | null;
  message: string | null;
};

export const DomainMutationResultRef = builder.objectRef<DomainMutationResult>('DomainMutationResult');
export const DomainTrialRunEntryRef = builder.objectRef<DomainTrialRunEntry>('DomainTrialRunEntry');
export const DomainTrialRunResultRef = builder.objectRef<DomainTrialRunResult>('DomainTrialRunResult');
export const RetryDomainTrialCellResultRef = builder.objectRef<RetryDomainTrialCellResult>('RetryDomainTrialCellResult');

builder.objectType(DomainMutationResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    affectedDefinitions: t.exposeInt('affectedDefinitions'),
  }),
});

builder.objectType(DomainTrialRunEntryRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    runId: t.exposeID('runId'),
    modelIds: t.exposeStringList('modelIds'),
  }),
});

builder.objectType(DomainTrialRunResultRef, {
  fields: (t) => ({
    domainEvaluationId: t.exposeID('domainEvaluationId', { nullable: true }),
    scopeCategory: t.exposeString('scopeCategory'),
    success: t.exposeBoolean('success'),
    totalDefinitions: t.exposeInt('totalDefinitions'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    startedRuns: t.exposeInt('startedRuns'),
    failedDefinitions: t.exposeInt('failedDefinitions'),
    skippedForBudget: t.exposeInt('skippedForBudget'),
    projectedCostUsd: t.exposeFloat('projectedCostUsd'),
    blockedByActiveLaunch: t.exposeBoolean('blockedByActiveLaunch'),
    runs: t.field({
      type: [DomainTrialRunEntryRef],
      resolve: (parent) => parent.runs,
    }),
  }),
});

builder.objectType(RetryDomainTrialCellResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    definitionId: t.exposeID('definitionId'),
    modelId: t.exposeString('modelId'),
    runId: t.exposeID('runId', { nullable: true }),
    message: t.exposeString('message', { nullable: true }),
  }),
});

export function parseOptionalId(value: string | number | null | undefined, argName: string): string | null {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  if (id === '') {
    throw new ValidationError(`${argName} cannot be an empty string. Use null for unassignment.`);
  }
  return id;
}

export function normalizeModelSet(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .filter((model): model is string => typeof model === 'string' && model.trim() !== '')
    .sort((left, right) => left.localeCompare(right));
}
