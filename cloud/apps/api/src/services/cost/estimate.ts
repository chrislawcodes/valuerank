/**
 * Cost Estimation Service
 *
 * Calculates predicted and actual costs for runs.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import type {
  CostEstimate,
  ModelCostEstimate,
  EstimateCostInput,
  ActualCost,
  ModelActualCost,
} from './types.js';
import { FALLBACK_TOKENS } from './types.js';
import { getTokenStatsForDefinition, getAllModelAverage } from './statistics.js';

const log = createLogger('services:cost:estimate');

/**
 * Formats a cost value for display.
 * Uses dynamic precision based on magnitude.
 *
 * @param cost - Cost in dollars
 * @returns Formatted string (e.g., "$0.0012", "$0.45", "$12.50")
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculates cost from tokens and price per million.
 */
function calculateCost(tokens: number, pricePerMillion: number): number {
  return (tokens * pricePerMillion) / 1_000_000;
}

/**
 * Estimates the cost for running a definition against specified models.
 *
 * Three-tier fallback strategy:
 * 1. Model-specific statistics (if available)
 * 2. All-model average (if any stats exist in DB)
 * 3. System default (100 input / 900 output tokens)
 *
 * @param input - Definition ID, model IDs, and optional sample percentage
 * @returns Complete cost estimate with per-model breakdown
 */
export async function estimateCost(input: EstimateCostInput): Promise<CostEstimate> {
  const { definitionId, modelIds, samplePercentage = 100 } = input;

  log.info({ definitionId, modelIds, samplePercentage }, 'Estimating cost');

  // Validate inputs
  if (modelIds.length === 0) {
    throw new ValidationError('At least one model must be specified');
  }

  if (samplePercentage < 1 || samplePercentage > 100) {
    throw new ValidationError('samplePercentage must be between 1 and 100');
  }

  // Fetch definition with scenario count
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    include: {
      scenarios: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });

  if (!definition || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  // Calculate actual scenario count based on sample percentage
  const totalScenarios = definition.scenarios.length;
  const scenarioCount = Math.max(1, Math.floor((totalScenarios * samplePercentage) / 100));

  if (totalScenarios === 0) {
    // Return zero cost for empty definition
    return {
      total: 0,
      perModel: [],
      scenarioCount: 0,
      basedOnSampleCount: 0,
      isUsingFallback: true,
    };
  }

  // Fetch model details and pricing
  // Note: modelIds are model identifier strings (e.g., "gpt-4"), not database UUIDs
  const models = await db.llmModel.findMany({
    where: {
      modelId: { in: modelIds },
    },
    include: {
      provider: true,
    },
  });

  // Build model lookup map by modelId (the identifier string, not database ID)
  const modelMap = new Map(models.map((m) => [m.modelId, m]));

  // Fetch token statistics for all models
  // Use definition-aware lookup which implements fallback: definition stats → global stats
  const tokenStats = await getTokenStatsForDefinition(modelIds, definitionId);

  // Get all-model average as fallback
  const allModelAvg = await getAllModelAverage();

  // Calculate per-model estimates
  const perModel: ModelCostEstimate[] = [];
  let minSampleCount = Infinity;
  let anyUsingFallback = false;

  for (const modelId of modelIds) {
    const model = modelMap.get(modelId);
    if (!model) {
      log.warn({ modelId }, 'Model not found, skipping');
      continue;
    }

    // Get token stats with fallback chain
    let avgInputTokens: number;
    let avgOutputTokens: number;
    let sampleCount: number;
    let isUsingFallback = false;

    const stats = tokenStats.get(modelId);
    if (stats && stats.sampleCount > 0) {
      // Use model-specific stats
      avgInputTokens = stats.avgInputTokens;
      avgOutputTokens = stats.avgOutputTokens;
      sampleCount = stats.sampleCount;
    } else if (allModelAvg) {
      // Fallback to all-model average
      avgInputTokens = allModelAvg.input;
      avgOutputTokens = allModelAvg.output;
      sampleCount = 0;
      isUsingFallback = true;
      log.debug({ modelId }, 'Using all-model average for cost estimate');
    } else {
      // Fallback to system default
      avgInputTokens = FALLBACK_TOKENS.input;
      avgOutputTokens = FALLBACK_TOKENS.output;
      sampleCount = 0;
      isUsingFallback = true;
      log.debug({ modelId }, 'Using system default for cost estimate');
    }

    // Calculate total tokens for the run
    const totalInputTokens = scenarioCount * avgInputTokens;
    const totalOutputTokens = scenarioCount * avgOutputTokens;

    // Calculate costs
    const inputCost = calculateCost(totalInputTokens, Number(model.costInputPerMillion));
    const outputCost = calculateCost(totalOutputTokens, Number(model.costOutputPerMillion));
    const totalCost = inputCost + outputCost;

    perModel.push({
      modelId,
      displayName: model.displayName,
      scenarioCount,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      inputCost,
      outputCost,
      totalCost,
      avgInputPerProbe: avgInputTokens,
      avgOutputPerProbe: avgOutputTokens,
      sampleCount,
      isUsingFallback,
    });

    if (isUsingFallback) {
      anyUsingFallback = true;
    }
    if (sampleCount < minSampleCount) {
      minSampleCount = sampleCount;
    }
  }

  // Calculate total cost
  const total = perModel.reduce((sum, m) => sum + m.totalCost, 0);

  const result: CostEstimate = {
    total,
    perModel,
    scenarioCount,
    basedOnSampleCount: minSampleCount === Infinity ? 0 : minSampleCount,
    isUsingFallback: anyUsingFallback,
  };

  log.info(
    { definitionId, total: formatCost(total), modelCount: perModel.length, isUsingFallback: anyUsingFallback },
    'Cost estimate computed'
  );

  return result;
}

/**
 * Content structure expected in transcripts for cost calculation.
 */
type TranscriptCostContent = {
  costSnapshot?: {
    estimatedCost?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
};

/**
 * Transcript with cost-relevant fields.
 */
type TranscriptForCost = {
  modelId: string;
  content: unknown;
};

/**
 * Computes actual cost from completed run transcripts.
 * Aggregates costs from transcript costSnapshot data.
 *
 * @param transcripts - Array of transcripts with cost data
 * @param modelPricing - Map of modelId to pricing info
 * @returns Actual cost breakdown
 */
export async function computeActualCost(
  transcripts: TranscriptForCost[],
  modelPricing?: Map<string, { inputPerMillion: number; outputPerMillion: number }>
): Promise<ActualCost> {
  const perModel: Record<string, ModelActualCost> = {};
  let total = 0;

  // If no pricing map provided, fetch it
  // Note: transcript.modelId is the model identifier string (e.g., "gpt-4"), not a database UUID
  let pricing = modelPricing;
  if (!pricing) {
    const modelIds = [...new Set(transcripts.map((t) => t.modelId))];
    const models = await db.llmModel.findMany({
      where: { modelId: { in: modelIds } },
    });
    // Map by modelId (identifier string) to match transcript.modelId
    pricing = new Map(
      models.map((m) => [
        m.modelId,
        {
          inputPerMillion: Number(m.costInputPerMillion),
          outputPerMillion: Number(m.costOutputPerMillion),
        },
      ])
    );
  }

  for (const transcript of transcripts) {
    const { modelId, content } = transcript;

    // Parse content for cost data
    const contentObj = content as TranscriptCostContent;
    const costSnapshot = contentObj?.costSnapshot;

    // Initialize model entry if needed
    if (!perModel[modelId]) {
      perModel[modelId] = {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        probeCount: 0,
      };
    }

    const modelEntry = perModel[modelId];
    if (!modelEntry) continue;

    modelEntry.probeCount += 1;

    // Use precomputed cost if available
    if (costSnapshot?.estimatedCost !== undefined) {
      modelEntry.cost += costSnapshot.estimatedCost;
      modelEntry.inputTokens += costSnapshot.inputTokens ?? 0;
      modelEntry.outputTokens += costSnapshot.outputTokens ?? 0;
    } else if (costSnapshot?.inputTokens !== undefined && costSnapshot?.outputTokens !== undefined) {
      // Calculate cost from tokens if estimatedCost not stored
      const modelPrice = pricing.get(modelId);
      if (modelPrice) {
        const inputCost = calculateCost(costSnapshot.inputTokens, modelPrice.inputPerMillion);
        const outputCost = calculateCost(costSnapshot.outputTokens, modelPrice.outputPerMillion);
        modelEntry.cost += inputCost + outputCost;
      }
      modelEntry.inputTokens += costSnapshot.inputTokens;
      modelEntry.outputTokens += costSnapshot.outputTokens;
    }
  }

  // Calculate total
  for (const modelCost of Object.values(perModel)) {
    total += modelCost.cost;
  }

  log.debug({ total: formatCost(total), modelCount: Object.keys(perModel).length }, 'Actual cost computed');

  return { total, perModel };
}
