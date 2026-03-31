import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@valuerank/db';
import { resolveRunAnalysisStatus } from '../../../src/services/run/analysis-status.js';

describe('analysis status service', () => {
  const now = new Date('2026-03-31T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns pending for a basic analysis job in created state', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([]);
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([
        { state: 'created', data: { runId: 'run-1' } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'COMPLETED',
        completedAt: null,
        config: { models: ['model-a'] },
      }),
    ).resolves.toBe('pending');
  });

  it('returns pending for a basic analysis job in retry state', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([]);
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([
        { state: 'retry', data: { runId: 'run-1' } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'COMPLETED',
        completedAt: null,
        config: { models: ['model-a'] },
      }),
    ).resolves.toBe('pending');
  });

  it('returns computing for a basic analysis job in active state', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([]);
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([
        { state: 'active', data: { runId: 'run-1' } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'COMPLETED',
        completedAt: null,
        config: { models: ['model-a'] },
      }),
    ).resolves.toBe('computing');
  });

  it('returns completed when the current analysis result exists', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([
      { runId: 'run-1' },
    ]);
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'COMPLETED',
        completedAt: null,
        config: { models: ['model-a'] },
      }),
    ).resolves.toBe('completed');
  });

  it('returns failed for a matching aggregate analysis job', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([]);
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          state: 'failed',
          data: {
            definitionId: 'definition-1',
            preambleVersionId: 'preamble-1',
            definitionVersion: 3,
            temperature: 0.7,
          },
        },
      ]);

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'COMPLETED',
        completedAt: null,
        config: {
          isAggregate: true,
          temperature: 0.7,
          definitionSnapshot: {
            _meta: {
              preambleVersionId: 'preamble-1',
              definitionVersion: 3,
            },
          },
        },
      }),
    ).resolves.toBe('failed');
  });

  it('falls back to null when pgboss queries fail for a non-completed run', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([]);
    vi.spyOn(db as any, '$queryRaw').mockRejectedValue(new Error('pgboss unavailable'));

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'RUNNING',
        completedAt: null,
        config: { models: ['model-a'] },
      }),
    ).resolves.toBeNull();
  });

  it('falls back to null when a completed run has no matching job or analysis result', async () => {
    vi.spyOn(db.analysisResult as any, 'findMany').mockResolvedValue([]);
    vi.spyOn(db as any, '$queryRaw')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      resolveRunAnalysisStatus({
        id: 'run-1',
        definitionId: 'definition-1',
        status: 'COMPLETED',
        completedAt: new Date(now - 6 * 60 * 1000),
        config: { models: ['model-a'] },
      }),
    ).resolves.toBeNull();
  });
});
