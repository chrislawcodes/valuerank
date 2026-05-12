import { beforeEach, describe, expect, it, vi } from 'vitest';

const startRunMock = vi.hoisted(() => vi.fn());
const getBossMock = vi.hoisted(() => vi.fn());
const isBossRunningMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../src/services/run/index.js', () => ({
  startRun: startRunMock,
}));

vi.mock('../../../../../src/queue/boss.js', () => ({
  getBoss: getBossMock,
  isBossRunning: isBossRunningMock,
}));

import {
  executeLaunchRuns,
  waitForProbeQueueCapacity,
  BACKPRESSURE_POLL_MS,
  BACKPRESSURE_PROBE_THRESHOLD,
  BACKPRESSURE_MAX_WAIT_MS,
} from '../../../../../src/graphql/mutations/domain/launch/execute-runs.js';
import type { LaunchSlot } from '../../../../../src/graphql/mutations/domain/launch/types.js';

function makeSlots(count: number): LaunchSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    definition: {
      id: `def-${i}`,
      name: `def-${i}`,
      parentId: null,
      version: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      content: {},
    } as unknown as LaunchSlot['definition'],
  }));
}

const baseParams = {
  selectedModels: ['model-a'],
  samplePercentage: 100,
  samplesPerScenario: 1,
  temperature: null,
  scopeCategory: 'EVALUATION' as const,
  userId: 'user-1',
  domainId: 'domain-1',
};

describe('executeLaunchRuns backpressure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isBossRunningMock.mockReturnValue(false);
    startRunMock.mockImplementation(async ({ definitionId }) => ({
      run: {
        id: `run-${definitionId}`,
        status: 'RUNNING',
        definitionId,
        experimentId: null,
        config: {},
        progress: { total: 1, completed: 0, failed: 0 },
        createdAt: new Date(0),
      },
      jobCount: 1,
      estimatedCosts: { totalUsd: 0 },
    }));
  });

  it('checks backpressure before the first batch', async () => {
    let getQueuesCalls = 0;
    isBossRunningMock.mockReturnValue(true);
    getBossMock.mockReturnValue({
      getQueues: vi.fn(async () => {
        getQueuesCalls += 1;
        return [{ name: 'probe_openai', activeCount: 1, queuedCount: 2 }];
      }),
    });

    const launchSlots = makeSlots(3);
    const logError = vi.fn();
    const result = await executeLaunchRuns({
      ...baseParams,
      launchSlots,
      log: { error: logError },
    });

    expect(getQueuesCalls).toBeGreaterThanOrEqual(1);
    expect(result.startedRuns).toBe(3);
    expect(result.failedDefinitions).toBe(0);
  });

  it('aborts remaining slots and counts them as failed when backpressure times out', async () => {
    vi.useFakeTimers();
    try {
      isBossRunningMock.mockReturnValue(true);
      getBossMock.mockReturnValue({
        getQueues: vi.fn(async () => [
          { name: 'probe_openai', activeCount: 5_000, queuedCount: 0 },
        ]),
      });

      const launchSlots = makeSlots(50);
      const logError = vi.fn();
      const pending = executeLaunchRuns({
        ...baseParams,
        launchSlots,
        log: { error: logError },
      });

      await vi.runAllTimersAsync();
      const result = await pending;

      expect(startRunMock).not.toHaveBeenCalled();
      expect(result.startedRuns).toBe(0);
      expect(result.failedDefinitions).toBe(50);
      expect(logError).toHaveBeenCalledTimes(50);
      expect(logError.mock.calls[0]?.[0]).toMatchObject({
        error: 'probe queue backpressure timeout',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips backpressure when boss is not running', async () => {
    isBossRunningMock.mockReturnValue(false);

    const launchSlots = makeSlots(2);
    const result = await executeLaunchRuns({
      ...baseParams,
      launchSlots,
      log: { error: vi.fn() },
    });

    expect(getBossMock).not.toHaveBeenCalled();
    expect(result.startedRuns).toBe(2);
  });
});

describe('waitForProbeQueueCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok=true with inFlight=0 when boss is not running', async () => {
    isBossRunningMock.mockReturnValue(false);
    const result = await waitForProbeQueueCapacity();
    expect(result).toEqual({ ok: true, inFlight: 0 });
  });

  it('returns ok=true when current depth is below threshold', async () => {
    isBossRunningMock.mockReturnValue(true);
    getBossMock.mockReturnValue({
      getQueues: vi.fn(async () => [
        { name: 'probe_openai', activeCount: 10, queuedCount: 5 },
        { name: 'probe_dead_letter', activeCount: 9_000, queuedCount: 9_000 },
      ]),
    });

    const result = await waitForProbeQueueCapacity();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inFlight).toBe(15);
    }
  });

  it('exports tunable constants with sane defaults', () => {
    expect(BACKPRESSURE_PROBE_THRESHOLD).toBeGreaterThan(0);
    expect(BACKPRESSURE_POLL_MS).toBeGreaterThan(0);
    expect(BACKPRESSURE_MAX_WAIT_MS).toBeGreaterThan(0);
  });
});
