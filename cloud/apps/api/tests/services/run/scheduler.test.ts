import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbRunFindFirst = vi.hoisted(() => vi.fn());
const mockDbRunFindMany = vi.hoisted(() => vi.fn());
const mockDbTranscriptFindFirst = vi.hoisted(() => vi.fn());
const mockDbRunAnomalyFindFirst = vi.hoisted(() => vi.fn());
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
    runAnomaly: {
      findFirst: mockDbRunAnomalyFindFirst,
    },
    $queryRaw: mockDbQueryRaw,
  },
  Prisma: {
    // Minimal stand-in for Prisma.sql tagged-template helper. Concatenates
    // the literal segments and pipes interpolated values through; that's
    // enough for our string-assertion tests below.
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      sql: strings.reduce((acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''), ''),
    }),
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

  it('registers the daily audit, janitor, and domain-analysis warming schedules on startup', async () => {
    const { startRecoveryScheduler } = await loadScheduler();

    await startRecoveryScheduler();

    expect(mockBossUnschedule).toHaveBeenCalledTimes(3);
    expect(mockBossUnschedule).toHaveBeenCalledWith('analysis_result_janitor');
    expect(mockBossUnschedule).toHaveBeenCalledWith('run_state_audit');
    expect(mockBossUnschedule).toHaveBeenCalledWith('refresh_domain_analysis_snapshot', 'warm_all_domains');
    expect(mockBossSchedule).toHaveBeenCalledTimes(3);
    expect(mockBossSchedule).toHaveBeenCalledWith('run_state_audit', '0 9 * * *', {});
    expect(mockBossSchedule).toHaveBeenCalledWith('analysis_result_janitor', '0 10 * * *', {});
    expect(mockBossSchedule).toHaveBeenCalledWith(
      'refresh_domain_analysis_snapshot',
      '15 * * * *',
      {
        scope: 'ALL_DOMAINS',
        domainId: 'all-domains',
        signature: null,
        reason: 'scheduled_warm',
      },
      { key: 'warm_all_domains', singletonKey: 'warm_all_domains' },
    );
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
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'refresh_domain_analysis_snapshot',
        cron: '15 * * * *',
        scope: 'ALL_DOMAINS',
      }),
      'Registered domain-analysis warming schedule'
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

describe('hasRecoveryActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RUN_RECONCILE_WINDOW_DAYS;
    mockDbRunFindFirst.mockResolvedValue(null);
    mockDbRunFindMany.mockResolvedValue([]);
    mockDbTranscriptFindFirst.mockResolvedValue(null);
    mockDbRunAnomalyFindFirst.mockResolvedValue(null);
    mockDbQueryRaw.mockResolvedValue([]);
  });

  it('starts the scheduler when there are open default-source anomalies, even with no active runs', async () => {
    // No active runs, no stranded transcripts, no orphan backlog -- but one
    // open default-source anomaly. Without this wake-up condition, the
    // scheduler would stay dormant forever and the stale anomaly would never
    // get re-checked.
    mockDbRunAnomalyFindFirst.mockResolvedValue({ id: 'anomaly-1' });

    const { startRecoveryScheduler } = await loadScheduler();
    await startRecoveryScheduler();

    expect(mockLogInfo).toHaveBeenCalledWith('Recovery scheduler started (active runs detected)');
    expect(mockLogInfo).not.toHaveBeenCalledWith(
      'Recovery scheduler initialized but not running (no active runs)',
    );
  });

  it('stays dormant when nothing -- no active runs, no transcripts, no anomalies', async () => {
    const { startRecoveryScheduler } = await loadScheduler();
    await startRecoveryScheduler();

    expect(mockLogInfo).toHaveBeenCalledWith(
      'Recovery scheduler initialized but not running (no active runs)',
    );
  });
});

describe('enqueueRunStateReconcileJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RUN_RECONCILE_WINDOW_DAYS;
    mockDbQueryRaw.mockResolvedValue([]);
  });

  it('also picks up runs with open default-source anomalies, even when transcripts are clean', async () => {
    const { enqueueRunStateReconcileJobs } = await loadScheduler();

    await enqueueRunStateReconcileJobs();

    // The function builds a single tagged-template query; check the assembled SQL.
    expect(mockDbQueryRaw).toHaveBeenCalledTimes(1);
    const callArgs = mockDbQueryRaw.mock.calls[0]!;
    const stringsArg = callArgs[0] as TemplateStringsArray;
    const sql = stringsArg.join('?');

    // The new clause must reference run_anomalies, filter to unresolved rows,
    // and restrict to source='default'. Without all three, stale anomalies on
    // clean COMPLETED runs would never get a chance to auto-resolve.
    expect(sql).toContain('run_anomalies');
    expect(sql).toContain('resolved_at IS NULL');
    expect(sql).toContain("source = 'default'");
  });
});
