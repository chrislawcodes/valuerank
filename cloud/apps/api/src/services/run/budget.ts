/**
 * Provider Budget Deduction Service
 *
 * Deducts run costs from the relevant provider budgets when a run completes.
 * This is called non-blocking from the run completion path.
 */

import { db, deductFromProviderBalance, getProviderByName } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:run:budget');

/**
 * Deducts the cost of a completed run from each relevant provider's balance.
 *
 * - Groups transcript costs by provider name (extracted from modelId prefix)
 * - Skips providers with null balance (opt-in behavior)
 * - All errors are caught and logged — never throws
 */
export async function deductProviderBudget(runId: string): Promise<void> {
  try {
    log.debug({ runId }, 'Starting provider budget deduction');

    // Fetch all non-deleted transcripts with their costs and model IDs
    const transcripts = await db.transcript.findMany({
      where: { runId, deletedAt: null },
      select: {
        estimatedCost: true,
        modelId: true,
      },
    });

    if (transcripts.length === 0) {
      log.debug({ runId }, 'No transcripts found, skipping budget deduction');
      return;
    }

    // Group costs by provider name using modelId prefix convention (e.g., "openai:gpt-4o-mini")
    const costsByProviderName: Record<string, number> = {};
    for (const t of transcripts) {
      if (!t.estimatedCost) continue;

      const colonIdx = t.modelId.indexOf(':');
      if (colonIdx <= 0) {
        // No colon: cannot determine provider, skip
        log.debug({ runId, modelId: t.modelId }, 'Cannot determine provider for model, skipping');
        continue;
      }

      const providerName = t.modelId.slice(0, colonIdx);
      costsByProviderName[providerName] =
        (costsByProviderName[providerName] ?? 0) + t.estimatedCost;
    }

    const providerNames = Object.keys(costsByProviderName);
    if (providerNames.length === 0) {
      log.debug({ runId }, 'No costs to deduct');
      return;
    }

    // Deduct from each provider
    for (const providerName of providerNames) {
      const cost = costsByProviderName[providerName];
      if (!cost || cost <= 0) continue;

      try {
        const provider = await getProviderByName(providerName);
        if (!provider) {
          log.warn({ runId, providerName }, 'Provider not found for budget deduction');
          continue;
        }

        await deductFromProviderBalance(provider.id, cost, runId);
        log.info({ runId, providerName, cost }, 'Deducted from provider balance');
      } catch (providerErr) {
        // Log individual provider failure but continue with others
        log.error(
          { runId, providerName, cost, err: providerErr },
          'Failed to deduct from provider balance'
        );
      }
    }

    log.debug({ runId, providerCount: providerNames.length }, 'Budget deduction complete');
  } catch (err) {
    // Top-level catch — budget deduction must never fail the run
    log.error({ runId, err }, 'Budget deduction failed unexpectedly');
  }
}
