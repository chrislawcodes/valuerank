import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';

export async function resolveModelsForLaunch(params: {
  requestedModelIds: string[];
}): Promise<{
  selectedModels: string[];
  normalizedModels: string[];
  defaultModels: string[];
}> {
  const { requestedModelIds } = params;

  const activeModels = await db.llmModel.findMany({
    where: {
      status: 'ACTIVE',
      ...(requestedModelIds.length > 0 ? { modelId: { in: requestedModelIds } } : {}),
    },
    select: { modelId: true, isDefault: true },
  });
  const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
  const fallbackModels = activeModels.map((model) => model.modelId);
  const selectedModels = requestedModelIds.length > 0
    ? fallbackModels
    : (defaultModels.length > 0 ? defaultModels : fallbackModels);
  if (selectedModels.length === 0) {
    throw new ValidationError('No active models are configured. Add an active model before starting a domain evaluation.');
  }
  const normalizedModels = selectedModels.slice().sort((left, right) => left.localeCompare(right));

  return { selectedModels, normalizedModels, defaultModels };
}
