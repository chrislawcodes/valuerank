import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunFindMany = vi.hoisted(() => vi.fn());
const mockDetectOrphanTranscript = vi.hoisted(() => vi.fn());
const mockDetectPairAsymmetry = vi.hoisted(() => vi.fn());
const mockDetectModelTranscriptShortfall = vi.hoisted(() => vi.fn());
const mockDetectStrandedTranscript = vi.hoisted(() => vi.fn());
const mockDetectSummarizingStall = vi.hoisted(() => vi.fn());
const mockDetectScheduledCountMismatch = vi.hoisted(() => vi.fn());
const mockDetectInvalidResponseFailures = vi.hoisted(() => vi.fn());
const mockSyncAnomalies = vi.hoisted(() => vi.fn());

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findMany: mockRunFindMany,
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

vi.mock('../../../src/services/run/scheduler.js', () => ({
  getReconcileWindowDays: vi.fn(() => 30),
}));

vi.mock('../../../src/services/run/anomaly-detection.js', () => ({
  detectOrphanTranscript: mockDetectOrphanTranscript,
  detectPairAsymmetry: mockDetectPairAsymmetry,
  detectModelTranscriptShortfall: mockDetectModelTranscriptShortfall,
  detectStrandedTranscript: mockDetectStrandedTranscript,
  detectSummarizingStall: mockDetectSummarizingStall,
  detectScheduledCountMismatch: mockDetectScheduledCountMismatch,
  detectInvalidResponseFailures: mockDetectInvalidResponseFailures,
}));

vi.mock('../../../src/services/run/anomaly-persistence.js', () => ({
  syncAnomalies: mockSyncAnomalies,
}));

import { createRunStateAuditHandler } from '../../../src/queue/handlers/run-state-audit.js';

describe('createRunStateAuditHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunFindMany.mockResolvedValue([
      {
        id: 'run-1',
        status: 'COMPLETED',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: {},
        progress: { total: 1 },
        deletedAt: null,
      },
    ]);
    mockDetectOrphanTranscript.mockResolvedValue(null);
    mockDetectPairAsymmetry.mockResolvedValue(null);
    mockDetectModelTranscriptShortfall.mockResolvedValue([]);
    mockDetectStrandedTranscript.mockResolvedValue(null);
    mockDetectSummarizingStall.mockReturnValue(null);
    mockDetectScheduledCountMismatch.mockResolvedValue({ draft: null, canonicalTotal: 1 });
    mockDetectInvalidResponseFailures.mockResolvedValue([]);
    mockSyncAnomalies.mockResolvedValue(undefined);
  });

  it('persists completed-run audit anomalies with the audit source', async () => {
    mockDetectPairAsymmetry.mockResolvedValueOnce({
      type: 'PAIR_ASYMMETRY',
      subject: 'group-1',
      details: { runId: 'run-1' },
    });
    mockDetectModelTranscriptShortfall.mockResolvedValueOnce([
      {
        type: 'MODEL_TRANSCRIPT_SHORTFALL',
        subject: 'm1',
        details: { runId: 'run-1' },
      },
    ]);
    mockDetectScheduledCountMismatch.mockResolvedValueOnce({
      draft: {
        type: 'SCHEDULED_COUNT_MISMATCH',
        subject: '',
        details: { runId: 'run-1' },
      },
      canonicalTotal: 12,
    });

    const handler = createRunStateAuditHandler();
    await handler([{ id: 'job-1', data: {} } as never]);

    expect(mockDetectStrandedTranscript).toHaveBeenCalledWith('run-1');
    expect(mockDetectSummarizingStall).toHaveBeenCalledTimes(1);
    expect(mockDetectScheduledCountMismatch).toHaveBeenCalledTimes(1);
    expect(mockDetectInvalidResponseFailures).toHaveBeenCalledWith('run-1', 'audit');
    expect(mockSyncAnomalies).toHaveBeenCalledWith(
      'run-1',
      'PAIR_ASYMMETRY',
      [
        expect.objectContaining({
          type: 'PAIR_ASYMMETRY',
          subject: 'group-1',
        }),
      ],
      'audit'
    );
    expect(mockSyncAnomalies).toHaveBeenCalledWith(
      'run-1',
      'MODEL_TRANSCRIPT_SHORTFALL',
      [
        expect.objectContaining({
          type: 'MODEL_TRANSCRIPT_SHORTFALL',
          subject: 'm1',
        }),
      ],
      'audit'
    );
    expect(mockSyncAnomalies).toHaveBeenCalledWith(
      'run-1',
      'SCHEDULED_COUNT_MISMATCH',
      [
        expect.objectContaining({
          type: 'SCHEDULED_COUNT_MISMATCH',
        }),
      ],
      'audit'
    );
    expect(mockSyncAnomalies).toHaveBeenCalledWith(
      'run-1',
      'INVALID_RESPONSE_FAILURE',
      [],
      'audit'
    );
  });

  it('skips terminal-only detectors on running runs', async () => {
    mockRunFindMany.mockResolvedValueOnce([
      {
        id: 'run-1',
        status: 'RUNNING',
        updatedAt: new Date('2026-04-23T00:00:00.000Z'),
        config: {},
        progress: { total: 1 },
        deletedAt: null,
      },
    ]);

    const handler = createRunStateAuditHandler();
    await handler([{ id: 'job-1', data: {} } as never]);

    expect(mockDetectStrandedTranscript).not.toHaveBeenCalled();
    expect(mockDetectSummarizingStall).not.toHaveBeenCalled();
    expect(mockDetectScheduledCountMismatch).not.toHaveBeenCalled();
    expect(mockSyncAnomalies).toHaveBeenCalledWith(
      'run-1',
      'ORPHAN_TRANSCRIPT',
      [],
      'audit'
    );
  });
});
