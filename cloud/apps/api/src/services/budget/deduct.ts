/**
 * Provider Budget Deduction Service
 *
 * Handles automatic deduction of provider balances when a run completes.
 * Balances are stored per-provider (e.g., "openai", "anthropic") and
 * decremented by the run's estimated cost for each provider.
 */

import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ModelCostEstimate } from '../cost/types.js';

const log = createLogger('services:budget:deduct');

/**
 * Group per-model cost estimates by provider name.
 * Uses the providerName field stored in each ModelCostEstimate.
 */
export function groupCostByProvider(perModel: ModelCostEstimate[]): Map<string, number> {
  const byProvider = new Map<string, number>();
  for (const item of perModel) {
    const existing = byProvider.get(item.providerName) ?? 0;
    byProvider.set(item.providerName, existing + item.totalCost);
  }
  return byProvider;
}

/**
 * Atomically deduct `cost` from the provider's balance using a NULL-safe raw UPDATE.
 * No-ops if the provider's balance is NULL (budget tracking not enabled).
 * No-ops if the provider does not exist.
 */
export async function atomicDeduct(providerName: string, cost: number): Promise<void> {
  await db.$executeRaw`
    UPDATE "llm_providers"
    SET "balance" = "balance" - ${new Prisma.Decimal(cost)}
    WHERE "name" = ${providerName}
      AND "balance" IS NOT NULL
  `;
}

/**
 * Extract the actual cost from a transcript's content.costSnapshot.
 * Returns 0 if the costSnapshot is missing or malformed.
 */
function extractTranscriptCost(content: unknown): number {
  if (content == null || typeof content !== 'object') return 0;
  const record = content as Record<string, unknown>;
  const snapshot = record.costSnapshot;
  if (snapshot == null || typeof snapshot !== 'object') return 0;
  const snap = snapshot as Record<string, unknown>;
  const cost = snap.estimatedCost;
  return typeof cost === 'number' && cost > 0 ? cost : 0;
}

/**
 * Deduct provider balances for a completed run using actual transcript costs.
 *
 * Reads costSnapshot.estimatedCost from each transcript, groups costs by
 * provider (via modelId → LlmModel → LlmProvider lookup), then atomically
 * deducts each provider's share.
 *
 * This replaces the estimated-cost approach which relied on a `providerName`
 * field that was missing from older run configs, causing silent deduction failures.
 *
 * Never throws — all errors are logged so the completion flow is never blocked.
 */
export async function deductActualProviderBalancesForRun(runId: string): Promise<void> {
  try {
    const transcripts = await db.transcript.findMany({
      where: { runId },
      select: { modelId: true, content: true },
    });

    if (transcripts.length === 0) {
      log.debug({ runId }, 'Run has no transcripts — skipping budget deduction');
      return;
    }

    // Aggregate cost by modelId
    const costByModel = new Map<string, number>();
    for (const t of transcripts) {
      const cost = extractTranscriptCost(t.content);
      if (cost > 0) {
        costByModel.set(t.modelId, (costByModel.get(t.modelId) ?? 0) + cost);
      }
    }

    if (costByModel.size === 0) {
      log.debug({ runId }, 'No transcript cost data — skipping budget deduction');
      return;
    }

    // Look up modelId → providerName via DB
    const modelIds = [...costByModel.keys()];
    const models = await db.llmModel.findMany({
      where: { modelId: { in: modelIds } },
      select: { modelId: true, provider: { select: { name: true, balance: true } } },
    });
    const modelToProvider = new Map(models.map((m) => [m.modelId, m.provider]));

    // Aggregate cost by provider, tracking balance availability
    const providerBalanceKnown = new Map<string, boolean>();
    const costByProvider = new Map<string, number>();
    for (const [modelId, cost] of costByModel) {
      const provider = modelToProvider.get(modelId);
      if (provider == null) {
        log.warn({ runId, modelId }, 'Model not found in DB — skipping deduction for this model');
        continue;
      }
      costByProvider.set(provider.name, (costByProvider.get(provider.name) ?? 0) + cost);
      providerBalanceKnown.set(provider.name, provider.balance != null);
    }

    // Deduct per provider
    for (const [providerName, cost] of costByProvider) {
      try {
        if (!providerBalanceKnown.get(providerName)) {
          log.debug({ runId, providerName }, 'Provider balance is null — skipping deduction');
          continue;
        }

        await atomicDeduct(providerName, cost);
        log.info({ runId, providerName, cost }, 'Deducted provider balance (actual cost)');
      } catch (err) {
        log.error({ runId, providerName, err }, 'Failed to deduct provider balance');
      }
    }
  } catch (err) {
    log.error({ runId, err }, 'Failed to deduct actual provider balances for run');
  }
}

/**
 * Reverse the budget deduction for a run by crediting back the costs
 * stored in each transcript's costSnapshot. Used by the backfill script
 * before re-opening a prematurely completed run.
 *
 * Costs are read from transcript.content.costSnapshot.estimatedCost.
 * Accepts an optional Prisma transaction client for atomic execution with
 * status updates.
 */
export async function reverseDeductionForRun(
  runId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  const transcripts = await client.transcript.findMany({
    where: { runId },
    select: { modelId: true, content: true },
  });
  if (transcripts.length === 0) return;

  const costByModel = new Map<string, number>();
  for (const t of transcripts) {
    const cost = extractTranscriptCost(t.content);
    if (cost > 0) {
      costByModel.set(t.modelId, (costByModel.get(t.modelId) ?? 0) + cost);
    }
  }
  if (costByModel.size === 0) return;

  const modelIds = [...costByModel.keys()];
  const models = await client.llmModel.findMany({
    where: { modelId: { in: modelIds } },
    select: { modelId: true, provider: { select: { name: true, balance: true } } },
  });
  const modelToProvider = new Map(models.map((m) => [m.modelId, m.provider]));

  const costByProvider = new Map<string, number>();
  for (const [modelId, cost] of costByModel) {
    const provider = modelToProvider.get(modelId);
    if (provider == null) continue;
    costByProvider.set(provider.name, (costByProvider.get(provider.name) ?? 0) + cost);
  }

  for (const [providerName, cost] of costByProvider) {
    if (tx != null) {
      await tx.$executeRaw`
        UPDATE "llm_providers"
        SET "balance" = "balance" + ${new Prisma.Decimal(cost)}
        WHERE "name" = ${providerName}
          AND "balance" IS NOT NULL
      `;
    } else {
      await atomicDeduct(providerName, -cost);
    }
    log.info({ runId, providerName, cost }, 'Reversed provider balance (backfill)');
  }
}

/**
 * Deduct provider balances for a completed run.
 *
 * Reads `estimatedCosts.perModel` from the run's JSON config, groups costs by
 * provider prefix, then atomically deducts each provider's share.
 *
 * @deprecated Use deductActualProviderBalancesForRun instead.
 * Never throws — all errors are logged so the completion flow is never blocked.
 */
export async function deductProviderBalancesForRun(runId: string): Promise<void> {
  let run: { config: unknown } | null = null;

  try {
    run = await db.run.findUnique({
      where: { id: runId },
      select: { config: true },
    });
  } catch (err) {
    log.error({ runId, err }, 'Failed to fetch run for budget deduction');
    return;
  }

  if (run === null) {
    log.warn({ runId }, 'Run not found for budget deduction — skipping');
    return;
  }

  // config is a JSON blob; estimatedCosts may be absent on old runs
  const config = run.config as Record<string, unknown> | null;
  const estimatedCosts = config?.estimatedCosts as
    | { perModel?: ModelCostEstimate[] }
    | undefined
    | null;

  if (!estimatedCosts?.perModel || estimatedCosts.perModel.length === 0) {
    log.debug({ runId }, 'Run has no estimatedCosts — skipping budget deduction');
    return;
  }

  const costByProvider = groupCostByProvider(estimatedCosts.perModel);

  for (const [providerName, cost] of costByProvider) {
    try {
      // Verify the provider exists in DB before attempting deduction
      const provider = await db.llmProvider.findFirst({
        where: { name: providerName },
        select: { id: true, balance: true },
      });

      if (provider === null) {
        log.warn({ runId, providerName }, 'Provider not found in DB — skipping deduction');
        continue;
      }

      if (provider.balance === null) {
        log.debug({ runId, providerName }, 'Provider balance is null — skipping deduction');
        continue;
      }

      await atomicDeduct(providerName, cost);
      log.info({ runId, providerName, cost }, 'Deducted provider balance');
    } catch (err) {
      log.error({ runId, providerName, err }, 'Failed to deduct provider balance');
    }
  }
}
