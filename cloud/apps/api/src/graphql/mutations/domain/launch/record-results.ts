import { db } from '@valuerank/db';
import type { Prisma, DomainEvaluationStatus } from '@valuerank/db';
import type { DefinitionRow, BackfillEvaluationSnapshot, DomainTrialRunEntry } from './types.js';

export async function recordLaunchResults(params: {
  domainEvaluationId: string;
  runs: DomainTrialRunEntry[];
  launchableDefinitions: DefinitionRow[];
  domainId: string;
  startedRuns: number;
  failedDefinitions: number;
  allDefinitions: DefinitionRow[];
  targetedDefinitions: DefinitionRow[];
  latestDefinitionIds: string[];
  definitionIds: string[];
  projectedCostUsd: number;
  skippedForBudget: number;
  estimatedCostByDefinitionId: Map<string, number>;
  selectedModels: string[];
  temperature: number | null;
  budgetCap: number | null;
  samplePercentage: number;
  samplesPerScenario: number;
  targetBatchCount: number | null;
  modelIds: string[];
  defaultModels: string[];
  scopeCategory: string;
}): Promise<void> {
  const {
    domainEvaluationId,
    runs,
    launchableDefinitions,
    domainId,
    startedRuns,
    failedDefinitions,
    allDefinitions,
    targetedDefinitions,
    latestDefinitionIds,
    definitionIds,
    projectedCostUsd,
    skippedForBudget,
    estimatedCostByDefinitionId,
    selectedModels,
    temperature,
    budgetCap,
    samplePercentage,
    samplesPerScenario,
    targetBatchCount,
    modelIds,
    defaultModels,
    scopeCategory,
  } = params;

  const definitionById = new Map(
    launchableDefinitions.map((definition) => [definition.id, definition]),
  );

  if (runs.length > 0) {
    await db.domainEvaluationRun.createMany({
      data: runs.map((run) => {
        const definition = definitionById.get(run.definitionId);
        return {
          domainEvaluationId,
          runId: run.runId,
          definitionIdAtLaunch: run.definitionId,
          definitionNameAtLaunch: definition?.name ?? 'Untitled vignette',
          domainIdAtLaunch: domainId,
        };
      }),
    });
  }

  const status = startedRuns > 0 ? 'RUNNING' : 'FAILED';
  await db.domainEvaluation.update({
    where: { id: domainEvaluationId },
    data: {
      status,
      startedAt: startedRuns > 0 ? new Date() : null,
      completedAt: startedRuns > 0 ? null : new Date(),
      configSnapshot: {
        totalDefinitions: allDefinitions.length,
        targetedDefinitions: targetedDefinitions.length,
        requestedDefinitionIds: definitionIds,
        targetedDefinitionIds: latestDefinitionIds,
        launchableDefinitionIds: launchableDefinitions.map((definition) => definition.id),
        projectedCostUsd,
        skippedForBudget,
        startedRuns,
        failedDefinitions,
        launchableDefinitionEstimatesUsd: Object.fromEntries(estimatedCostByDefinitionId),
        models: selectedModels,
        temperature,
        maxBudgetUsd: budgetCap,
        samplePercentage,
        samplesPerScenario,
        targetBatchCount,
        defaultsOnly: modelIds.length === 0 && defaultModels.length > 0,
        runCategory: scopeCategory,
      } as Prisma.InputJsonValue,
    },
  });
}

export async function recordBackfillResults(params: {
  tx: {
    domainEvaluationRun: {
      createMany: typeof db.domainEvaluationRun.createMany;
    };
    domainEvaluation: {
      update: typeof db.domainEvaluation.update;
    };
  };
  evaluationId: string;
  runs: DomainTrialRunEntry[];
  selectedDefinitions: DefinitionRow[];
  domainId: string;
  snapshot: BackfillEvaluationSnapshot;
  startedRuns: number;
  failedDefinitions: number;
  projectedCostUsd: number;
  evaluation: {
    id: string;
    status: DomainEvaluationStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    configSnapshot: unknown;
    scopeCategory: string;
  };
}): Promise<void> {
  const {
    tx,
    evaluationId,
    runs,
    selectedDefinitions,
    domainId,
    snapshot,
    startedRuns,
    failedDefinitions,
    projectedCostUsd,
    evaluation,
  } = params;

  if (runs.length > 0) {
    const definitionById = new Map(selectedDefinitions.map((definition) => [definition.id, definition]));
    await tx.domainEvaluationRun.createMany({
      data: runs.map((run) => {
        const definition = definitionById.get(run.definitionId);
        return {
          domainEvaluationId: evaluationId,
          runId: run.runId,
          definitionIdAtLaunch: run.definitionId,
          definitionNameAtLaunch: definition?.name ?? 'Untitled vignette',
          domainIdAtLaunch: domainId,
        };
      }),
    });
  }

  const updatedSnapshot = {
    ...(evaluation.configSnapshot as Prisma.JsonObject),
    startedRuns: snapshot.startedRuns + startedRuns,
    failedDefinitions: snapshot.failedDefinitions + failedDefinitions,
    skippedForBudget: snapshot.skippedForBudget,
    projectedCostUsd: snapshot.projectedCostUsd + projectedCostUsd,
  } as Prisma.InputJsonValue;

  await tx.domainEvaluation.update({
    where: { id: evaluationId },
    data: {
      status: startedRuns > 0 ? 'RUNNING' : (failedDefinitions > 0 ? 'FAILED' : evaluation.status),
      startedAt: startedRuns > 0 ? (evaluation.startedAt ?? new Date()) : evaluation.startedAt,
      completedAt: startedRuns > 0 ? null : evaluation.completedAt,
      configSnapshot: updatedSnapshot,
    },
  });
}
