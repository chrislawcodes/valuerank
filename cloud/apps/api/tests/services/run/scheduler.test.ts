import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbRunFindFirst = vi.hoisted(() => vi.fn());
const mockDbRunFindMany = vi.hoisted(() => vi.fn());
const mockDbTranscriptFindFirst = vi.hoisted(() => vi.fn());
const mockDbQueryRaw = vi.hoisted(() => vi.fn());
const mockBossSchedule = vi.hoisted(() => vi.fn());
const mockBossUnschedule = vi.hoisted(() => vi.fn());
const mockLogDebug = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findFirst: mockDbRunFindFirst,
      findMany: mockDbRunFindMany,
    },
    transcript: {
      findFirst: mockDbTranscriptFindFirst,
    },
    $queryRaw: mockDbQueryRaw,
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

vi.mock('../../../src/services/run/recovery.js', () => ({
  recoverOrphanedRuns: vi.fn(async () => ({ detected: [], recovered: [], errors: [] })),
  detectAndRecoverStuckJobs: vi.fn(async () => ({ recovered: 0, errors: 0 })),
  RECOVERY_INTERVAL_MS: 1000,
  runStartupRecovery: vi.fn(async () => ({ detected: [], recovered: [], errors: [] })),
}));

vi.mock('../../../src/services/run/stall-detection.js', () => ({
  detectAndUpdateStalledRuns: vi.fn(async () => ({ totalStalled: 0 })),
}));

vi.mock('../../../src/services/run/start-queue.js', () => ({
  PROBE_QUEUE_DEPTH_PER_PROVIDER: 100,
}));

vi.mock('../../../src/queue/handlers/top-up-probes.js', () => ({
  enqueueTopUpProbesSingleton: vi.fn(async () => undefined),
}));

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn(async () => undefined),
    schedule: mockBossSchedule,
    unschedule: mockBossUnschedule,
  })),
}));

vi.mock('../../../src/queue/types.js', () => ({
  DEFAULT_JOB_OPTIONS: {
    run_state_reconcile: {},
    run_state_audit: {},
    summarize_transcript: {},
  },
}));

vi.mock('../../../src/services/parallelism/index.js', () => ({
  getQueueNameForModel: vi.fn(async (modelId: string) => `queue-${modelId}`),
}));

async function loadScheduler(): Promise<typeof import('../../../src/services/run/scheduler.js')> {
  vi.resetModules();
  return import('../../../src/services/run/scheduler.js');
}

describe('getReconcileWindowDays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RUN_RECONCILE_WINDOW_DAYS;
    mockDbRunFindFirst.mockResolvedValue(null);
    mockDbRunFindMany.mockResolvedValue([]);
    mockDbTranscriptFindFirst.mockResolvedValue(null);
    mockDbQueryRaw.mockResolvedValue([]);
    mockBossSchedule.mockResolvedValue(undefined);
    mockBossUnschedule.mockResolvedValue(undefined);
  });

  it('returns the configured value when the env var is valid', async () => {
    process.env.RUN_RECONCILE_WINDOW_DAYS = '60';

    const { getReconcileWindowDays } = await loadScheduler();

    expect(getReconcileWindowDays()).toBe(60);
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it('returns the default when the env var is unset', async () => {
    const { getReconcileWindowDays } = await loadScheduler();

    expect(getReconcileWindowDays()).toBe(30);
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it('registers the daily audit and janitor schedules on startup', async () => {
    const { startRecoveryScheduler } = await loadScheduler();

    await startRecoveryScheduler();

    expect(mockBossUnschedule).toHaveBeenCalledTimes(2);
    expect(mockBossUnschedule).toHaveBeenCalledWith('analysis_result_janitor');
    expect(mockBossUnschedule).toHaveBeenCalledWith('run_state_audit');
    expect(mockBossSchedule).toHaveBeenCalledTimes(2);
    expect(mockBossSchedule).toHaveBeenCalledWith('run_state_audit', '0 9 * * *', {});
    expect(mockBossSchedule).toHaveBeenCalledWith('analysis_result_janitor', '0 10 * * *', {});
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'run_state_audit',
        cron: '0 9 * * *',
      }),
      'Registered run_state_audit schedule'
    );
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'analysis_result_janitor',
        cron: '0 10 * * *',
      }),
      'Registered analysis_result_janitor schedule'
    );
  });

  it('falls back to the default and warns when the env var is invalid', async () => {
    process.env.RUN_RECONCILE_WINDOW_DAYS = 'abc';

    const { getReconcileWindowDays } = await loadScheduler();

    expect(getReconcileWindowDays()).toBe(30);
    expect(getReconcileWindowDays()).toBe(30);
    expect(mockLogWarn).toHaveBeenCalledTimes(1);
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        rawValue: 'abc',
        fallbackDays: 30,
      }),
      'Invalid RUN_RECONCILE_WINDOW_DAYS, falling back to default'
    );
  });

  it('rejects negative values, falls back to the default, and warns once', async () => {
    process.env.RUN_RECONCILE_WINDOW_DAYS = '-5';

    const { getReconcileWindowDays } = await loadScheduler();

    expect(getReconcileWindowDays()).toBe(30);
    expect(mockLogWarn).toHaveBeenCalledTimes(1);
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        rawValue: '-5',
        fallbackDays: 30,
      }),
      'Invalid RUN_RECONCILE_WINDOW_DAYS, falling back to default'
    );
  });
});
