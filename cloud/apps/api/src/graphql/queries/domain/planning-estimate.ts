import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { estimateCost as estimateCostService } from '../../../services/cost/estimate.js';
import { parseTemperature } from '../../../utils/temperature.js';
import {
  buildExistingBatchCountByDefinitionId,
} from './planning-utils.js';
import {
  type DomainEvaluationCostEstimate,
  hydrateDefinitionAncestors,
  selectLatestDefinitionPerLineage,
  supportsTemperature,
  type DomainTrialPlanCellEstimate,
} from './shared.js';

const DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE = 5;
const DOMAIN_ESTIMATE_KNOWN_EXCLUSIONS = [
  'Judge/evaluator and summarization passes are not included in this estimate yet.',
  'Retries, provider routing changes, and failed-job overhead are not included.',
] as const;

export type DomainEstimateInput = {
  domainId: string;
  definitionIds?: string[];
  modelIds?: string[];
  temperature?: number | null;
  samplePercentage?: number;
  samplesPerScenario?: number;
  scopeCategory?: string | null;
};

export type DomainEstimateInternals = {
  trialPlan: {
    domainId: string;
    domainName: string;
    vignettes: Array<{
      definitionId: string;
      definitionName: string;
      definitionVersion: number;
      signature: string;
      scenarioCount: number;
      existingBatchCount: number;
    }>;
    models: Array<{
      modelId: string;
      label: string;
      isDefault: boolean;
      supportsTemperature: boolean;
    }>;
    cellEstimates: DomainTrialPlanCellEstimate[];
    totalEstimatedCost: number;
    existingTemperatures: number[];
    defaultTemperature: number | null;
    temperatureWarning: string | null;
  };
  costEstimate: DomainEvaluationCostEstimate;
};

function buildFallbackReason(isUsingFallback: boolean, basedOnSampleCount: number): string | null {
  if (!isUsingFallback) return null;
  if (basedOnSampleCount === 0) {
    return 'No historical token data is available for at least one selected model. Using system defaults (100 input / 900 output tokens per probe).';
  }
  return 'Some selected models are using fallback token estimates based on all-model averages.';
}

function buildEstimateConfidence(isUsingFallback: boolean, basedOnSampleCount: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (basedOnSampleCount === 0) return 'LOW';
  if (isUsingFallback || basedOnSampleCount < 50) return 'MEDIUM';
  return 'HIGH';
}

export async function buildDomainEstimate(input: DomainEstimateInput): Promise<DomainEstimateInternals> {
  const {
    domainId,
    definitionIds = [],
    modelIds = [],
    temperature = null,
    samplePercentage = 100,
    samplesPerScenario = 1,
    scopeCategory = 'PRODUCTION',
  } = input;
  const effectiveScopeCategory = scopeCategory ?? 'PRODUCTION';

  const domain = await db.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new NotFoundError('Domain', domainId);

  const definitions = await db.definition.findMany({
    where: { domainId, deletedAt: null },
    select: {
      id: true,
      name: true,
      version: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (definitions.length === 0) {
    return {
      trialPlan: {
        domainId,
        domainName: domain.name,
        vignettes: [],
        models: [],
        cellEstimates: [],
        totalEstimatedCost: 0,
        existingTemperatures: [],
        defaultTemperature: temperature,
        temperatureWarning: null,
      },
      costEstimate: {
        domainId,
        domainName: domain.name,
        scopeCategory: effectiveScopeCategory,
        targetedDefinitions: 0,
        totalScenarioCount: 0,
        totalEstimatedCost: 0,
        basedOnSampleCount: 0,
        isUsingFallback: true,
        fallbackReason: 'No launchable vignettes are selected for this domain.',
        estimateConfidence: 'LOW',
        knownExclusions: [...DOMAIN_ESTIMATE_KNOWN_EXCLUSIONS],
        models: [],
        definitions: [],
        existingTemperatures: [],
        defaultTemperature: temperature,
        temperatureWarning: null,
      },
    };
  }

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
  const latestDefinitionById = new Map(latestDefinitions.map((definition) => [definition.id, definition]));
  const selectedDefinitions = definitionIds.length > 0
    ? definitionIds
      .map((definitionId) => latestDefinitionById.get(definitionId))
      .filter((definition): definition is (typeof latestDefinitions)[number] => definition !== undefined)
    : latestDefinitions;
  const latestDefinitionIds = selectedDefinitions.map((definition) => definition.id);

  const scenarioCounts = await db.scenario.groupBy({
    by: ['definitionId'],
    where: { definitionId: { in: latestDefinitionIds }, deletedAt: null },
    _count: { _all: true },
  });
  const scenarioCountByDefinition = new Map<string, number>(
    scenarioCounts.map((row) => [row.definitionId, row._count._all]),
  );

  const activeModels = await db.llmModel.findMany({
    where: {
      status: 'ACTIVE',
      ...(modelIds.length > 0 ? { modelId: { in: modelIds } } : {}),
    },
    select: {
      modelId: true,
      displayName: true,
      isDefault: true,
      apiConfig: true,
    },
    orderBy: { displayName: 'asc' },
  });
  const defaultModels = activeModels.filter((model) => model.isDefault);
  const selectedModels = modelIds.length > 0
    ? activeModels
    : (defaultModels.length > 0 ? defaultModels : activeModels);

  const selectedModelIds = selectedModels.map((model) => model.modelId);
  const cellEstimates: DomainTrialPlanCellEstimate[] = [];
  const perDefinitionTotals = new Map<string, { total: number; basedOnSampleCount: number; isUsingFallback: boolean }>();
  const perModelTotals = new Map<string, { total: number; basedOnSampleCount: number; isUsingFallback: boolean }>();
  let totalEstimatedCost = 0;
  let basedOnSampleCount = Number.POSITIVE_INFINITY;
  let anyUsingFallback = false;

  if (selectedModelIds.length > 0) {
    for (let offset = 0; offset < selectedDefinitions.length; offset += DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE) {
      const chunk = selectedDefinitions.slice(offset, offset + DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE);
      const estimates = await Promise.all(
        chunk.map(async (definition) => {
          const estimate = await estimateCostService({
            definitionId: definition.id,
            modelIds: selectedModelIds,
            samplePercentage,
            samplesPerScenario,
          });
          return { definition, estimate };
        }),
      );

      for (const { definition, estimate } of estimates) {
        const definitionTotal = {
          total: estimate.total,
          basedOnSampleCount: estimate.basedOnSampleCount,
          isUsingFallback: estimate.isUsingFallback,
        };
        perDefinitionTotals.set(definition.id, definitionTotal);
        totalEstimatedCost += estimate.total;
        basedOnSampleCount = Math.min(basedOnSampleCount, estimate.basedOnSampleCount);
        if (estimate.isUsingFallback) {
          anyUsingFallback = true;
        }

        for (const modelEstimate of estimate.perModel) {
          cellEstimates.push({
            definitionId: definition.id,
            modelId: modelEstimate.modelId,
            estimatedCost: modelEstimate.totalCost,
          });
          const currentModel = perModelTotals.get(modelEstimate.modelId) ?? {
            total: 0,
            basedOnSampleCount: modelEstimate.sampleCount,
            isUsingFallback: false,
          };
          currentModel.total += modelEstimate.totalCost;
          currentModel.basedOnSampleCount = Math.min(currentModel.basedOnSampleCount, modelEstimate.sampleCount);
          currentModel.isUsingFallback = currentModel.isUsingFallback || modelEstimate.isUsingFallback;
          perModelTotals.set(modelEstimate.modelId, currentModel);
        }
      }
    }
  } else {
    basedOnSampleCount = 0;
    anyUsingFallback = true;
  }

  const existingRuns = await db.run.findMany({
    where: {
      definitionId: { in: latestDefinitionIds },
      deletedAt: null,
    },
    select: { definitionId: true, status: true, runCategory: true, config: true },
  });
  const existingTemperatureSet = new Set<number>();
  for (const run of existingRuns) {
    const config = run.config as { temperature?: unknown } | null;
    const parsed = parseTemperature(config?.temperature);
    if (parsed !== null) {
      existingTemperatureSet.add(parsed);
    }
  }
  const existingTemperatures = Array.from(existingTemperatureSet.values()).sort((a, b) => a - b);

  const existingBatchCountByDefinitionId = buildExistingBatchCountByDefinitionId(
    existingRuns,
    effectiveScopeCategory,
    temperature,
  );

  let temperatureWarning: string | null = null;
  if (existingTemperatures.length > 0) {
    if (temperature === null) {
      temperatureWarning = 'Existing domain trials include explicit temperatures. Running with provider default may produce separate versions.';
    } else if (!existingTemperatures.includes(temperature)) {
      temperatureWarning = `Selected temperature (${temperature}) differs from existing temperatures (${existingTemperatures.join(', ')}).`;
    }
  }

  const fallbackReason = buildFallbackReason(anyUsingFallback, Number.isFinite(basedOnSampleCount) ? basedOnSampleCount : 0);
  const estimateConfidence = buildEstimateConfidence(anyUsingFallback, Number.isFinite(basedOnSampleCount) ? basedOnSampleCount : 0);

  return {
    trialPlan: {
      domainId,
      domainName: domain.name,
      vignettes: selectedDefinitions.map((definition) => ({
        definitionId: definition.id,
        definitionName: definition.name ?? 'Untitled vignette',
        definitionVersion: definition.version,
        signature: formatTrialSignature(definition.version, temperature),
        scenarioCount: scenarioCountByDefinition.get(definition.id) ?? 0,
        existingBatchCount: existingBatchCountByDefinitionId.get(definition.id) ?? 0,
      })),
      models: selectedModels.map((model) => ({
        modelId: model.modelId,
        label: model.displayName,
        isDefault: model.isDefault,
        supportsTemperature: supportsTemperature(model.apiConfig),
      })),
      cellEstimates,
      totalEstimatedCost,
      existingTemperatures,
      defaultTemperature: temperature,
      temperatureWarning,
    },
    costEstimate: {
      domainId,
      domainName: domain.name,
      scopeCategory: effectiveScopeCategory,
      targetedDefinitions: selectedDefinitions.length,
      totalScenarioCount: selectedDefinitions.reduce(
        (total, definition) => total + (scenarioCountByDefinition.get(definition.id) ?? 0),
        0,
      ),
      totalEstimatedCost,
      basedOnSampleCount: Number.isFinite(basedOnSampleCount) ? basedOnSampleCount : 0,
      isUsingFallback: anyUsingFallback,
      fallbackReason,
      estimateConfidence,
      knownExclusions: [...DOMAIN_ESTIMATE_KNOWN_EXCLUSIONS],
      models: selectedModels.map((model) => {
        const modelTotals = perModelTotals.get(model.modelId);
        return {
          modelId: model.modelId,
          label: model.displayName,
          isDefault: model.isDefault,
          supportsTemperature: supportsTemperature(model.apiConfig),
          estimatedCost: modelTotals?.total ?? 0,
          basedOnSampleCount: modelTotals?.basedOnSampleCount ?? 0,
          isUsingFallback: modelTotals?.isUsingFallback ?? true,
        };
      }),
      definitions: selectedDefinitions.map((definition) => {
        const definitionTotals = perDefinitionTotals.get(definition.id);
        return {
          definitionId: definition.id,
          definitionName: definition.name ?? 'Untitled vignette',
          definitionVersion: definition.version,
          signature: formatTrialSignature(definition.version, temperature),
          scenarioCount: scenarioCountByDefinition.get(definition.id) ?? 0,
          estimatedCost: definitionTotals?.total ?? 0,
          basedOnSampleCount: definitionTotals?.basedOnSampleCount ?? 0,
          isUsingFallback: definitionTotals?.isUsingFallback ?? true,
        };
      }),
      existingTemperatures,
      defaultTemperature: temperature,
      temperatureWarning,
    },
  };
}
