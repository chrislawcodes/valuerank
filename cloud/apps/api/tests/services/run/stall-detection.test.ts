/**
 * Unit tests for stall detection service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  run: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  probeResult: {
    groupBy: vi.fn(),
  },
  runScenarioSelection: {
    count: vi.fn(),
  },
  transcript: {
    count: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@valuerank/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@valuerank/db')>();
  return {
    ...actual,
    db: dbMock,
  };
});

vi.mock('@valuerank/shared', () => ({
  createLogger: vi.fn(() => logger),
}));

import { db } from '@valuerank/db';
import {
  STALL_THRESHOLD_MS,
  detectAndUpdateStalledRuns,
  detectProgressStalls,
  detectStalledModels,
  getModelsWithPendingJobs,
  updateRunStalledModels,
} from '../../../src/services/run/stall-detection.js';

describe('stall detection service', () => {
  const now = new Date('2026-03-22T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks a model stalled when pending jobs exist and last success is older than 3 minutes', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([{ model_id: 'model-a', last_completion: new Date(now - STALL_THRESHOLD_MS - 1000) }]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual(['model-a']);
  });

  it('does not mark a model stalled when last success is newer than 3 minutes', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([{ model_id: 'model-a', last_completion: new Date(now - STALL_THRESHOLD_MS + 1000) }]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual([]);
  });

  it('marks a never-successful model stalled when the run is older than 3 minutes', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual(['model-a']);
  });

  it('does not mark a never-successful model stalled when the run is newer than 3 minutes', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS + 1000))
    ).resolves.toEqual([]);
  });

  it('does not mark a model stalled when there are no pending jobs', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual([]);
  });

  it('treats only FAILED records as no prior success', async () => {
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual(['model-a']);
  });

  it('returns empty when all models have the expected transcript count', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { model_id: 'model-a', cnt: 6n },
      { model_id: 'model-b', cnt: 6n },
    ]);

    await expect(
      detectProgressStalls(
        'run-1',
        { models: ['model-a', 'model-b'], samplesPerScenario: 2 },
        3
      )
    ).resolves.toEqual([]);
  });

  it('returns model IDs that have fewer transcripts than expected', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { model_id: 'model-a', cnt: 5n },
      { model_id: 'model-b', cnt: 6n },
    ]);

    await expect(
      detectProgressStalls(
        'run-1',
        { models: ['model-a', 'model-b'], samplesPerScenario: 2 },
        3
      )
    ).resolves.toEqual(['model-a']);
  });

  it('flags a run when progress is incomplete and zero pending jobs exist', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-1',
        stalledModels: [],
        startedAt: new Date(now - STALL_THRESHOLD_MS - 1000),
        config: { models: ['model-a'], samplesPerScenario: 2 },
      },
    ]);
    vi.mocked(db.run.findUnique).mockResolvedValue({ progress: { total: 6 } });
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 3 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ model_id: 'model-a', cnt: 4n }]);
    vi.mocked(db.runScenarioSelection.count).mockResolvedValue(3);
    vi.mocked(db.run.update).mockResolvedValue({} as never);

    const result = await detectAndUpdateStalledRuns();

    expect(result).toEqual({ checked: 1, newStalls: 1, totalStalled: 1 });
    expect(db.runScenarioSelection.count).toHaveBeenCalledTimes(1);
    expect(db.run.update).toHaveBeenCalledTimes(1);
    expect(db.run.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { stalledModels: ['model-a'] },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      {
        runId: 'run-1',
        stalledModels: ['model-a'],
        progress: { total: 6, completed: 3, failed: 1 },
      },
      'Progress stall detected: incomplete progress with no pending jobs'
    );
  });

  it('does not flag a run when progress is complete', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-1',
        stalledModels: [],
        startedAt: new Date(now - STALL_THRESHOLD_MS - 1000),
        config: { models: ['model-a'] },
      },
    ]);
    vi.mocked(db.run.findUnique).mockResolvedValue({ progress: { total: 4 } });
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 3 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([]);
    vi.mocked(db.run.update).mockResolvedValue({} as never);

    const result = await detectAndUpdateStalledRuns();

    expect(result).toEqual({ checked: 1, newStalls: 0, totalStalled: 0 });
    expect(db.runScenarioSelection.count).not.toHaveBeenCalled();
    expect(db.run.update).not.toHaveBeenCalled();
  });

  it('does not flag a run when pending jobs still exist in pgboss', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-1',
        stalledModels: [],
        startedAt: new Date(now - STALL_THRESHOLD_MS - 1000),
        config: { models: ['model-a'], samplesPerScenario: 2 },
      },
    ]);
    vi.mocked(db.run.findUnique).mockResolvedValue({ progress: { total: 6 } });
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 3 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([{ model_id: 'model-a', last_completion: new Date(now - 1000) }])
      .mockResolvedValueOnce([{ model_id: 'model-a' }]);
    vi.mocked(db.run.update).mockResolvedValue({} as never);

    const result = await detectAndUpdateStalledRuns();

    expect(result).toEqual({ checked: 1, newStalls: 0, totalStalled: 0 });
    expect(db.runScenarioSelection.count).not.toHaveBeenCalled();
    expect(db.run.update).not.toHaveBeenCalled();
  });

  it('skips runs with null startedAt and logs an error', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([
      { id: 'run-1', stalledModels: [], startedAt: null },
    ]);
    vi.mocked(db.run.findUnique).mockResolvedValue({ progress: { total: 0 } });
    vi.mocked(db.run.update).mockResolvedValue({} as never);

    const result = await detectAndUpdateStalledRuns();

    expect(result).toEqual({ checked: 1, newStalls: 0, totalStalled: 0 });
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.run.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('only logs newly stalled models', async () => {
    vi.mocked(db.run.update).mockResolvedValue({} as never);

    await updateRunStalledModels(
      { id: 'run-1', stalledModels: ['model-a'] },
      ['model-a', 'model-b']
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { runId: 'run-1', newlyStalled: ['model-b'] },
      'Stall detected: models not making progress'
    );
    expect(db.run.update).toHaveBeenCalledTimes(1);
  });

  it('does not write to the database when stalled models are unchanged', async () => {
    vi.mocked(db.run.update).mockResolvedValue({} as never);

    await updateRunStalledModels(
      { id: 'run-1', stalledModels: ['model-a'] },
      ['model-a']
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expect(db.run.update).not.toHaveBeenCalled();
  });
});
