import { describe, expect, it } from 'vitest';
import type { LlmModel } from '../../../../src/api/operations/llm';
import { buildProviderBudgetEstimates } from '../../../../src/components/domains/domainTrials/launch-state';

function makeModel(overrides: Partial<LlmModel> = {}): LlmModel {
  return {
    id: 'model-openai',
    providerId: 'openai',
    modelId: 'model-openai',
    displayName: 'OpenAI Model',
    costInputPerMillion: 1,
    costOutputPerMillion: 2,
    status: 'ACTIVE',
    isDefault: true,
    isAvailable: true,
    apiConfig: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    provider: {
      id: 'openai',
      name: 'openai',
      displayName: 'OpenAI',
      maxParallelRequests: 5,
      requestsPerMinute: 100,
      isEnabled: true,
      balance: 100,
      lastSyncedAt: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      models: [],
    },
    ...overrides,
  };
}

describe('buildProviderBudgetEstimates', () => {
  it('multiplies per-batch cost by remaining batches needed for each vignette', () => {
    const estimates = buildProviderBudgetEstimates({
      selectedModels: [
        makeModel({
          modelId: 'model-openai',
          displayName: 'OpenAI Model',
          provider: {
            id: 'openai',
            name: 'openai',
            displayName: 'OpenAI',
            maxParallelRequests: 5,
            requestsPerMinute: 100,
            isEnabled: true,
            balance: 100,
            lastSyncedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
            models: [],
          },
        }),
        makeModel({
          id: 'model-anthropic',
          providerId: 'anthropic',
          modelId: 'model-anthropic',
          displayName: 'Anthropic Model',
          provider: {
            id: 'anthropic',
            name: 'anthropic',
            displayName: 'Anthropic',
            maxParallelRequests: 5,
            requestsPerMinute: 100,
            isEnabled: true,
            balance: 50,
            lastSyncedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
            models: [],
          },
        }),
      ],
      cellEstimates: [
        { definitionId: 'def-1', modelId: 'model-openai', estimatedCost: 100 },
        { definitionId: 'def-1', modelId: 'model-anthropic', estimatedCost: 50 },
        { definitionId: 'def-2', modelId: 'model-openai', estimatedCost: 40 },
      ],
      vignettes: [
        { definitionId: 'def-1', existingBatchCount: 2 },
        { definitionId: 'def-2', existingBatchCount: 5 },
      ],
      targetBatchCount: 5,
    });

    expect(estimates).toHaveLength(2);
    // cellEstimates are per-batch costs (backend uses samplesPerScenario=1).
    // def-1: existing=2, target=5, remaining=3 → Anthropic: 50*3=150, OpenAI: 100*3=300
    // def-2: existing=5, target=5, remaining=0 → OpenAI: 40*0=0
    expect(estimates[0]).toMatchObject({
      providerDisplayName: 'Anthropic',
      expectedSpendUsd: 150,
      budgetBalanceUsd: 50,
      budgetReady: false,
    });
    expect(estimates[1]).toMatchObject({
      providerDisplayName: 'OpenAI',
      expectedSpendUsd: 300,
      budgetBalanceUsd: 100,
      budgetReady: false,
    });
  });
});
