import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  transcriptFindMany,
  accumulateTranscriptCellsMock,
  resolveValuePairsInChunksMock,
  computeCellWeightedDomainRatesMock,
} = vi.hoisted(() => ({
  transcriptFindMany: vi.fn(),
  accumulateTranscriptCellsMock: vi.fn(() => new Map()),
  resolveValuePairsInChunksMock: vi.fn(async () => new Map()),
  computeCellWeightedDomainRatesMock: vi.fn(() => ({
    models: [],
    analyzedDefinitionIds: new Set<string>(),
  })),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      findMany: transcriptFindMany,
    },
  },
}));

vi.mock('../../../src/graphql/queries/domain/shared.js', () => ({
  resolveValuePairsInChunks: resolveValuePairsInChunksMock,
}));

vi.mock('../../../src/services/analysis/transcript-cell-accumulator.js', () => ({
  accumulateTranscriptCells: accumulateTranscriptCellsMock,
}));

vi.mock('../../../src/services/analysis/domain-analysis-cell-win-rates.js', () => ({
  computeCellWeightedDomainRates: computeCellWeightedDomainRatesMock,
}));

import { buildSnapshotOutput } from '../../../src/services/analysis/domain-analysis-snapshot-builder.js';

function makeTranscript(runId: string, index: number) {
  return {
    id: `${runId}-transcript-${index}`,
    runId,
    modelId: 'model-1',
    decisionMetadata: {},
    definitionSnapshot: {},
    deletedAt: null,
    scenario: {
      id: `${runId}-scenario-${index}`,
      content: {},
      orientationFlipped: false,
      deletedAt: null,
    },
  };
}

describe('buildSnapshotOutput batching', () => {
  beforeEach(() => {
    transcriptFindMany.mockReset();
    accumulateTranscriptCellsMock.mockReset();
    resolveValuePairsInChunksMock.mockReset();
    computeCellWeightedDomainRatesMock.mockReset();

    resolveValuePairsInChunksMock.mockResolvedValue(new Map());
    accumulateTranscriptCellsMock.mockReturnValue(new Map());
    computeCellWeightedDomainRatesMock.mockReturnValue({
      models: [],
      analyzedDefinitionIds: new Set<string>(),
    });
  });

  it('pages transcripts in bounded batches per run', async () => {
    transcriptFindMany.mockImplementation(async (args: { where?: { runId?: string }; skip?: number }) => {
      const runId = args.where?.runId;
      const skip = args.skip ?? 0;

      if (runId === 'run-1' && skip === 0) {
        return Array.from({ length: 500 }, (_, index) => makeTranscript(runId, index));
      }
      if (runId === 'run-1' && skip === 500) {
        return [makeTranscript(runId, 500)];
      }
      if (runId === 'run-2' && skip === 0) {
        return [makeTranscript(runId, 0)];
      }
      return [];
    });

    const onProgress = vi.fn();
    const { output } = await buildSnapshotOutput({
      scope: 'ALL_DOMAINS',
      domain: { id: 'all-domains', name: 'All domains', defaultModelIds: [] },
      domains: [],
      definitions: [],
      latestDefinitions: [],
      latestDefinitionIds: [],
      definitionNameById: new Map(),
      definitionDomainIdById: new Map(),
      resolvedSignatureRuns: {
        selectedSignature: 'vnewtd',
        filteredSourceRunIds: ['run-1', 'run-2'],
        filteredSourceRunDefinitionById: new Map([
          ['run-1', 'definition-1'],
          ['run-2', 'definition-2'],
        ]),
        coveredDefinitionIds: new Set(['definition-1', 'definition-2']),
        missingReasonByDefinitionId: new Map(),
      },
      selectedSignature: 'vnewtd',
      configSignature: 'vnewtd',
      fingerprintRows: [],
      inputHash: 'hash-1',
    }, {
      onProgress,
    });

    expect(output).toBeDefined();

    expect(transcriptFindMany).toHaveBeenCalledTimes(3);
    expect(transcriptFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { runId: 'run-1', deletedAt: null },
      take: 500,
      skip: 0,
    }));
    expect(transcriptFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { runId: 'run-1', deletedAt: null },
      take: 500,
      skip: 500,
    }));
    expect(transcriptFindMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      where: { runId: 'run-2', deletedAt: null },
      take: 500,
      skip: 0,
    }));

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      completedRuns: 1,
      totalRuns: 2,
      currentRunId: 'run-1',
    }));
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({
      completedRuns: 2,
      totalRuns: 2,
      currentRunId: 'run-2',
    }));
  });
});
