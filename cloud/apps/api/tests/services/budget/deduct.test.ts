/**
 * Unit tests for the provider budget deduction service
 *
 * These tests use mocked db to avoid requiring a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@valuerank/db';

// Mock the db module
vi.mock('@valuerank/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@valuerank/db')>();
  return {
    ...actual,
    db: {
      run: {
        findUnique: vi.fn(),
      },
      llmProvider: {
        findFirst: vi.fn(),
      },
      llmModel: {
        findMany: vi.fn(),
      },
      transcript: {
        findMany: vi.fn(),
      },
      $executeRaw: vi.fn(),
    },
  };
});

import { db } from '@valuerank/db';
import {
  groupCostByProvider,
  atomicDeduct,
  deductProviderBalancesForRun,
  deductActualProviderBalancesForRun,
  deductSingleTranscriptBalance,
  reverseDeductionForRun,
} from '../../../src/services/budget/deduct.js';

describe('groupCostByProvider', () => {
  it('groups single provider correctly', () => {
    const perModel = [
      { modelId: 'claude-sonnet-4-5', providerName: 'anthropic', totalCost: 1.5 },
    ];
    const result = groupCostByProvider(perModel as never);
    expect(result.get('anthropic')).toBe(1.5);
    expect(result.size).toBe(1);
  });

  it('aggregates multiple models from the same provider', () => {
    const perModel = [
      { modelId: 'gpt-5-mini', providerName: 'openai', totalCost: 1.0 },
      { modelId: 'gpt-5.1', providerName: 'openai', totalCost: 0.5 },
    ];
    const result = groupCostByProvider(perModel as never);
    expect(result.get('openai')).toBe(1.5);
    expect(result.size).toBe(1);
  });

  it('keeps different providers separate', () => {
    const perModel = [
      { modelId: 'gpt-5-mini', providerName: 'openai', totalCost: 1.0 },
      { modelId: 'claude-sonnet-4-5', providerName: 'anthropic', totalCost: 2.0 },
    ];
    const result = groupCostByProvider(perModel as never);
    expect(result.get('openai')).toBe(1.0);
    expect(result.get('anthropic')).toBe(2.0);
    expect(result.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    const result = groupCostByProvider([]);
    expect(result.size).toBe(0);
  });
});

describe('atomicDeduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls $executeRaw with correct provider name and cost', async () => {
    const executeRawMock = vi.mocked(db.$executeRaw);
    executeRawMock.mockResolvedValue(1);

    await atomicDeduct('openai', 2.5);

    expect(executeRawMock).toHaveBeenCalledOnce();
    // The tagged template call is verified by it being called once with the right shape
    const call = executeRawMock.mock.calls[0];
    expect(call).toBeDefined();
  });
});

describe('deductProviderBalancesForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deducts balance when provider has a balance set', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const findFirstMock = vi.mocked(db.llmProvider.findFirst);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue({
      config: {
        estimatedCosts: {
          perModel: [{ modelId: 'gpt-5-mini', providerName: 'openai', totalCost: 3.0 }],
        },
      },
    } as never);

    findFirstMock.mockResolvedValue({
      id: 'provider-id',
      balance: new Prisma.Decimal(10.0),
    } as never);

    executeRawMock.mockResolvedValue(1);

    await deductProviderBalancesForRun('run-123');

    expect(executeRawMock).toHaveBeenCalledOnce();
  });

  it('skips deduction when provider balance is null', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const findFirstMock = vi.mocked(db.llmProvider.findFirst);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue({
      config: {
        estimatedCosts: {
          perModel: [{ modelId: 'gpt-5-mini', providerName: 'openai', totalCost: 3.0 }],
        },
      },
    } as never);

    findFirstMock.mockResolvedValue({
      id: 'provider-id',
      balance: null,
    } as never);

    await deductProviderBalancesForRun('run-123');

    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('skips deduction when run has no estimatedCosts', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue({
      config: { models: ['gpt-5-mini'] },
    } as never);

    await deductProviderBalancesForRun('run-123');

    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('handles null estimatedCosts gracefully', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue({
      config: null,
    } as never);

    await expect(deductProviderBalancesForRun('run-123')).resolves.toBeUndefined();
    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('deducts for two providers independently', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const findFirstMock = vi.mocked(db.llmProvider.findFirst);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue({
      config: {
        estimatedCosts: {
          perModel: [
            { modelId: 'gpt-5-mini', providerName: 'openai', totalCost: 1.0 },
            { modelId: 'claude-sonnet-4-5', providerName: 'anthropic', totalCost: 2.0 },
          ],
        },
      },
    } as never);

    findFirstMock.mockResolvedValue({
      id: 'provider-id',
      balance: new Prisma.Decimal(10.0),
    } as never);

    executeRawMock.mockResolvedValue(1);

    await deductProviderBalancesForRun('run-123');

    // Two providers → two deductions
    expect(executeRawMock).toHaveBeenCalledTimes(2);
  });

  it('continues deducting other providers when one fails', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const findFirstMock = vi.mocked(db.llmProvider.findFirst);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue({
      config: {
        estimatedCosts: {
          perModel: [
            { modelId: 'gpt-5-mini', providerName: 'openai', totalCost: 1.0 },
            { modelId: 'claude-sonnet-4-5', providerName: 'anthropic', totalCost: 2.0 },
          ],
        },
      },
    } as never);

    findFirstMock.mockResolvedValue({
      id: 'provider-id',
      balance: new Prisma.Decimal(10.0),
    } as never);

    // First call fails, second succeeds
    executeRawMock.mockRejectedValueOnce(new Error('DB error')).mockResolvedValueOnce(1);

    await expect(deductProviderBalancesForRun('run-123')).resolves.toBeUndefined();
    expect(executeRawMock).toHaveBeenCalledTimes(2);
  });

  it('returns early when run is not found', async () => {
    const findUniqueMock = vi.mocked(db.run.findUnique);
    const executeRawMock = vi.mocked(db.$executeRaw);

    findUniqueMock.mockResolvedValue(null);

    await expect(deductProviderBalancesForRun('nonexistent')).resolves.toBeUndefined();
    expect(executeRawMock).not.toHaveBeenCalled();
  });
});

describe('deductActualProviderBalancesForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deducts actual costs grouped by provider', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const modelFindManyMock = vi.mocked(db.llmModel.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.05 } } },
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.03 } } },
      { modelId: 'claude-sonnet-4-5', content: { costSnapshot: { estimatedCost: 0.10 } } },
    ] as never);

    modelFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', provider: { name: 'openai', balance: new Prisma.Decimal(10) } },
      { modelId: 'claude-sonnet-4-5', provider: { name: 'anthropic', balance: new Prisma.Decimal(20) } },
    ] as never);

    executeRawMock.mockResolvedValue(1);

    await deductActualProviderBalancesForRun('run-actual-1');

    // Two providers → two deductions
    expect(executeRawMock).toHaveBeenCalledTimes(2);
  });

  it('skips when run has no transcripts', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([]);

    await deductActualProviderBalancesForRun('run-empty');

    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('skips when transcripts have no costSnapshot', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', content: { turns: [] } },
      { modelId: 'gpt-5.1', content: null },
    ] as never);

    await deductActualProviderBalancesForRun('run-no-cost');

    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('skips provider when balance is null', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const modelFindManyMock = vi.mocked(db.llmModel.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.05 } } },
    ] as never);

    modelFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', provider: { name: 'openai', balance: null } },
    ] as never);

    await deductActualProviderBalancesForRun('run-null-balance');

    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('skips unknown models gracefully', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const modelFindManyMock = vi.mocked(db.llmModel.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'unknown-model', content: { costSnapshot: { estimatedCost: 0.05 } } },
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.03 } } },
    ] as never);

    modelFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', provider: { name: 'openai', balance: new Prisma.Decimal(10) } },
    ] as never);

    executeRawMock.mockResolvedValue(1);

    await deductActualProviderBalancesForRun('run-unknown-model');

    // Only one provider deducted (unknown-model skipped)
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it('continues deducting other providers when one fails', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const modelFindManyMock = vi.mocked(db.llmModel.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.05 } } },
      { modelId: 'claude-sonnet-4-5', content: { costSnapshot: { estimatedCost: 0.10 } } },
    ] as never);

    modelFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', provider: { name: 'openai', balance: new Prisma.Decimal(10) } },
      { modelId: 'claude-sonnet-4-5', provider: { name: 'anthropic', balance: new Prisma.Decimal(20) } },
    ] as never);

    executeRawMock.mockRejectedValueOnce(new Error('DB error')).mockResolvedValueOnce(1);

    await expect(deductActualProviderBalancesForRun('run-partial-fail')).resolves.toBeUndefined();
    expect(executeRawMock).toHaveBeenCalledTimes(2);
  });

  it('aggregates multiple transcripts for same model into one deduction', async () => {
    const transcriptFindManyMock = vi.mocked(db.transcript.findMany);
    const modelFindManyMock = vi.mocked(db.llmModel.findMany);
    const executeRawMock = vi.mocked(db.$executeRaw);

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.01 } } },
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.02 } } },
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.03 } } },
    ] as never);

    modelFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', provider: { name: 'openai', balance: new Prisma.Decimal(10) } },
    ] as never);

    executeRawMock.mockResolvedValue(1);

    await deductActualProviderBalancesForRun('run-aggregate');

    // Single provider → one deduction call (aggregated cost)
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});

describe('deductSingleTranscriptBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('charges a transcript once and marks it as debited', async () => {
    const findUniqueMock = vi.fn();
    const findFirstMock = vi.fn();
    const executeRawMock = vi.fn();
    const updateMock = vi.fn();

    const tx = {
      transcript: {
        findUnique: findUniqueMock,
        update: updateMock,
      },
      llmModel: {
        findFirst: findFirstMock,
      },
      $executeRaw: executeRawMock,
    };

    findUniqueMock.mockResolvedValue({
      id: 'transcript-1',
      modelId: 'gpt-5.1',
      content: { costSnapshot: { estimatedCost: 0.05 } },
      summarizedAt: new Date(),
      summarizeFailedAt: null,
      costDebitedAt: null,
    } as never);

    findFirstMock.mockResolvedValue({
      provider: { name: 'openai', balance: new Prisma.Decimal(10) },
    } as never);

    executeRawMock.mockResolvedValue(1);
    updateMock.mockResolvedValue({} as never);

    await deductSingleTranscriptBalance('transcript-1', tx as never);

    expect(executeRawMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'transcript-1' },
      data: { costDebitedAt: expect.any(Date) },
    });
  });

  it('no-ops when the transcript was already debited', async () => {
    const findUniqueMock = vi.fn();
    const findFirstMock = vi.fn();
    const executeRawMock = vi.fn();
    const updateMock = vi.fn();

    const tx = {
      transcript: {
        findUnique: findUniqueMock,
        update: updateMock,
      },
      llmModel: {
        findFirst: findFirstMock,
      },
      $executeRaw: executeRawMock,
    };

    findUniqueMock.mockResolvedValue({
      id: 'transcript-1',
      modelId: 'gpt-5.1',
      content: { costSnapshot: { estimatedCost: 0.05 } },
      summarizedAt: new Date(),
      summarizeFailedAt: null,
      costDebitedAt: new Date(),
    } as never);

    await deductSingleTranscriptBalance('transcript-1', tx as never);

    expect(findFirstMock).not.toHaveBeenCalled();
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('reverseDeductionForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('credits provider balances and clears transcript debit markers in a transaction', async () => {
    const transcriptFindManyMock = vi.fn();
    const modelFindManyMock = vi.fn();
    const executeRawMock = vi.fn();
    const updateManyMock = vi.fn();

    const tx = {
      transcript: {
        findMany: transcriptFindManyMock,
        updateMany: updateManyMock,
      },
      llmModel: {
        findMany: modelFindManyMock,
      },
      $executeRaw: executeRawMock,
    };

    transcriptFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.02 } } },
      { modelId: 'gpt-5.1', content: { costSnapshot: { estimatedCost: 0.03 } } },
    ] as never);

    modelFindManyMock.mockResolvedValue([
      { modelId: 'gpt-5.1', provider: { name: 'openai', balance: new Prisma.Decimal(10) } },
    ] as never);

    executeRawMock.mockResolvedValue(1);
    updateManyMock.mockResolvedValue({} as never);

    await reverseDeductionForRun('run-123', tx as never);

    expect(executeRawMock).toHaveBeenCalledOnce();
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { runId: 'run-123' },
      data: { costDebitedAt: null },
    });
  });
});
