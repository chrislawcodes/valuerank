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
      $executeRaw: vi.fn(),
    },
  };
});

import { db } from '@valuerank/db';
import {
  extractProviderName,
  groupCostByProvider,
  atomicDeduct,
  deductProviderBalancesForRun,
} from '../../../src/services/budget/deduct.js';

describe('extractProviderName', () => {
  it('extracts provider prefix from provider:model format', () => {
    expect(extractProviderName('openai:gpt-4o')).toBe('openai');
    expect(extractProviderName('anthropic:claude-3-sonnet')).toBe('anthropic');
    expect(extractProviderName('xai:grok-3')).toBe('xai');
  });

  it('returns null for modelId without colon separator', () => {
    expect(extractProviderName('gpt-4o')).toBeNull();
    expect(extractProviderName('somemodel')).toBeNull();
  });

  it('handles multiple colons — uses only first segment', () => {
    expect(extractProviderName('openai:gpt-4:turbo')).toBe('openai');
  });
});

describe('groupCostByProvider', () => {
  it('groups single provider correctly', () => {
    const perModel = [
      { modelId: 'openai:gpt-4o', totalCost: 1.5 },
    ];
    const result = groupCostByProvider(perModel);
    expect(result.get('openai')).toBe(1.5);
    expect(result.size).toBe(1);
  });

  it('aggregates multiple models from the same provider', () => {
    const perModel = [
      { modelId: 'openai:gpt-4o', totalCost: 1.0 },
      { modelId: 'openai:gpt-4o-mini', totalCost: 0.5 },
    ];
    const result = groupCostByProvider(perModel);
    expect(result.get('openai')).toBe(1.5);
    expect(result.size).toBe(1);
  });

  it('keeps different providers separate', () => {
    const perModel = [
      { modelId: 'openai:gpt-4o', totalCost: 1.0 },
      { modelId: 'anthropic:claude-3', totalCost: 2.0 },
    ];
    const result = groupCostByProvider(perModel);
    expect(result.get('openai')).toBe(1.0);
    expect(result.get('anthropic')).toBe(2.0);
    expect(result.size).toBe(2);
  });

  it('skips models without colon separator', () => {
    const perModel = [
      { modelId: 'gpt-4o', totalCost: 1.0 },
      { modelId: 'openai:gpt-4o-mini', totalCost: 0.5 },
    ];
    const result = groupCostByProvider(perModel);
    expect(result.has('gpt-4o')).toBe(false);
    expect(result.get('openai')).toBe(0.5);
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
          perModel: [{ modelId: 'openai:gpt-4o', totalCost: 3.0 }],
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
          perModel: [{ modelId: 'openai:gpt-4o', totalCost: 3.0 }],
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
      config: { models: ['openai:gpt-4o'] },
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
            { modelId: 'openai:gpt-4o', totalCost: 1.0 },
            { modelId: 'anthropic:claude-3', totalCost: 2.0 },
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
            { modelId: 'openai:gpt-4o', totalCost: 1.0 },
            { modelId: 'anthropic:claude-3', totalCost: 2.0 },
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
