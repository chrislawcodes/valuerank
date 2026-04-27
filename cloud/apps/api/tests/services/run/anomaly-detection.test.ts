import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunFindMany,
  mockRunScenarioSelectionCount,
  mockProbeResultCount,
  mockProbeResultGroupBy,
  mockTranscriptFindMany,
  mockRunAnomalyFindMany,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockRunFindMany: vi.fn(),
  mockRunScenarioSelectionCount: vi.fn(),
  mockProbeResultCount: vi.fn(),
  mockProbeResultGroupBy: vi.fn(),
  mockTranscriptFindMany: vi.fn(),
  mockRunAnomalyFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

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
    runAnomaly: {
      findMany: mockRunAnomalyFindMany,
    },
    $queryRaw: mockQueryRaw,
  },
  Prisma: {
    sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      strings,
      values: _values,
    }),
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
  detectInvalidResponseFailures,
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

  it('detects invalid response failures from failed probes without transcripts', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      {
        probeResultsId: 'pr-1',
        runId: 'run-1',
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        sampleIndex: 0,
      },
    ]).mockResolvedValueOnce([
      {
        transcriptId: 't-1',
        runId: 'run-1',
        scenarioId: 'scenario-2',
        modelId: 'model-2',
        sampleIndex: 1,
        content: {
          turns: [
            { targetResponse: 'visible response' },
          ],
        },
      },
    ]);

    await expect(
      detectInvalidResponseFailures('run-1')
    ).resolves.toEqual([
      {
        type: 'INVALID_RESPONSE_FAILURE',
        subject: 'run-1:scenario-1:model-1:0',
        details: {
          scenarioId: 'scenario-1',
          modelId: 'model-1',
          sampleIndex: 0,
          transcriptId: null,
          probeResultId: 'pr-1',
          shape: 'forward',
          reprobeAttempts: 0,
        },
      },
    ]);
  });

  it('detects historical invalid response failures from empty transcripts', async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        transcriptId: 't-1',
        runId: 'run-1',
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        sampleIndex: 0,
        content: {
          turns: [
            { targetResponse: '   ' },
            { targetResponse: '' },
          ],
        },
      },
      {
        transcriptId: 't-2',
        runId: 'run-1',
        scenarioId: 'scenario-2',
        modelId: 'model-2',
        sampleIndex: 1,
        content: {
          turns: [
            { targetResponse: 'has response text' },
          ],
        },
      },
    ]);

    await expect(
      detectInvalidResponseFailures('run-1')
    ).resolves.toEqual([
      {
        type: 'INVALID_RESPONSE_FAILURE',
        subject: 'run-1:scenario-1:model-1:0',
        details: {
          scenarioId: 'scenario-1',
          modelId: 'model-1',
          sampleIndex: 0,
          transcriptId: 't-1',
          probeResultId: null,
          shape: 'historical',
          reprobeAttempts: 0,
        },
      },
    ]);
  });

  it('forward-takes-precedence when same slot matches both PATH A and PATH B', async () => {
    // The same slot has BOTH a FAILED probe (PATH A) AND an empty transcript (PATH B).
    // Rare in practice but possible if a stale historical empty transcript predates a
    // fresh FAILED probe at the same slot. Forward should win — historical is skipped.
    mockQueryRaw.mockResolvedValueOnce([
      {
        probeResultsId: 'pr-1',
        runId: 'run-1',
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        sampleIndex: 0,
      },
    ]).mockResolvedValueOnce([
      {
        transcriptId: 't-stale',
        runId: 'run-1',
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        sampleIndex: 0,
        content: {
          turns: [{ targetResponse: '' }],
        },
      },
    ]);

    await expect(
      detectInvalidResponseFailures('run-1')
    ).resolves.toEqual([
      {
        type: 'INVALID_RESPONSE_FAILURE',
        subject: 'run-1:scenario-1:model-1:0',
        details: {
          scenarioId: 'scenario-1',
          modelId: 'model-1',
          sampleIndex: 0,
          transcriptId: null,
          probeResultId: 'pr-1',
          shape: 'forward',
          reprobeAttempts: 0,
        },
      },
    ]);
  });

  it('handles null scenarioId in subject format', async () => {
    // ORPHAN_TRANSCRIPT-style transcripts have scenario_id NULL when the source
    // scenario was deleted. The slot subject must still be unique and parseable.
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        transcriptId: 't-1',
        runId: 'run-1',
        scenarioId: null,
        modelId: 'model-1',
        sampleIndex: 0,
        content: {
          turns: [{ targetResponse: '' }],
        },
      },
    ]);

    await expect(
      detectInvalidResponseFailures('run-1')
    ).resolves.toEqual([
      {
        type: 'INVALID_RESPONSE_FAILURE',
        subject: 'run-1::model-1:0',
        details: {
          scenarioId: null,
          modelId: 'model-1',
          sampleIndex: 0,
          transcriptId: 't-1',
          probeResultId: null,
          shape: 'historical',
          reprobeAttempts: 0,
        },
      },
    ]);
  });

  it('returns identical drafts in default and audit modes (source coexistence is intentional)', async () => {
    // The detector must return the same drafts regardless of mode. Filtering audit
    // drafts inside the detector would be unsafe: syncAnomalies() resolves any open
    // anomaly whose subject is missing from the draft list, so a filtered audit draft
    // would resolve a still-valid audit-source anomaly on the next sweep. The
    // unique constraint (runId, type, subject, source) explicitly allows default+audit
    // coexistence; the UI dedupes by subject when rendering.
    const probeRows = [{
      probeResultsId: 'pr-1',
      runId: 'run-1',
      scenarioId: 'scenario-1',
      modelId: 'model-1',
      sampleIndex: 0,
    }];

    mockQueryRaw.mockResolvedValueOnce(probeRows).mockResolvedValueOnce([]);
    const defaultDrafts = await detectInvalidResponseFailures('run-1', 'default');

    mockQueryRaw.mockResolvedValueOnce(probeRows).mockResolvedValueOnce([]);
    const auditDrafts = await detectInvalidResponseFailures('run-1', 'audit');

    expect(auditDrafts).toEqual(defaultDrafts);
    expect(auditDrafts).toHaveLength(1);
    expect(auditDrafts[0].subject).toBe('run-1:scenario-1:model-1:0');
  });

  it('detects pair asymmetry when sibling success rates diverge enough', async () => {
    // mockRunFindMany is called by detectPairAsymmetry with `id: { not: run.id }`,
    // so it should return only siblings (not self).
    mockRunFindMany.mockResolvedValue([
      { id: 'run-2', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
    ]);
    mockRunScenarioSelectionCount.mockResolvedValue(1);
    // Two candidates (self + 1 sibling). Each calls probeResult.count once.
    // Order in Promise.all: run-1 (self, 3 successes), run-2 (sibling, 9 successes).
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
      { id: 'run-2', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
    ]);
    mockProbeResultCount
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(8);

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

  it('detects any measurable pair asymmetry in audit mode', async () => {
    mockRunFindMany.mockResolvedValue([
      { id: 'run-2', config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 } },
    ]);
    mockRunScenarioSelectionCount.mockResolvedValue(1);
    mockProbeResultCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6);

    await expect(
      detectPairAsymmetry({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 },
        progress: { total: 10 },
        deletedAt: null,
      }, 'audit')
    ).resolves.toMatchObject({
      type: 'PAIR_ASYMMETRY',
      subject: 'group-1',
    });

    mockProbeResultCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5);

    await expect(
      detectPairAsymmetry({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { jobChoiceBatchGroupId: 'group-1', models: ['m1'], samplesPerScenario: 10 },
        progress: { total: 10 },
        deletedAt: null,
      }, 'audit')
    ).resolves.toBeNull();
  });

  it('detects summarizing stalls only after the threshold', () => {
    expect(
      detectSummarizingStall({
        id: 'run-1',
        status: 'SUMMARIZING',
        updatedAt: new Date(Date.now() - 31 * 60 * 1000),
        config: {},
        progress: { total: 1 },
        deletedAt: null,
      })
    ).toMatchObject({ type: 'SUMMARIZING_STALL', subject: '' });

    expect(
      detectSummarizingStall({
        id: 'run-1',
        status: 'RUNNING',
        updatedAt: new Date(Date.now() - 31 * 60 * 1000),
        config: {},
        progress: { total: 1 },
        deletedAt: null,
      })
    ).toBeNull();
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

  it('detects below-median models in audit mode without changing the probe floor', async () => {
    mockRunScenarioSelectionCount.mockResolvedValue(5);
    mockProbeResultGroupBy.mockResolvedValue([
      { modelId: 'm1', _count: { _all: 4 } },
      { modelId: 'm2', _count: { _all: 5 } },
    ]);

    await expect(
      detectModelTranscriptShortfall({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { models: ['m1', 'm2'], samplesPerScenario: 2 },
        progress: { total: 20 },
        deletedAt: null,
      }, 'audit')
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'MODEL_TRANSCRIPT_SHORTFALL',
        subject: 'm1',
      }),
    ]);

    mockRunScenarioSelectionCount.mockResolvedValue(2);
    mockProbeResultGroupBy.mockResolvedValue([
      { modelId: 'm1', _count: { _all: 1 } },
      { modelId: 'm2', _count: { _all: 1 } },
    ]);

    await expect(
      detectModelTranscriptShortfall({
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: { models: ['m1', 'm2'], samplesPerScenario: 1 },
        progress: { total: 4 },
        deletedAt: null,
      }, 'audit')
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
