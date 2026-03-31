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
 * Extract the provider name prefix from a modelId.
 * e.g. "openai:gpt-4o" → "openai"
 * Returns null if the modelId has no ':' separator.
 */
export function extractProviderName(modelId: string): string | null {
  if (!modelId.includes(':')) {
    return null;
  }
  return modelId.split(':', 1)[0] ?? null;
}

/**
 * Group per-model cost estimates by provider name.
 * Models without a ':' separator are skipped with a warning.
 */
export function groupCostByProvider(perModel: ModelCostEstimate[]): Map<string, number> {
  const byProvider = new Map<string, number>();
  for (const item of perModel) {
    const providerName = extractProviderName(item.modelId);
    if (providerName === null) {
      log.warn({ modelId: item.modelId }, 'Cannot extract provider name from modelId — skipping');
      continue;
    }
    const existing = byProvider.get(providerName) ?? 0;
    byProvider.set(providerName, existing + item.totalCost);
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
 * Deduct provider balances for a completed run.
 *
 * Reads `estimatedCosts.perModel` from the run's JSON config, groups costs by
 * provider prefix, then atomically deducts each provider's share.
 *
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
