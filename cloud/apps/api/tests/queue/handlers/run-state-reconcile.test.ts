import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunFindUnique = vi.hoisted(() => vi.fn());
const mockTranscriptFindMany = vi.hoisted(() => vi.fn());
const mockRunAnomalyFindMany = vi.hoisted(() => vi.fn());
const mockBossSend = vi.hoisted(() => vi.fn());
const mockLogDebug = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());
const mockMaybeAdvanceRunStatus = vi.hoisted(() => vi.fn());
const mockDetectStrandedTranscript = vi.hoisted(() => vi.fn());
const mockDetectPairAsymmetry = vi.hoisted(() => vi.fn());
const mockDetectModelTranscriptShortfall = vi.hoisted(() => vi.fn());
const mockDetectScheduledCountMismatch = vi.hoisted(() => vi.fn());
const mockDetectInvalidResponseFailures = vi.hoisted(() => vi.fn());
const mockDetectSummarizingStall = vi.hoisted(() => vi.fn());
const mockFindOrphanTranscripts = vi.hoisted(() => vi.fn());
const mockCountOrphanTranscripts = vi.hoisted(() => vi.fn());
const mockSyncAnomalies = vi.hoisted(() => vi.fn());
const mockRepairScheduledCount = vi.hoisted(() => vi.fn());
const mockRecordProbeSuccess = vi.hoisted(() => vi.fn());

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findUnique: mockRunFindUnique,
    },
    transcript: {
      findMany: mockTranscriptFindMany,
    },
    runAnomaly: {
      findMany: mockRunAnomalyFindMany,
    },
  },
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
  }),
}));

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: () => ({
    send: mockBossSend,
  }),
  isBossRunning: vi.fn(() => true),
}));

vi.mock('../../../src/services/run/index.js', () => ({
  maybeAdvanceRunStatus: mockMaybeAdvanceRunStatus,
}));

vi.mock('../../../src/services/run/anomaly-detection.js', () => ({
  detectStrandedTranscript: mockDetectStrandedTranscript,
  detectPairAsymmetry: mockDetectPairAsymmetry,
  detectModelTranscriptShortfall: mockDetectModelTranscriptShortfall,
  detectScheduledCountMismatch: mockDetectScheduledCountMismatch,
  detectSummarizingStall: mockDetectSummarizingStall,
  findOrphanTranscripts: mockFindOrphanTranscripts,
  countOrphanTranscripts: mockCountOrphanTranscripts,
}));

vi.mock('../../../src/services/run/anomaly-persistence.js', () => ({
  syncAnomalies: mockSyncAnomalies,
  repairScheduledCount: mockRepairScheduledCount,
}));

vi.mock('../../../src/services/run/anomaly-invalid-response-detection.js', () => ({
  detectInvalidResponseFailures: mockDetectInvalidResponseFailures,
}));

vi.mock('../../../src/services/probe-result/index.js', () => ({
  recordProbeSuccess: mockRecordProbeSuccess,
}));

import { createRunStateReconcileHandler } from '../../../src/queue/handlers/run-state-reconcile.js';

describe('createRunStateReconcileHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunFindUnique.mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
      config: {},
      progress: { total: 1 },
      deletedAt: null,
    });
    mockTranscriptFindMany.mockResolvedValue([]);
    mockRunAnomalyFindMany.mockResolvedValue([]);
    mockDetectStrandedTranscript.mockResolvedValue(null);
    mockDetectPairAsymmetry.mockResolvedValue(null);
    mockDetectModelTranscriptShortfall.mockResolvedValue([]);
    mockDetectScheduledCountMismatch.mockResolvedValue({
      draft: null,
      canonicalTotal: 1,
    });
    mockDetectInvalidResponseFailures.mockResolvedValue([]);
    mockDetectSummarizingStall.mockResolvedValue(null);
    mockFindOrphanTranscripts.mockResolvedValue([]);
    mockCountOrphanTranscripts.mockResolvedValue(0);
    mockMaybeAdvanceRunStatus.mockResolvedValue({ enteredSummarizing: false, completed: false });
    mockRecordProbeSuccess.mockResolvedValue(undefined);
    mockSyncAnomalies.mockResolvedValue(undefined);
    mockRepairScheduledCount.mockResolvedValue(false);
  });

  it('queues summarize jobs for stranded transcripts on a completed run without advancing status', async () => {
    mockRunFindUnique.mockResolvedValueOnce({
      id: 'run-1',
      status: 'COMPLETED',
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
      config: { models: ['m1'], samplesPerScenario: 1 },
      progress: { total: 1 },
      deletedAt: null,
    });
    mockDetectStrandedTranscript.mockResolvedValueOnce({
      type: 'STRANDED_TRANSCRIPT',
      subject: '',
      details: { transcriptIds: ['t-1', 't-2'] },
    });
    mockTranscriptFindMany.mockResolvedValueOnce([
      { id: 't-1' },
      { id: 't-2' },
    ]);

    const handler = createRunStateReconcileHandler();
    await handler([
      {
        id: 'job-1',
        data: { runId: 'run-1' },
      } as never,
    ]);

    expect(mockBossSend).toHaveBeenCalledTimes(2);
    expect(mockBossSend).toHaveBeenNthCalledWith(
      1,
      'summarize_transcript',
      { runId: 'run-1', transcriptId: 't-1' },
      expect.objectContaining({ singletonKey: 't-1' })
    );
    expect(mockBossSend).toHaveBeenNthCalledWith(
      2,
      'summarize_transcript',
      { runId: 'run-1', transcriptId: 't-2' },
      expect.objectContaining({ singletonKey: 't-2' })
    );
    expect(mockDetectInvalidResponseFailures).toHaveBeenCalledWith('run-1', 'default');
    expect(mockMaybeAdvanceRunStatus).not.toHaveBeenCalled();
  });

  it('marks malformed orphan transcripts as failed and persists the anomaly details', async () => {
    mockRunFindUnique.mockResolvedValueOnce({
      id: 'run-1',
      status: 'COMPLETED',
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
      config: { models: ['m1'], samplesPerScenario: 1 },
      progress: { total: 1 },
      deletedAt: null,
    });
    mockFindOrphanTranscripts.mockResolvedValueOnce([
      {
        id: 't-1',
        scenarioId: 'scenario-1',
        modelId: 'm1',
        sampleIndex: 0,
        createdAt: new Date('2026-04-23T00:00:00.000Z'),
        durationMs: 10,
        tokenCount: 20,
        content: null,
      },
    ]);

    const handler = createRunStateReconcileHandler();
    await handler([
      {
        id: 'job-1',
        data: { runId: 'run-1' },
      } as never,
    ]);

    expect(mockRecordProbeSuccess).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        transcriptId: 't-1',
        reason: 'content-not-object',
      }),
      'Malformed orphan transcript content'
    );
    expect(mockSyncAnomalies).toHaveBeenCalledWith(
      'run-1',
      'ORPHAN_TRANSCRIPT',
      [
        expect.objectContaining({
          type: 'ORPHAN_TRANSCRIPT',
          details: {
            transcriptIds: ['t-1'],
            malformedTranscriptIds: ['t-1'],
          },
        }),
      ],
      'default'
    );
  });

  it('reconstructs orphan transcripts with cost snapshots normally', async () => {
    mockRunFindUnique.mockResolvedValueOnce({
      id: 'run-1',
      status: 'COMPLETED',
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
      config: { models: ['m1'], samplesPerScenario: 1 },
      progress: { total: 1 },
      deletedAt: null,
    });
    mockFindOrphanTranscripts.mockResolvedValueOnce([
      {
        id: 't-1',
        scenarioId: 'scenario-1',
        modelId: 'm1',
        sampleIndex: 0,
        createdAt: new Date('2026-04-23T00:00:00.000Z'),
        durationMs: 10,
        tokenCount: 20,
        content: {
          costSnapshot: {
            inputTokens: 11,
            outputTokens: 12,
          },
        },
      },
    ]);

    const handler = createRunStateReconcileHandler();
    await handler([
      {
        id: 'job-1',
        data: { runId: 'run-1' },
      } as never,
    ]);

    expect(mockRecordProbeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        scenarioId: 'scenario-1',
        modelId: 'm1',
        transcriptId: 't-1',
        inputTokens: 11,
        outputTokens: 12,
      })
    );
    expect(mockLogWarn).not.toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptId: 't-1',
      }),
      'Malformed orphan transcript content'
    );
  });

  it('logs overflow when the orphan backlog exceeds the per-tick cap', async () => {
    mockRunFindUnique.mockResolvedValueOnce({
      id: 'run-1',
      status: 'COMPLETED',
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
      config: { models: ['m1'], samplesPerScenario: 1 },
      progress: { total: 1 },
      deletedAt: null,
    });
    mockFindOrphanTranscripts.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, index) => ({
        id: `t-${index + 1}`,
        scenarioId: `scenario-${index + 1}`,
        modelId: 'm1',
        sampleIndex: 0,
        createdAt: new Date('2026-04-23T00:00:00.000Z'),
        durationMs: 10,
        tokenCount: 20,
        content: {
          costSnapshot: {
            inputTokens: 1,
            outputTokens: 2,
          },
        },
      }))
    );
    mockCountOrphanTranscripts.mockResolvedValueOnce(600);

    const handler = createRunStateReconcileHandler();
    await handler([
      {
        id: 'job-1',
        data: { runId: 'run-1' },
      } as never,
    ]);

    expect(mockRecordProbeSuccess).toHaveBeenCalledTimes(500);
    expect(mockCountOrphanTranscripts).toHaveBeenCalledWith('run-1');
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        total: 600,
        processing: 500,
        overflow: 100,
      }),
      'Orphan backlog exceeds per-tick cap'
    );
  });

  it('does not log overflow when the orphan backlog is exactly at the cap', async () => {
    mockRunFindUnique.mockResolvedValueOnce({
      id: 'run-1',
      status: 'COMPLETED',
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
      config: { models: ['m1'], samplesPerScenario: 1 },
      progress: { total: 1 },
      deletedAt: null,
    });
    mockFindOrphanTranscripts.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, index) => ({
        id: `t-${index + 1}`,
        scenarioId: `scenario-${index + 1}`,
        modelId: 'm1',
        sampleIndex: 0,
        createdAt: new Date('2026-04-23T00:00:00.000Z'),
        durationMs: 10,
        tokenCount: 20,
        content: {
          costSnapshot: {
            inputTokens: 1,
            outputTokens: 2,
          },
        },
      }))
    );
    mockCountOrphanTranscripts.mockResolvedValueOnce(500);

    const handler = createRunStateReconcileHandler();
    await handler([
      {
        id: 'job-1',
        data: { runId: 'run-1' },
      } as never,
    ]);

    expect(mockLogInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        overflow: expect.any(Number),
      }),
      'Orphan backlog exceeds per-tick cap'
    );
  });

  it('advances running runs and repairs scheduled count mismatches', async () => {
    mockDetectScheduledCountMismatch.mockResolvedValueOnce({
      draft: {
        type: 'SCHEDULED_COUNT_MISMATCH',
        subject: '',
        details: { canonicalTotal: 12, currentTotal: 9 },
      },
      canonicalTotal: 12,
    });
    mockRepairScheduledCount.mockResolvedValueOnce(true);

    const handler = createRunStateReconcileHandler();
    await handler([
      {
        id: 'job-2',
        data: { runId: 'run-1' },
      } as never,
    ]);

    expect(mockMaybeAdvanceRunStatus).toHaveBeenCalledOnce();
    expect(mockRepairScheduledCount).toHaveBeenCalledWith('run-1', 12);
  });
});
