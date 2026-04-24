import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunFindUnique = vi.hoisted(() => vi.fn());
const mockTranscriptFindMany = vi.hoisted(() => vi.fn());
const mockRunAnomalyFindMany = vi.hoisted(() => vi.fn());
const mockBossSend = vi.hoisted(() => vi.fn());
const mockMaybeAdvanceRunStatus = vi.hoisted(() => vi.fn());
const mockDetectStrandedTranscript = vi.hoisted(() => vi.fn());
const mockDetectPairAsymmetry = vi.hoisted(() => vi.fn());
const mockDetectModelTranscriptShortfall = vi.hoisted(() => vi.fn());
const mockDetectScheduledCountMismatch = vi.hoisted(() => vi.fn());
const mockDetectSummarizingStall = vi.hoisted(() => vi.fn());
const mockFindOrphanTranscripts = vi.hoisted(() => vi.fn());
const mockPersistAnomalyDrafts = vi.hoisted(() => vi.fn());
const mockResolveAnomaly = vi.hoisted(() => vi.fn());
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
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
}));

vi.mock('../../../src/services/run/anomaly-persistence.js', () => ({
  persistAnomalyDrafts: mockPersistAnomalyDrafts,
  resolveAnomaly: mockResolveAnomaly,
  repairScheduledCount: mockRepairScheduledCount,
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
    mockDetectSummarizingStall.mockResolvedValue(null);
    mockFindOrphanTranscripts.mockResolvedValue([]);
    mockMaybeAdvanceRunStatus.mockResolvedValue({ enteredSummarizing: false, completed: false });
    mockRecordProbeSuccess.mockResolvedValue(undefined);
    mockPersistAnomalyDrafts.mockResolvedValue(undefined);
    mockResolveAnomaly.mockResolvedValue(undefined);
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
    expect(mockMaybeAdvanceRunStatus).not.toHaveBeenCalled();
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
