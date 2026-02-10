import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { updateAggregateRun } from '../analysis/aggregate.js';
import { resolveModelIdFromAvailable } from '../models/aliases.js';

const log = createLogger('services:run:plan-final-trial');

type ConditionPlan = {
  scenarioId: string;
  conditionKey: string;
  currentSamples: number;
  currentSEM: number | null;
  status: 'STABLE' | 'MORE_INVESTIGATION' | 'UNDECIDED' | 'INSUFFICIENT_DATA';
  neededSamples: number;
};

type ModelPlan = {
  modelId: string;
  conditions: ConditionPlan[];
  totalNeededSamples: number;
};

export type FinalTrialPlan = {
  definitionId: string;
  models: ModelPlan[];
  totalJobs: number;
};

type PerScenarioVarianceStats = {
  sampleCount: number;
  mean: number;
  variance: number;
  stdDev: number;
};

type AnalysisShape = {
  varianceAnalysis?: {
    perModel?: Record<
      string,
      {
        perScenario?: Record<string, PerScenarioVarianceStats>;
      }
    >;
  };
  visualizationData?: {
    modelScenarioMatrix?: Record<string, Record<string, number>>;
  };
};

function getConditionKey(dimensions: Record<string, string | number>): string {
  return Object.entries(dimensions)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

function calculateSemFromScores(scores: number[]): number | null {
  if (scores.length < 2) return null;
  const mean = scores.reduce((sum, v) => sum + v, 0) / scores.length;
  const variance =
    scores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    (scores.length - 1);
  return Math.sqrt(variance / scores.length);
}

function calculateSemFromVarianceStats(
  statsByScenario: Record<string, PerScenarioVarianceStats>,
  scenarioIds: string[]
): { n: number; sem: number | null } {
  const selected: PerScenarioVarianceStats[] = scenarioIds
    .map((id) => statsByScenario[id])
    .filter((s): s is PerScenarioVarianceStats => Boolean(s && s.sampleCount > 0));

  const totalN = selected.reduce((sum, s) => sum + s.sampleCount, 0);
  if (totalN < 2) return { n: totalN, sem: null };

  const globalMean =
    selected.reduce((sum, s) => sum + s.mean * s.sampleCount, 0) / totalN;

  let ssTotal = 0;
  for (const s of selected) {
    if (s.sampleCount > 1) {
      ssTotal += (s.sampleCount - 1) * s.variance;
    }
    ssTotal += s.sampleCount * Math.pow(s.mean - globalMean, 2);
  }

  const totalVariance = ssTotal / (totalN - 1);
  const sem = Math.sqrt(totalVariance / totalN);
  return { n: totalN, sem };
}

function evaluateCondition(n: number, sem: number | null): {
  status: ConditionPlan['status'];
  neededSamples: number;
} {
  // Safety cap: Stop after 20 samples (initial 10 + 1 follow-up of 10)
  if (n >= 20) {
    return {
      status: 'UNDECIDED', // Or 'INSUFFICIENT_DATA_CAPPED' if we wanted to be explicit, but UNDECIDED stops the loop
      neededSamples: 0,
    };
  }

  if (n < 10) {
    return {
      status: 'INSUFFICIENT_DATA',
      neededSamples: 10 - n,
    };
  }

  if (sem === null) {
    return {
      status: 'UNDECIDED',
      neededSamples: 0,
    };
  }

  if (sem < 0.1) {
    return {
      status: 'STABLE',
      neededSamples: 0,
    };
  }

  if (sem < 0.14) {
    return {
      status: 'MORE_INVESTIGATION',
      neededSamples: 10,
    };
  }

  return {
    status: 'UNDECIDED',
    neededSamples: 0,
  };
}

function generateInitialPlan(
  definitionId: string,
  conditionMap: Map<string, string[]>,
  modelIds: string[]
): FinalTrialPlan {
  const models: ModelPlan[] = modelIds.map((modelId) => {
    const conditions: ConditionPlan[] = Array.from(conditionMap.entries()).map(
      ([conditionKey, scenarioIds]) => ({
        scenarioId: scenarioIds[0]!,
        conditionKey,
        currentSamples: 0,
        currentSEM: null,
        status: 'INSUFFICIENT_DATA',
        neededSamples: 10,
      })
    );

    return {
      modelId,
      conditions,
      totalNeededSamples: conditions.reduce(
        (sum, c) => sum + c.neededSamples,
        0
      ),
    };
  });

  return {
    definitionId,
    models,
    totalJobs: models.reduce((sum, m) => sum + m.totalNeededSamples, 0),
  };
}

export async function planFinalTrial(
  definitionId: string,
  modelIds: string[]
): Promise<FinalTrialPlan> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    include: { scenarios: { where: { deletedAt: null } } },
  });

  if (!definition) throw new NotFoundError('Definition', definitionId);

  if (modelIds.length === 0) {
    return {
      definitionId,
      models: [],
      totalJobs: 0,
    };
  }

  const conditionMap = new Map<string, string[]>();
  for (const scenario of definition.scenarios) {
    if (scenario.content === null || typeof scenario.content !== 'object' || Array.isArray(scenario.content)) {
      continue;
    }
    const content = scenario.content as Record<string, unknown>;
    const dims = (content.dimensions as Record<string, string | number> | undefined) ?? {};
    const key = getConditionKey(dims);
    if (key === '') continue;
    const existing = conditionMap.get(key) ?? [];
    existing.push(scenario.id);
    conditionMap.set(key, existing);
  }

  if (conditionMap.size === 0) {
    return {
      definitionId,
      models: modelIds.map((modelId) => ({
        modelId,
        conditions: [],
        totalNeededSamples: 0,
      })),
      totalJobs: 0,
    };
  }

  log.info({ definitionId, modelIds }, 'Planning final trial');

  await updateAggregateRun(definitionId, definition.preambleVersionId, definition.version);

  const aggregateRun = await db.run.findFirst({
    where: {
      definitionId,
      status: 'COMPLETED',
      tags: { some: { tag: { name: 'Aggregate' } } },
      deletedAt: null,
    },
    include: {
      analysisResults: {
        where: { status: 'CURRENT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const analysis = (aggregateRun?.analysisResults[0]?.output ?? null) as AnalysisShape | null;

  if (!analysis) {
    return generateInitialPlan(definitionId, conditionMap, modelIds);
  }

  const availableModelsInVariance = new Set(Object.keys(analysis.varianceAnalysis?.perModel ?? {}));
  const availableModelsInMatrix = new Set(Object.keys(analysis.visualizationData?.modelScenarioMatrix ?? {}));
  const availableKeys = new Set([...availableModelsInVariance, ...availableModelsInMatrix]);

  const models: ModelPlan[] = modelIds.map((requestedModelId) => {
    // Resolve alias if needed (e.g. gemini-2.5-flash -> gemini-2.5-flash-preview-09-2025)
    // If no match found, fallback to requested ID (which will result in 0 samples found, correctly)
    const lookupModelId = resolveModelIdFromAvailable(requestedModelId, availableKeys) ?? requestedModelId;

    const perScenarioVariance = analysis.varianceAnalysis?.perModel?.[lookupModelId]?.perScenario;
    const matrix = analysis.visualizationData?.modelScenarioMatrix?.[lookupModelId] ?? {};

    const conditions: ConditionPlan[] = Array.from(conditionMap.entries()).map(
      ([conditionKey, scenarioIds]) => {
        let n = 0;
        let sem: number | null = null;

        if (perScenarioVariance !== undefined) {
          const stats = calculateSemFromVarianceStats(perScenarioVariance, scenarioIds);
          n = stats.n;
          sem = stats.sem;
        } else {
          const scores = scenarioIds
            .map((id) => matrix[id])
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
          n = scores.length;
          sem = calculateSemFromScores(scores);
        }

        const evaluation = evaluateCondition(n, sem);

        return {
          scenarioId: scenarioIds[0]!,
          conditionKey,
          currentSamples: n,
          currentSEM: sem,
          status: evaluation.status,
          neededSamples: evaluation.neededSamples,
        };
      }
    );

    return {
      modelId: requestedModelId,
      conditions,
      totalNeededSamples: conditions.reduce((sum, c) => sum + c.neededSamples, 0),
    };
  });

  return {
    definitionId,
    models,
    totalJobs: models.reduce((sum, m) => sum + m.totalNeededSamples, 0),
  };
}
