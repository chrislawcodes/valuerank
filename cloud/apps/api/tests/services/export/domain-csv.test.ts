import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      findMany: findManyMock,
    },
  },
}));

import {
  iterateDomainCsvTranscriptPages,
} from '../../../src/services/export/domain-csv.js';

describe('domain-csv export helpers', () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('yields transcript pages using the configured batch size', async () => {
    const pageOne = [
      { id: 't-1', modelId: 'model-a', scenarioId: 's-1' },
      { id: 't-2', modelId: 'model-a', scenarioId: 's-2' },
    ];
    const pageTwo = [
      { id: 't-3', modelId: 'model-b', scenarioId: 's-3' },
    ];

    findManyMock
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo)
      .mockResolvedValueOnce([]);

    const pages: unknown[][] = [];
    for await (const page of iterateDomainCsvTranscriptPages(['run-1'], 2)) {
      pages.push(page);
    }

    expect(pages).toEqual([pageOne, pageTwo]);
    expect(findManyMock).toHaveBeenCalledTimes(3);
    expect(findManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        skip: 0,
        take: 2,
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(findManyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        skip: 2,
        take: 2,
      }),
    );
    expect(findManyMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        skip: 3,
        take: 2,
      }),
    );
  });
});
