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
  collectDomainCsvDimensionColumns,
  iterateDomainCsvTranscriptPages,
} from '../../../src/services/export/domain-csv.js';

describe('domain-csv export helpers', () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('collects dimension columns across paged transcript batches', async () => {
    findManyMock
      .mockResolvedValueOnce([
        {
          scenario: {
            content: {
              dimensions: { Stakes: 1 },
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          scenario: {
            content: {
              dimensions: { Certainty: 2 },
            },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await collectDomainCsvDimensionColumns(['run-1'], false, 1);

    expect(result.headers).toEqual(['Certainty', 'Stakes']);
    expect(findManyMock).toHaveBeenCalledTimes(3);
    expect(findManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        skip: 0,
        take: 1,
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(findManyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        skip: 1,
        take: 1,
      }),
    );
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
