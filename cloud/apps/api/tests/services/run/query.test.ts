import { describe, it, expect, vi, beforeEach } from 'vitest';

const analysisResultFindMany = vi.hoisted(() => vi.fn());

vi.mock('@valuerank/db', () => ({
  db: {
    analysisResult: {
      findMany: analysisResultFindMany,
    },
  },
}));

async function loadRunQueryModule() {
  vi.resetModules();
  analysisResultFindMany.mockReset();

  const query = await import('../../../src/services/run/query.js');
  const { db } = await import('@valuerank/db');
  return { db, ...query };
}

describe('run query filters', () => {
  beforeEach(() => {
    vi.resetModules();
    analysisResultFindMany.mockReset();
  });

  it('parses valid statuses', async () => {
    const {
      parseRunStatus,
      parseAnalysisStatus,
      parseRunCategory,
      parseRunType,
    } = await loadRunQueryModule();

    expect(parseRunStatus('COMPLETED')).toBe('COMPLETED');
    expect(parseAnalysisStatus('CURRENT')).toBe('CURRENT');
    expect(parseRunCategory('PRODUCTION')).toBe('PRODUCTION');
    expect(parseRunType('SURVEY')).toBe('SURVEY');
  });

  it('returns undefined/default for invalid statuses', async () => {
    const {
      parseRunStatus,
      parseAnalysisStatus,
      parseRunCategory,
      parseRunType,
    } = await loadRunQueryModule();

    expect(parseRunStatus('BOGUS')).toBeUndefined();
    expect(parseAnalysisStatus('BOGUS')).toBeUndefined();
    expect(parseRunCategory('BOGUS')).toBeUndefined();
    expect(parseRunType('BOGUS')).toBe('ALL');
  });

  it('builds base where clause', async () => {
    const { buildRunWhere } = await loadRunQueryModule();
    const result = await buildRunWhere({
      definitionId: 'def-1',
      experimentId: 'exp-1',
      status: 'RUNNING',
      runCategory: 'PRODUCTION',
      runType: 'ALL',
    });

    expect(result.noMatches).toBe(false);
    expect(result.where).toMatchObject({
      deletedAt: null,
      definitionId: 'def-1',
      experimentId: 'exp-1',
      status: 'RUNNING',
      runCategory: 'PRODUCTION',
    });
  });

  it('ignores null and empty-string filters', async () => {
    const { buildRunWhere } = await loadRunQueryModule();
    const result = await buildRunWhere({
      definitionId: null,
      experimentId: '',
      runType: 'ALL',
    });

    expect(result.noMatches).toBe(false);
    expect(result.where).toMatchObject({
      deletedAt: null,
    });
    expect(result.where).not.toHaveProperty('definitionId');
    expect(result.where).not.toHaveProperty('experimentId');
  });

  it('applies survey run type filter', async () => {
    const { buildRunWhere } = await loadRunQueryModule();
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
    const { buildRunWhere, db } = await loadRunQueryModule();
    vi.mocked(db.analysisResult.findMany).mockResolvedValue([]);
    const result = await buildRunWhere({ hasAnalysis: true });
    expect(result.noMatches).toBe(true);
  });

  it('adds run ID filter when analysis filter matches runs', async () => {
    const { buildRunWhere, db } = await loadRunQueryModule();
    vi.mocked(db.analysisResult.findMany).mockResolvedValue([{ runId: 'run-1' }] as never);
    const result = await buildRunWhere({ hasAnalysis: true, analysisStatus: 'CURRENT' });
    expect(result.noMatches).toBe(false);
    expect(result.where).toMatchObject({
      id: { in: ['run-1'] },
    });
  });
});
