import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@valuerank/db', () => ({
  db: {
    analysisResult: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from '@valuerank/db';
import {
  buildRunWhere,
  parseAnalysisStatus,
  parseRunStatus,
  parseRunType,
} from '../../../src/services/run/query.js';

describe('run query filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid statuses', () => {
    expect(parseRunStatus('COMPLETED')).toBe('COMPLETED');
    expect(parseAnalysisStatus('CURRENT')).toBe('CURRENT');
    expect(parseRunType('SURVEY')).toBe('SURVEY');
  });

  it('returns undefined/default for invalid statuses', () => {
    expect(parseRunStatus('BOGUS')).toBeUndefined();
    expect(parseAnalysisStatus('BOGUS')).toBeUndefined();
    expect(parseRunType('BOGUS')).toBe('ALL');
  });

  it('builds base where clause', async () => {
    const result = await buildRunWhere({
      definitionId: 'def-1',
      experimentId: 'exp-1',
      status: 'RUNNING',
      runType: 'ALL',
    });

    expect(result.noMatches).toBe(false);
    expect(result.where).toMatchObject({
      deletedAt: null,
      definitionId: 'def-1',
      experimentId: 'exp-1',
      status: 'RUNNING',
    });
  });

  it('applies survey run type filter', async () => {
    const result = await buildRunWhere({ runType: 'SURVEY' });
    expect(result.where).toMatchObject({
      definition: {
        is: {
          name: {
            startsWith: '[Survey]',
          },
        },
      },
    });
  });

  it('returns noMatches when analysis filter has no matching run IDs', async () => {
    vi.mocked(db.analysisResult.findMany).mockResolvedValue([]);
    const result = await buildRunWhere({ hasAnalysis: true });
    expect(result.noMatches).toBe(true);
  });

  it('adds run ID filter when analysis filter matches runs', async () => {
    vi.mocked(db.analysisResult.findMany).mockResolvedValue([{ runId: 'run-1' }] as never);
    const result = await buildRunWhere({ hasAnalysis: true, analysisStatus: 'CURRENT' });
    expect(result.noMatches).toBe(false);
    expect(result.where).toMatchObject({
      id: { in: ['run-1'] },
    });
  });
});
