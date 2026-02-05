/**
 * Cost Estimate GraphQL Types
 *
 * Defines types and queries for cost estimation and token statistics.
 */

import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { ValidationError, NotFoundError } from '@valuerank/shared';
import { estimateCost as estimateCostService } from '../../services/cost/estimate.js';
import { getTokenStatsForModels, getAllModelAverage } from '../../services/cost/statistics.js';
import type {
  CostEstimate as CostEstimateShape,
  ModelCostEstimate as ModelCostEstimateShape,
} from '../../services/cost/types.js';

// Shape for token statistics
type ModelTokenStatsShape = {
  modelId: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  sampleCount: number;
  lastUpdatedAt: Date;
};

// Shape for actual cost per model
type ActualModelCostShape = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  probeCount: number;
};

// Shape for actual cost aggregate
type ActualCostShape = {
  total: number;
  perModel: ActualModelCostShape[];
};

// Object refs
const ModelTokenStatsRef = builder.objectRef<ModelTokenStatsShape>('ModelTokenStats');
const ModelCostEstimateRef = builder.objectRef<ModelCostEstimateShape>('ModelCostEstimate');
const CostEstimateRef = builder.objectRef<CostEstimateShape>('CostEstimate');
const ActualModelCostRef = builder.objectRef<ActualModelCostShape>('ActualModelCost');
const ActualCostRef = builder.objectRef<ActualCostShape>('ActualCost');

// ModelTokenStats type implementation
builder.objectType(ModelTokenStatsRef, {
  description: 'Token usage statistics for a model, used for cost prediction',
  fields: (t) => ({
    modelId: t.exposeID('modelId', {
      description: "Model identifier (e.g., 'openai:gpt-4o')",
    }),
    avgInputTokens: t.exposeFloat('avgInputTokens', {
      description: 'Average input tokens per probe based on historical data',
    }),
    avgOutputTokens: t.exposeFloat('avgOutputTokens', {
      description: 'Average output tokens per probe based on historical data',
    }),
    sampleCount: t.exposeInt('sampleCount', {
      description: 'Number of probes used to compute these averages',
    }),
    lastUpdatedAt: t.expose('lastUpdatedAt', {
      type: 'DateTime',
      description: 'When these statistics were last updated',
    }),
  }),
});

// ModelCostEstimate type implementation
builder.objectType(ModelCostEstimateRef, {
  description: 'Cost estimate for a single model in a run',
  fields: (t) => ({
    modelId: t.exposeID('modelId', {
      description: "Model identifier (e.g., 'openai:gpt-4o')",
    }),
    displayName: t.exposeString('displayName', {
      description: 'Human-readable model name',
    }),
    scenarioCount: t.exposeInt('scenarioCount', {
      description: 'Number of scenarios this model will run',
    }),
    inputTokens: t.exposeFloat('inputTokens', {
      description: 'Predicted total input tokens for all scenarios',
    }),
    outputTokens: t.exposeFloat('outputTokens', {
      description: 'Predicted total output tokens for all scenarios',
    }),
    inputCost: t.exposeFloat('inputCost', {
      description: 'Cost for input tokens in USD',
    }),
    outputCost: t.exposeFloat('outputCost', {
      description: 'Cost for output tokens in USD',
    }),
    totalCost: t.exposeFloat('totalCost', {
      description: 'Total cost (inputCost + outputCost) in USD',
    }),
    avgInputPerProbe: t.exposeFloat('avgInputPerProbe', {
      description: 'Average input tokens per probe used for prediction',
    }),
    avgOutputPerProbe: t.exposeFloat('avgOutputPerProbe', {
      description: 'Average output tokens per probe used for prediction',
    }),
    sampleCount: t.exposeInt('sampleCount', {
      description: 'Number of historical probes used to compute averages',
    }),
    isUsingFallback: t.exposeBoolean('isUsingFallback', {
      description: 'True if using fallback estimates (no model-specific history)',
    }),
  }),
});

// CostEstimate type implementation
builder.objectType(CostEstimateRef, {
  description: 'Complete cost estimate for a run before execution',
  fields: (t) => ({
    total: t.exposeFloat('total', {
      description: 'Total estimated cost in USD across all models',
    }),
    perModel: t.field({
      type: [ModelCostEstimateRef],
      description: 'Per-model cost breakdown',
      resolve: (estimate) => estimate.perModel,
    }),
    scenarioCount: t.exposeInt('scenarioCount', {
      description: 'Total number of scenarios to be run',
    }),
    basedOnSampleCount: t.exposeInt('basedOnSampleCount', {
      description: 'Minimum sample count across all models (indicates estimate quality)',
    }),
    isUsingFallback: t.exposeBoolean('isUsingFallback', {
      description: 'True if any model is using fallback estimates',
    }),
    fallbackReason: t.string({
      nullable: true,
      description: 'Explanation of fallback usage if applicable',
      resolve: (estimate) => {
        if (!estimate.isUsingFallback) return null;
        if (estimate.basedOnSampleCount === 0) {
          return 'No historical token data available. Using system defaults (100 input / 900 output tokens per probe).';
        }
        return 'Some models lack historical data. Using all-model average for those models.';
      },
    }),
  }),
});

// ActualModelCost type implementation
builder.objectType(ActualModelCostRef, {
  description: 'Actual cost for a single model from a completed run',
  fields: (t) => ({
    modelId: t.exposeID('modelId', {
      description: 'Model identifier',
    }),
    inputTokens: t.exposeInt('inputTokens', {
      description: 'Total input tokens used',
    }),
    outputTokens: t.exposeInt('outputTokens', {
      description: 'Total output tokens used',
    }),
    cost: t.exposeFloat('cost', {
      description: 'Actual cost in USD',
    }),
    probeCount: t.exposeInt('probeCount', {
      description: 'Number of probes completed',
    }),
  }),
});

// ActualCost type implementation
builder.objectType(ActualCostRef, {
  description: 'Actual cost summary for a completed run',
  fields: (t) => ({
    total: t.exposeFloat('total', {
      description: 'Total actual cost in USD',
    }),
    perModel: t.field({
      type: [ActualModelCostRef],
      description: 'Per-model actual cost breakdown',
      resolve: (actual) => actual.perModel,
    }),
  }),
});

// Export refs for use in other types (Run, AnalysisResult)
export { CostEstimateRef, ActualCostRef };
export type { CostEstimateShape, ActualCostShape };

// Query: estimateCost
builder.queryField('estimateCost', (t) =>
  t.field({
    type: CostEstimateRef,
    description:
      'Estimate cost for a potential run before starting it. Returns per-model breakdown with token predictions based on historical data.',
    args: {
      definitionId: t.arg.id({
        required: true,
        description: 'Definition ID to estimate cost for',
      }),
      models: t.arg.stringList({
        required: true,
        description: 'Model IDs to include in the estimate',
      }),
      samplePercentage: t.arg.int({
        required: false,
        defaultValue: 100,
        description: 'Sample percentage (1-100, default 100)',
      }),
      samplesPerScenario: t.arg.int({
        required: false,
        defaultValue: 1,
        description: 'Number of samples per scenario-model pair for multi-sample runs (1-100, default 1)',
      }),
    },
    resolve: async (_, args) => {
      const { definitionId, models, samplePercentage, samplesPerScenario } = args;

      // Resolve model identifiers from various formats
      // The cost service expects model identifier strings (e.g., "gpt-4"), not database UUIDs
      const normalizedInputs = models.map((modelInput) =>
        modelInput === 'gemini-2.5-flash-preview-05-20'
          ? 'gemini-2.5-flash-preview-09-2025'
          : modelInput
      );

      type ModelTokenInput =
        | { raw: string; kind: 'cuid'; id: string }
        | { raw: string; kind: 'provider'; providerName: string; modelId: string }
        | { raw: string; kind: 'modelId'; modelId: string };

      const parsedInputs: ModelTokenInput[] = normalizedInputs.map((modelInput) => {
        const isCuid = /^c[a-z0-9]{20,}$/i.test(modelInput);
        if (isCuid) {
          return { raw: modelInput, kind: 'cuid', id: modelInput };
        }

        if (modelInput.includes(':')) {
          const parts = modelInput.split(':');
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new ValidationError(
              `Invalid model identifier format: ${modelInput}. Expected 'provider:modelId' or model identifier.`
            );
          }
          const [providerName, modelId] = parts;
          return { raw: modelInput, kind: 'provider', providerName, modelId };
        }

        return { raw: modelInput, kind: 'modelId', modelId: modelInput };
      });

      const cuidIds = parsedInputs.filter((i) => i.kind === 'cuid').map((i) => i.id);
      const directModelIds = parsedInputs.filter((i) => i.kind === 'modelId').map((i) => i.modelId);
      const providerPairs = parsedInputs
        .filter((i) => i.kind === 'provider')
        .map((i) => ({ providerName: i.providerName, modelId: i.modelId }));

      const [modelsByCuid, modelsByDirectId, providersByName] = await Promise.all([
        cuidIds.length
          ? db.llmModel.findMany({ where: { id: { in: cuidIds } } })
          : Promise.resolve([]),
        directModelIds.length
          ? db.llmModel.findMany({ where: { modelId: { in: directModelIds } } })
          : Promise.resolve([]),
        providerPairs.length
          ? db.llmProvider.findMany({
              where: { name: { in: Array.from(new Set(providerPairs.map((p) => p.providerName))) } },
            })
          : Promise.resolve([]),
      ]);

      const providerMap = new Map(providersByName.map((p) => [p.name, p]));

      const providerClauses = providerPairs
        .map((pair) => {
          const provider = providerMap.get(pair.providerName);
          if (!provider) return null;
          return {
            providerId: provider.id,
            modelId: pair.modelId,
          };
        })
        .filter((pair): pair is { providerId: string; modelId: string } => Boolean(pair));

      const providerModels =
        providerClauses.length > 0
          ? await db.llmModel.findMany({
              where: {
                OR: providerClauses,
              },
            })
          : [];

      const cuidMap = new Map(modelsByCuid.map((m) => [m.id, m]));
      const directMap = new Map(modelsByDirectId.map((m) => [m.modelId, m]));
      const providerModelMap = new Map(
        providerModels.map((m) => [`${m.providerId}:${m.modelId}`, m])
      );

      const modelIds: string[] = [];
      for (const input of parsedInputs) {
        if (input.kind === 'cuid') {
          const model = cuidMap.get(input.id);
          if (!model) {
            throw new NotFoundError('Model', input.raw);
          }
          modelIds.push(model.modelId);
          continue;
        }

        if (input.kind === 'provider') {
          const provider = providerMap.get(input.providerName);
          if (!provider) {
            throw new NotFoundError('Provider', input.providerName);
          }
          const model = providerModelMap.get(`${provider.id}:${input.modelId}`);
          if (!model) {
            throw new NotFoundError('Model', input.raw);
          }
          modelIds.push(model.modelId);
          continue;
        }

        const model = directMap.get(input.modelId);
        if (!model) {
          throw new NotFoundError('Model', input.raw);
        }
        modelIds.push(model.modelId);
      }

      return estimateCostService({
        definitionId: String(definitionId),
        modelIds,
        samplePercentage: samplePercentage ?? 100,
        samplesPerScenario: samplesPerScenario ?? 1,
      });
    },
  })
);

// Query: modelTokenStats
builder.queryField('modelTokenStats', (t) =>
  t.field({
    type: [ModelTokenStatsRef],
    description: 'Get token statistics for specific models. Useful for understanding prediction quality.',
    args: {
      modelIds: t.arg.stringList({
        required: false,
        description: 'Model IDs to get stats for (returns all if not specified)',
      }),
    },
    resolve: async (_, args) => {
      const { modelIds: inputModelIds } = args;

      if (inputModelIds && inputModelIds.length > 0) {
        // Convert database UUIDs to model identifier strings if needed
        const resolvedModelIds: string[] = [];
        for (const modelInput of inputModelIds) {
          // Check if it's a database UUID (cuid format: starts with 'c', ~25 chars, alphanumeric)
          // CUIDs look like: "clxx1234567890abcdefgh" - they don't contain dashes
          const isCuid = /^c[a-z0-9]{20,}$/i.test(modelInput);

          if (isCuid) {
            const model = await db.llmModel.findUnique({
              where: { id: modelInput },
            });
            if (model) {
              resolvedModelIds.push(model.modelId);
            }
            continue;
          }

          // Check for provider:modelId format
          if (modelInput.includes(':')) {
            const parts = modelInput.split(':');
            if (parts.length === 2 && parts[1]) {
              resolvedModelIds.push(parts[1]);
              continue;
            }
          }

          // Otherwise, assume it's already a model identifier
          resolvedModelIds.push(modelInput);
        }

        // Return stats for specific models
        const statsMap = await getTokenStatsForModels(resolvedModelIds);
        return Array.from(statsMap.values());
      }

      // Return all global stats with model identifier from relation
      const allStats = await db.modelTokenStatistics.findMany({
        where: { definitionId: null },
        include: {
          model: { select: { modelId: true } },
        },
      });

      return allStats.map((s) => ({
        modelId: s.model.modelId,
        avgInputTokens: Number(s.avgInputTokens),
        avgOutputTokens: Number(s.avgOutputTokens),
        sampleCount: s.sampleCount,
        lastUpdatedAt: s.lastUpdatedAt,
      }));
    },
  })
);

// Query: allModelTokenAverage - useful for understanding fallback values
builder.queryField('allModelTokenAverage', (t) =>
  t.field({
    type: ModelTokenStatsRef,
    nullable: true,
    description: 'Get the average token statistics across all models. Used as fallback when model-specific stats are unavailable.',
    resolve: async () => {
      const avg = await getAllModelAverage();
      if (!avg) return null;

      return {
        modelId: 'all-model-average',
        avgInputTokens: avg.input,
        avgOutputTokens: avg.output,
        sampleCount: avg.sampleCount,
        lastUpdatedAt: new Date(), // Not meaningful for aggregate
      };
    },
  })
);
