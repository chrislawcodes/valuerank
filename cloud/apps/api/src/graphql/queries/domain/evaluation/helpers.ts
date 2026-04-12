import { db, type DomainEvaluationScopeCategory, type DomainEvaluationStatus, type RunStatus } from '@valuerank/db';
import { normalizeModelSet } from '../../../mutations/domain/types.js';
import {
  ACTIVE_RUN_STATUSES,
  SCOPE_CATEGORY_VALUES,
  STATUS_VALUES,
  type DomainEvaluationSnapshot,
  type DomainEvaluationLaunchableDefinitionShape,
  type DomainEvaluationMemberShape,
  type DomainEvaluationShape,
  type DomainEvaluationStatusShape,
  type DomainRunSummaryShape,
  type DomainEvaluationRecord,
} from './types.js';

export function parseScopeCategory(value: string | null | undefined): DomainEvaluationScopeCategory | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return SCOPE_CATEGORY_VALUES.has(value as DomainEvaluationScopeCategory)
    ? (value as DomainEvaluationScopeCategory)
    : undefined;
}

export function parseStatus(value: string | null | undefined): DomainEvaluationStatus | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return STATUS_VALUES.has(value as DomainEvaluationStatus)
    ? (value as DomainEvaluationStatus)
    : undefined;
}

export function getSnapshot(configSnapshot: unknown): DomainEvaluationSnapshot {
  if (configSnapshot == null || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return {};
  }
  const snapshot = configSnapshot as Record<string, unknown>;
  const samplePercentageValue = snapshot.samplePercentage;
  const samplesPerScenarioValue = snapshot.samplesPerScenario;
  const targetBatchCountValue = snapshot.targetBatchCount;
  const temperatureValue = snapshot.temperature;
  const maxBudgetValue = snapshot.maxBudgetUsd;
  return {
    startedRuns: typeof snapshot.startedRuns === 'number' ? snapshot.startedRuns : undefined,
    failedDefinitions: typeof snapshot.failedDefinitions === 'number' ? snapshot.failedDefinitions : undefined,
    skippedForBudget: typeof snapshot.skippedForBudget === 'number' ? snapshot.skippedForBudget : undefined,
    projectedCostUsd: typeof snapshot.projectedCostUsd === 'number' ? snapshot.projectedCostUsd : undefined,
    models: Array.isArray(snapshot.models)
      ? snapshot.models.filter((value): value is string => typeof value === 'string')
      : undefined,
    launchableDefinitionIds: Array.isArray(snapshot.launchableDefinitionIds)
      ? snapshot.launchableDefinitionIds.filter((value): value is string => typeof value === 'string')
      : undefined,
    samplePercentage:
      typeof samplePercentageValue === 'number' && Number.isFinite(samplePercentageValue)
        ? samplePercentageValue
        : undefined,
    samplesPerScenario:
      typeof samplesPerScenarioValue === 'number' && Number.isFinite(samplesPerScenarioValue)
        ? samplesPerScenarioValue
        : undefined,
    targetBatchCount:
      (typeof targetBatchCountValue === 'number' && Number.isFinite(targetBatchCountValue)) || targetBatchCountValue === null
        ? targetBatchCountValue
        : undefined,
    temperature:
      typeof temperatureValue === 'number' || temperatureValue === null
        ? temperatureValue
        : undefined,
    maxBudgetUsd:
      typeof maxBudgetValue === 'number' || maxBudgetValue === null
        ? maxBudgetValue
        : undefined,
  };
}

export function deriveEvaluationStatus(
  storedStatus: DomainEvaluationStatus,
  memberStatuses: RunStatus[],
  snapshot: DomainEvaluationSnapshot,
): DomainEvaluationStatus {
  if (memberStatuses.some((status) => ACTIVE_RUN_STATUSES.has(status))) {
    return 'RUNNING';
  }
  if (memberStatuses.length === 0) {
    if ((snapshot.failedDefinitions ?? 0) > 0) {
      return 'FAILED';
    }
    return storedStatus;
  }
  if (memberStatuses.every((status) => status === 'CANCELLED')) {
    return 'CANCELLED';
  }
  if (memberStatuses.some((status) => status === 'FAILED' || status === 'CANCELLED')) {
    return 'FAILED';
  }
  if ((snapshot.failedDefinitions ?? 0) > 0) {
    return 'FAILED';
  }
  if (memberStatuses.every((status) => status === 'COMPLETED')) {
    return 'COMPLETED';
  }
  if (memberStatuses.some((status) => status === 'COMPLETED')) {
    return 'COMPLETED';
  }
  return storedStatus;
}

export function buildStatusSummary(
  id: string,
  storedStatus: DomainEvaluationStatus,
  memberStatuses: RunStatus[],
  snapshot: DomainEvaluationSnapshot,
): DomainEvaluationStatusShape {
  const counts = {
    totalRuns: memberStatuses.length,
    pendingRuns: memberStatuses.filter((status) => status === 'PENDING').length,
    runningRuns: memberStatuses.filter((status) => status === 'RUNNING' || status === 'PAUSED' || status === 'SUMMARIZING').length,
    completedRuns: memberStatuses.filter((status) => status === 'COMPLETED').length,
    failedRuns: memberStatuses.filter((status) => status === 'FAILED').length,
    cancelledRuns: memberStatuses.filter((status) => status === 'CANCELLED').length,
  };

  return {
    id,
    status: deriveEvaluationStatus(storedStatus, memberStatuses, snapshot),
    ...counts,
  };
}

export function emptyRunSummary(domainId: string, scopeCategory: DomainEvaluationScopeCategory | undefined): DomainRunSummaryShape {
  return {
    domainId,
    scopeCategory: scopeCategory ?? null,
    totalEvaluations: 0,
    pendingEvaluations: 0,
    runningEvaluations: 0,
    completedEvaluations: 0,
    failedEvaluations: 0,
    cancelledEvaluations: 0,
    totalMemberRuns: 0,
    pendingMemberRuns: 0,
    runningMemberRuns: 0,
    completedMemberRuns: 0,
    failedMemberRuns: 0,
    cancelledMemberRuns: 0,
    pilotEvaluations: 0,
    productionEvaluations: 0,
    replicationEvaluations: 0,
    validationEvaluations: 0,
    latestEvaluationId: null,
    latestEvaluationStatus: null,
    latestScopeCategory: null,
    latestEvaluationCreatedAt: null,
  };
}

export function hasAuditableFindingsSnapshot(runConfig: unknown): boolean {
  if (runConfig == null || typeof runConfig !== 'object' || Array.isArray(runConfig)) {
    return false;
  }
  const config = runConfig as Record<string, unknown>;
  return typeof config.findingsSnapshotVersion === 'string'
    && config.findingsSnapshotVersion === 'v1'
    && config.resolvedContext != null
    && config.resolvedValueStatements != null
    && config.resolvedLevelWords != null
    && config.evaluatorConfig != null;
}

export function toShape(
  evaluation: DomainEvaluationRecord,
): DomainEvaluationShape {
  const snapshot = getSnapshot(evaluation.configSnapshot);
  const members = evaluation.members.map((member) => ({
    runId: member.runId,
    definitionIdAtLaunch: member.definitionIdAtLaunch,
    definitionNameAtLaunch: member.definitionNameAtLaunch,
    domainIdAtLaunch: member.domainIdAtLaunch,
    modelIds: normalizeModelSet((member.run.config as { models?: unknown } | null)?.models),
    createdAt: member.createdAt,
    runStatus: member.run.status,
    runCategory: member.run.runCategory,
    runStartedAt: member.run.startedAt,
    runCompletedAt: member.run.completedAt,
  }));
  const memberStatuses = evaluation.members.map((member) => member.run.status);
  const derivedStatus = deriveEvaluationStatus(evaluation.status, memberStatuses, snapshot);
  const completedAt =
    derivedStatus === 'COMPLETED' || derivedStatus === 'FAILED' || derivedStatus === 'CANCELLED'
      ? evaluation.completedAt ?? members.reduce<Date | null>((latest, member) => {
        if (member.runCompletedAt === null) return latest;
        if (latest === null || member.runCompletedAt > latest) return member.runCompletedAt;
        return latest;
      }, null)
      : null;

  return {
    id: evaluation.id,
    domainId: evaluation.domainId,
    domainNameAtLaunch: evaluation.domainNameAtLaunch,
    scopeCategory: evaluation.scopeCategory,
    status: derivedStatus,
    createdAt: evaluation.createdAt,
    startedAt: evaluation.startedAt,
    completedAt,
    createdByUserId: evaluation.createdByUserId,
    startedRuns: snapshot.startedRuns ?? members.length,
    failedDefinitions: snapshot.failedDefinitions ?? 0,
    skippedForBudget: snapshot.skippedForBudget ?? 0,
    projectedCostUsd: snapshot.projectedCostUsd ?? 0,
    models: snapshot.models ?? [],
    launchableDefinitionIds: snapshot.launchableDefinitionIds ?? [],
    samplePercentage: snapshot.samplePercentage ?? null,
    samplesPerScenario: snapshot.samplesPerScenario ?? null,
    targetBatchCount: snapshot.targetBatchCount ?? null,
    temperature: snapshot.temperature ?? null,
    maxBudgetUsd: snapshot.maxBudgetUsd ?? null,
    memberCount: members.length,
    members,
  };
}

function extractPairKey(content: unknown): string | null {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) {
    return null;
  }

  const methodology = (content as Record<string, unknown>).methodology;
  if (methodology == null || typeof methodology !== 'object' || Array.isArray(methodology)) {
    return null;
  }

  const record = methodology as Record<string, unknown>;
  if (typeof record.family !== 'string' || record.family === '' || typeof record.pair_key !== 'string' || record.pair_key.trim() === '') {
    return null;
  }

  return record.pair_key;
}

export async function resolveLaunchableDefinitions(
  launchableDefinitionIds: string[],
  members: DomainEvaluationMemberShape[],
): Promise<DomainEvaluationLaunchableDefinitionShape[]> {
  if (launchableDefinitionIds.length === 0) {
    return [];
  }

  const definitions = await db.definition.findMany({
    where: { id: { in: launchableDefinitionIds } },
    select: {
      id: true,
      name: true,
      content: true,
    },
  });

  const definitionById = new Map(
    definitions.map((definition) => [
      definition.id,
      {
        definitionName: definition.name ?? 'Untitled vignette',
        pairKey: extractPairKey(definition.content),
      },
    ]),
  );
  const memberNameByDefinitionId = new Map(
    members.map((member) => [member.definitionIdAtLaunch, member.definitionNameAtLaunch]),
  );

  return launchableDefinitionIds.map((definitionId) => {
    const definition = definitionById.get(definitionId);
    return {
      definitionId,
      definitionName: definition?.definitionName ?? memberNameByDefinitionId.get(definitionId) ?? 'Untitled vignette',
      pairKey: definition?.pairKey ?? null,
    };
  });
}

export const evaluationInclude = {
  members: {
    include: {
      run: {
        select: {
          id: true,
          status: true,
          runCategory: true,
          config: true,
          startedAt: true,
          completedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};
