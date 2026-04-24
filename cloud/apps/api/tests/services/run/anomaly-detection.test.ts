import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunFindMany = vi.fn();
const mockRunScenarioSelectionCount = vi.fn();
const mockProbeResultCount = vi.fn();
const mockProbeResultGroupBy = vi.fn();
const mockTranscriptFindMany = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findMany: mockRunFindMany,
    },
    runScenarioSelection: {
      count: mockRunScenarioSelectionCount,
    },
    probeResult: {
      count: mockProbeResultCount,
      groupBy: mockProbeResultGroupBy,
    },
    transcript: {
      findMany: mockTranscriptFindMany,
    },
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  detectModelTranscriptShortfall,
  detectOrphanTranscript,
  detectPairAsymmetry,
  detectScheduledCountMismatch,
  detectStrandedTranscript,
  detectSummarizingStall,
} from '../../../src/services/run/anomaly-detection.js';

describe('run anomaly detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects stranded transcripts and ignores runs with none', async () => {
    mockTranscriptFindMany.mockResolvedValueOnce([{ id: 't-1' }]).mockResolvedValueOnce([]);

    await expect(detectStrandedTranscript('run-1')).resolves.toEqual({
      type: 'STRANDED_TRANSCRIPT',
      subject: '',
      details: { transcriptIds: ['t-1'] },
    });
    await expect(detectStrandedTranscript('run-2')).resolves.toBeNull();
  });

  it('detects orphan transcripts only when rows exist', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      {
        id: 't-1',
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        sampleIndex: 0,
        createdAt: new Date('2026-04-23T00:00:00.000Z'),
        durationMs: 10,
        tokenCount: 20,
        content: {},
      },
    ]).mockResolvedValueOnce([]);

    await expect(detectOrphanTranscript('run-1')).resolves.toEqual({
      type: 'ORPHAN_TRANSCRIPT',
      subject: '',
      details: { transcriptIds: ['t-1'] },
    });
    await expect(detectOrphanTranscript('run-2')).resolves.toBeNull();
  });

  it('detects pair asymmetry when sibling success rates diverge enough', async () => {
    mockRunFindMany.mockResolvedValue([
      { id: 'run-1', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
      { id: 'run-2', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
    ]);
    mockRunScenarioSelectionCount.mockResolvedValue(1);
    mockProbeResultCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(9);

    await expect(
      detectPairAsymmetry({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 },
        progress: { total: 10 },
        deletedAt: null,
      })
    ).resolves.toMatchObject({
      type: 'PAIR_ASYMMETRY',
      subject: 'group-1',
    });

    mockRunFindMany.mockResolvedValue([
      { id: 'run-1', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
      { id: 'run-2', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
    ]);
    mockProbeResultCount
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(9);

    await expect(
      detectPairAsymmetry({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 },
        progress: { total: 10 },
        deletedAt: null,
      })
    ).resolves.toBeNull();
  });

  it('detects summarizing stalls only after the threshold', async () => {
    await expect(
      detectSummarizingStall({
        id: 'run-1',
        status: 'SUMMARIZING',
        updatedAt: new Date(Date.now() - 31 * 60 * 1000),
        config: {},
        progress: { total: 1 },
        deletedAt: null,
      })
    ).resolves.toMatchObject({ type: 'SUMMARIZING_STALL', subject: '' });

    await expect(
      detectSummarizingStall({
        id: 'run-1',
        status: 'RUNNING',
        updatedAt: new Date(Date.now() - 31 * 60 * 1000),
        config: {},
        progress: { total: 1 },
        deletedAt: null,
      })
    ).resolves.toBeNull();
  });

  it('detects model transcript shortfalls using derived success rates', async () => {
    mockRunScenarioSelectionCount.mockResolvedValue(5);
    mockProbeResultGroupBy.mockResolvedValue([
      { modelId: 'm1', _count: { _all: 2 } },
      { modelId: 'm2', _count: { _all: 9 } },
    ]);

    await expect(
      detectModelTranscriptShortfall({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { models: ['m1', 'm2'], samplesPerScenario: 2 },
        progress: { total: 20 },
        deletedAt: null,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'MODEL_TRANSCRIPT_SHORTFALL',
        subject: 'm1',
      }),
    ]);

    mockRunScenarioSelectionCount.mockResolvedValue(5);
    mockProbeResultGroupBy.mockResolvedValue([
      { modelId: 'm1', _count: { _all: 8 } },
      { modelId: 'm2', _count: { _all: 9 } },
    ]);

    await expect(
      detectModelTranscriptShortfall({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { models: ['m1', 'm2'], samplesPerScenario: 2 },
        progress: { total: 20 },
        deletedAt: null,
      })
    ).resolves.toEqual([]);
  });

  it('detects scheduled total mismatches and returns null when canonical totals match', async () => {
    mockRunScenarioSelectionCount.mockResolvedValue(4);

    await expect(
      detectScheduledCountMismatch({
        id: 'run-1',
        status: 'RUNNING',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { models: ['m1', 'm2'], samplesPerScenario: 2 },
        progress: { total: 6 },
        deletedAt: null,
      })
    ).resolves.toMatchObject({
      canonicalTotal: 16,
      draft: expect.objectContaining({
        type: 'SCHEDULED_COUNT_MISMATCH',
        subject: '',
      }),
    });

    await expect(
      detectScheduledCountMismatch({
        id: 'run-1',
        status: 'RUNNING',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { models: ['m1', 'm2'], samplesPerScenario: 2 },
        progress: { total: 16 },
        deletedAt: null,
      })
    ).resolves.toEqual({
      draft: null,
      canonicalTotal: 16,
    });
  });
});
