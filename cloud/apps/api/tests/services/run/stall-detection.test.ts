/**
 * Unit tests for stall detection service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@valuerank/shared', async () => {
  const actual = await vi.importActual<typeof import('@valuerank/shared')>('@valuerank/shared');
  return {
    ...actual,
    createLogger: vi.fn(() => logger),
  };
});

import {
  STALL_THRESHOLD_MS,
  detectAndUpdateStalledRuns,
  detectStalledModels,
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
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([{ model_id: 'model-a', last_completion: new Date(now - STALL_THRESHOLD_MS - 1000) }]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual(['model-a']);
  });

  it('does not mark a model stalled when last success is newer than 3 minutes', async () => {
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([{ model_id: 'model-a', last_completion: new Date(now - STALL_THRESHOLD_MS + 1000) }]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual([]);
  });

  it('marks a never-successful model stalled when the run is older than 3 minutes', async () => {
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual(['model-a']);
  });

  it('does not mark a never-successful model stalled when the run is newer than 3 minutes', async () => {
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS + 1000))
    ).resolves.toEqual([]);
  });

  it('does not mark a model stalled when there are no pending jobs', async () => {
    vi.spyOn(db as any, '$queryRaw').mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual([]);
  });

  it('treats only FAILED records as no prior success', async () => {
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([{ model_id: 'model-a' }])
      .mockResolvedValueOnce([]);

    await expect(
      detectStalledModels('run-1', new Date(now - STALL_THRESHOLD_MS - 1000))
    ).resolves.toEqual(['model-a']);
  });

  it('skips runs with null startedAt and logs an error', async () => {
    const findManySpy = vi.spyOn(db.run as any, 'findMany').mockResolvedValue([
      { id: 'run-1', stalledModels: [], startedAt: null },
    ]);
    const updateSpy = vi.spyOn(db.run as any, 'update').mockResolvedValue({} as never);
    const querySpy = vi.spyOn(db as any, '$queryRaw');

    const result = await detectAndUpdateStalledRuns();

    expect(result).toEqual({ checked: 1, newStalls: 0, totalStalled: 0 });
    expect(findManySpy).toHaveBeenCalledTimes(1);
    expect(querySpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('only logs newly stalled models', async () => {
    const updateSpy = vi.spyOn(db.run as any, 'update').mockResolvedValue({} as never);

    await updateRunStalledModels(
      { id: 'run-1', stalledModels: ['model-a'] },
      ['model-a', 'model-b']
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { runId: 'run-1', newlyStalled: ['model-b'] },
      'Stall detected: models not making progress'
    );
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not write to the database when stalled models are unchanged', async () => {
    const updateSpy = vi.spyOn(db.run as any, 'update').mockResolvedValue({} as never);

    await updateRunStalledModels(
      { id: 'run-1', stalledModels: ['model-a'] },
      ['model-a']
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
