import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecuteRaw = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

type AnalysisResultRow = {
  id: string;
  status: 'CURRENT' | 'SUPERSEDED';
  updatedAt: Date;
};

const rows: { current: AnalysisResultRow[] } = {
  current: [],
};

function resetRows(): void {
  const now = Date.now();
  rows.current = [
    {
      id: 'analysis-old-superseded',
      status: 'SUPERSEDED',
      updatedAt: new Date(now - 31 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'analysis-current-old',
      status: 'CURRENT',
      updatedAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'analysis-fresh-superseded',
      status: 'SUPERSEDED',
      updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    },
  ];
}

vi.mock('@valuerank/db', () => ({
  db: {
    $executeRaw: mockExecuteRaw,
  },
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    info: mockLogInfo,
    error: mockLogError,
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createAnalysisResultJanitorHandler } from '../../../src/queue/handlers/analysis-result-janitor.js';
import { SUPERSEDED_ANALYSIS_RETENTION_DAYS } from '../../../src/services/analysis/constants.js';

mockExecuteRaw.mockImplementation(async (_strings: TemplateStringsArray, retentionDays: number) => {
  expect(retentionDays).toBe(SUPERSEDED_ANALYSIS_RETENTION_DAYS);

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let deletedCount = 0;
  rows.current = rows.current.filter((row) => {
    const shouldDelete = row.status === 'SUPERSEDED' && row.updatedAt < cutoff;
    if (shouldDelete) {
      deletedCount += 1;
      return false;
    }
    return true;
  });

  return deletedCount;
});

describe('createAnalysisResultJanitorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRows();
  });

  it('deletes SUPERSEDED rows older than the retention window', async () => {
    const handler = createAnalysisResultJanitorHandler();
    await handler([{ id: 'job-1', data: {} } as never]);

    expect(rows.current.map((row) => row.id)).not.toContain('analysis-old-superseded');
    expect(mockLogInfo).toHaveBeenCalledWith({ deletedCount: 1 }, 'Pruned superseded analysis results');
  });

  it('does not delete CURRENT rows', async () => {
    const handler = createAnalysisResultJanitorHandler();
    await handler([{ id: 'job-1', data: {} } as never]);

    expect(rows.current.map((row) => row.id)).toContain('analysis-current-old');
  });

  it('does not delete SUPERSEDED rows younger than the retention window', async () => {
    const handler = createAnalysisResultJanitorHandler();
    await handler([{ id: 'job-1', data: {} } as never]);

    expect(rows.current.map((row) => row.id)).toContain('analysis-fresh-superseded');
  });
});
