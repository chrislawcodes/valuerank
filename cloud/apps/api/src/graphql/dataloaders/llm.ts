import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import type { LlmProvider, LlmModel } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('dataloader:llm');

/**
 * Creates a DataLoader for batching LlmProvider lookups by ID.
 */
export function createLlmProviderLoader(): DataLoader<string, LlmProvider | null> {
  return new DataLoader<string, LlmProvider | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching provider load');

      const providers = await db.llmProvider.findMany({
        where: { id: { in: [...ids] } },
      });

      const providerMap = new Map(providers.map((p) => [p.id, p]));
      return ids.map((id) => providerMap.get(id) ?? null);
    },
    { cache: true }
  );
}

/**
 * Creates a DataLoader for batching LlmModel lookups by ID.
 */
export function createLlmModelLoader(): DataLoader<string, LlmModel | null> {
  return new DataLoader<string, LlmModel | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching model load');

      const models = await db.llmModel.findMany({
        where: { id: { in: [...ids] } },
      });

      const modelMap = new Map(models.map((m) => [m.id, m]));
      return ids.map((id) => modelMap.get(id) ?? null);
    },
    { cache: true }
  );
}

/**
 * Creates a DataLoader for batching LlmModel lookups by provider ID.
 * Returns an array of models for each provider.
 */
export function createLlmModelsByProviderLoader(): DataLoader<string, LlmModel[]> {
  return new DataLoader<string, LlmModel[]>(
    async (providerIds: readonly string[]) => {
      log.debug({ providerIds: [...providerIds] }, 'Batching models by provider load');

      const models = await db.llmModel.findMany({
        where: { providerId: { in: [...providerIds] } },
        orderBy: { displayName: 'asc' },
      });

      // Group models by provider
      const modelsByProvider = new Map<string, LlmModel[]>();
      for (const model of models) {
        const existing = modelsByProvider.get(model.providerId) ?? [];
        existing.push(model);
        modelsByProvider.set(model.providerId, existing);
      }

      return providerIds.map((id) => modelsByProvider.get(id) ?? []);
    },
    { cache: true }
  );
}
