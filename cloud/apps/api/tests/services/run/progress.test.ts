import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunFindUnique = vi.hoisted(() => vi.fn());
const mockTranscriptFindMany = vi.hoisted(() => vi.fn());
const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockBossSend = vi.hoisted(() => vi.fn());
const mockTriggerBasicAnalysis = vi.hoisted(() => vi.fn(async () => false));
const mockQueueComputeTokenStats = vi.hoisted(() => vi.fn(async () => undefined));
const mockDeductActualProviderBalancesForRun = vi.hoisted(() => vi.fn(async () => undefined));
const mockLogDebug = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

type RunState = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUMMARIZING' | 'COMPLETED';
  progress: { total: number; completed: number; failed: number };
  deletedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};

type TranscriptState = {
  id: string;
  summarizedAt: Date | null;
  summarizeFailedAt: Date | null;
  decisionMetadata: Record<string, unknown> | null;
};

const queuedSingletonJobs = new Map<string, { queueName: string; transcriptId: string }>();
const transitionCounts = {
  toSummarizing: 0,
  toCompleted: 0,
};

let runState: RunState;
let transcriptState: TranscriptState[];

function resetFixture(): void {
  const now = new Date('2026-04-24T10:00:00.000Z');
  runState = {
    id: 'run-1',
    status: 'RUNNING',
    progress: { total: 5, completed: 0, failed: 0 },
    deletedAt: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
  };

  transcriptState = Array.from({ length: 5 }, (_, index) => ({
    id: `transcript-${index + 1}`,
    summarizedAt: null,
    summarizeFailedAt: null,
    decisionMetadata: { summary: true },
  }));

  queuedSingletonJobs.clear();
  transitionCounts.toSummarizing = 0;
  transitionCounts.toCompleted = 0;
}

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findUnique: mockRunFindUnique,
    },
    transcript: {
      findMany: mockTranscriptFindMany,
    },
    $queryRaw: mockQueryRaw,
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
  getBoss: vi.fn(() => ({
    send: mockBossSend,
  })),
  isBossRunning: vi.fn(() => true),
}));

vi.mock('../../../src/services/analysis/index.js', () => ({
  triggerBasicAnalysis: mockTriggerBasicAnalysis,
}));

vi.mock('../../../src/queue/handlers/summarize-persistence.js', () => ({
  queueComputeTokenStats: mockQueueComputeTokenStats,
}));

vi.mock('../../../src/services/budget/deduct.js', () => ({
  deductActualProviderBalancesForRun: mockDeductActualProviderBalancesForRun,
}));

import { maybeAdvanceRunStatus, calculatePercentComplete } from '../../../src/services/run/progress.js';

mockRunFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
  if (where.id !== runState.id) {
    return null;
  }

  return {
    status: runState.status,
    progress: runState.progress,
    deletedAt: runState.deletedAt,
  };
});

mockTranscriptFindMany.mockImplementation(async ({ where }: { where: { runId: string; summarizedAt?: unknown; summarizeFailedAt?: unknown } }) => {
  if (where.runId !== runState.id) {
    return [];
  }

  if (where.summarizedAt === null && where.summarizeFailedAt === null) {
    return transcriptState
      .filter((transcript) => transcript.summarizedAt === null && transcript.summarizeFailedAt === null)
      .map((transcript) => ({ id: transcript.id }));
  }

  if (typeof where.summarizedAt === 'object' && where.summarizedAt !== null && 'not' in where.summarizedAt) {
    return transcriptState
      .filter((transcript) => transcript.summarizedAt !== null && transcript.decisionMetadata !== null)
      .map((transcript) => ({ id: transcript.id }));
  }

  return [];
});

mockQueryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
  const query = strings.join('');

  if (query.includes(`SET "status" = 'SUMMARIZING'`)) {
    if (runState.status === 'RUNNING' || runState.status === 'PAUSED') {
      runState = {
        ...runState,
        status: 'SUMMARIZING',
        updatedAt: new Date(),
      };
      transitionCounts.toSummarizing += 1;
      return [{ id: runState.id }];
    }

    return [];
  }

  if (query.includes(`SET "status" = 'COMPLETED'`) && query.includes(`AND "status" = 'SUMMARIZING'`)) {
    const allSummarized = transcriptState.every(
      (transcript) => transcript.summarizedAt !== null || transcript.summarizeFailedAt !== null
    );

    if (runState.status === 'SUMMARIZING' && allSummarized) {
      runState = {
        ...runState,
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date(),
      };
      transitionCounts.toCompleted += 1;
      return [{ id: runState.id }];
    }

    return [];
  }

  if (query.includes(`SET "status" = 'COMPLETED'`) && query.includes(`COALESCE((progress->>'total')::int, 0) = 0`)) {
    if (runState.status === 'PENDING' && runState.progress.total === 0) {
      runState = {
        ...runState,
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date(),
      };
      transitionCounts.toCompleted += 1;
      return [{ id: runState.id }];
    }
  }

  return [];
});

mockBossSend.mockImplementation(async (queueName: string, data: { transcriptId?: string }, options?: { singletonKey?: string }) => {
  if (options?.singletonKey !== undefined) {
    queuedSingletonJobs.set(options.singletonKey, {
      queueName,
      transcriptId: data.transcriptId ?? '',
    });
  }

  if (queueName === 'summarize_transcript' && typeof data.transcriptId === 'string') {
    const transcript = transcriptState.find((entry) => entry.id === data.transcriptId);
    if (transcript !== undefined && transcript.summarizedAt === null) {
      transcript.summarizedAt = new Date('2026-04-24T10:05:00.000Z');
    }
  }

  return `job-${queueName}-${options?.singletonKey ?? 'no-key'}`;
});

describe('calculatePercentComplete', () => {
  it('calculates progress from completed and failed counts', () => {
    expect(calculatePercentComplete({ total: 10, completed: 5, failed: 0 })).toBe(50);
    expect(calculatePercentComplete({ total: 10, completed: 3, failed: 2 })).toBe(50);
    expect(calculatePercentComplete({ total: 10, completed: 0, failed: 0 })).toBe(0);
  });

  it('returns 100 when total is zero', () => {
    expect(calculatePercentComplete({ total: 0, completed: 0, failed: 0 })).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    expect(calculatePercentComplete({ total: 3, completed: 1, failed: 0 })).toBe(33);
    expect(calculatePercentComplete({ total: 3, completed: 2, failed: 0 })).toBe(67);
  });
});

describe('maybeAdvanceRunStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFixture();
    mockTriggerBasicAnalysis.mockResolvedValue(false);
    mockQueueComputeTokenStats.mockResolvedValue(undefined);
    mockDeductActualProviderBalancesForRun.mockResolvedValue(undefined);
  });

  it('handles 20 concurrent maybeAdvanceRunStatus calls without duplicate summarize-job enqueue', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => maybeAdvanceRunStatus(runState.id))
    );

    expect(transitionCounts.toSummarizing).toBe(1);
    expect(transitionCounts.toCompleted).toBe(1);
    expect(results.filter((result) => result.enteredSummarizing)).toHaveLength(1);
    expect(results.filter((result) => result.completed)).toHaveLength(1);
    expect(mockBossSend).toHaveBeenCalledTimes(5);
    expect(queuedSingletonJobs.size).toBe(5);
    expect([...queuedSingletonJobs.keys()].sort()).toEqual([
      'transcript-1',
      'transcript-2',
      'transcript-3',
      'transcript-4',
      'transcript-5',
    ]);
  });

  it('completes empty (zero-probe) PENDING runs via the empty-run CAS shortcut', async () => {
    // Empty runs are still created with status PENDING and total=0; the
    // empty-run CAS shortcut in maybeAdvanceRunStatus is the path that takes
    // them to COMPLETED. This test guards that path against regression.
    runState = {
      ...runState,
      status: 'PENDING',
      progress: { total: 0, completed: 0, failed: 0 },
    };
    transcriptState = [];

    const result = await maybeAdvanceRunStatus(runState.id);

    expect(result.completed).toBe(true);
    expect(result.enteredSummarizing).toBe(false);
    expect(runState.status).toBe('COMPLETED');
    expect(transitionCounts.toCompleted).toBe(1);
  });

  it('does NOT silently advance a non-empty PENDING run (state is reachable only via creation bug)', async () => {
    // Regression test for the bug fixed by setting status='RUNNING' at run
    // creation time in start.ts. Pre-fix, non-empty runs were created PENDING
    // and PR #745's state machine had no PENDING -> RUNNING gate, so they got
    // stuck. The fix is at creation time (start.ts), not in
    // maybeAdvanceRunStatus, so a run that somehow lands in PENDING with
    // total>0 should NOT be silently advanced here -- recovery/audit/reconcile
    // (now widened to include PENDING) are the safety nets that surface it.
    runState = {
      ...runState,
      status: 'PENDING',
      progress: { total: 5, completed: 5, failed: 0 },
    };
    // All transcripts already summarized — would advance to COMPLETED if a
    // PENDING gate existed. None should.
    transcriptState = transcriptState.map((t) => ({
      ...t,
      summarizedAt: new Date('2026-04-24T10:05:00.000Z'),
    }));

    const result = await maybeAdvanceRunStatus(runState.id);

    expect(result.completed).toBe(false);
    expect(result.enteredSummarizing).toBe(false);
    expect(runState.status).toBe('PENDING');
    expect(transitionCounts.toSummarizing).toBe(0);
    expect(transitionCounts.toCompleted).toBe(0);
  });
});
