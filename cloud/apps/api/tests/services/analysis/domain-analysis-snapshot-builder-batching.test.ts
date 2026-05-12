import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  transcriptFindMany,
  transcriptFindFirst,
  resolveDefinitionContentMock,
  accumulateTranscriptCellsMock,
  computeCellWeightedDomainRatesMock,
} = vi.hoisted(() => ({
  transcriptFindMany: vi.fn(),
  transcriptFindFirst: vi.fn(),
  resolveDefinitionContentMock: vi.fn(),
  accumulateTranscriptCellsMock: vi.fn(() => new Map()),
  computeCellWeightedDomainRatesMock: vi.fn(() => ({
    models: [],
    analyzedDefinitionIds: new Set<string>(),
  })),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      findMany: transcriptFindMany,
      findFirst: transcriptFindFirst,
    },
  },
  resolveDefinitionContent: resolveDefinitionContentMock,
}));

vi.mock('../../../src/graphql/queries/domain/shared.js', () => ({
  getMissingReasonLabel: vi.fn(() => 'Missing analysis'),
  resolveSignatureRuns: vi.fn(),
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
    deletedAt: null,
    scenario: {
      id: `${runId}-scenario-${index}`,
      content: {},
      orientationFlipped: false,
      deletedAt: null,
    },
  };
}

function makeDefinitionContent() {
  return {
    template: ['Which job would you choose?', '- Strongly support achievement', '- Somewhat support security'].join('\n'),
    dimensions: [
      {
        name: 'Achievement',
        levels: [{ score: 1, label: '1' }],
      },
      {
        name: 'Security_Personal',
        levels: [{ score: 1, label: '1' }],
      },
    ],
    components: {
      context_id: 'context-1',
      value_first: {
        token: 'Achievement',
        body: 'achievement body',
      },
      value_second: {
        token: 'Security_Personal',
        body: 'security body',
      },
    },
  };
}

describe('buildSnapshotOutput batching', () => {
  beforeEach(() => {
    transcriptFindMany.mockReset();
    transcriptFindFirst.mockReset();
    resolveDefinitionContentMock.mockReset();
    accumulateTranscriptCellsMock.mockReset();
    computeCellWeightedDomainRatesMock.mockReset();

    resolveDefinitionContentMock.mockResolvedValue({ resolvedContent: makeDefinitionContent() });
    transcriptFindFirst.mockResolvedValue(null);
    accumulateTranscriptCellsMock.mockReturnValue(new Map());
    computeCellWeightedDomainRatesMock.mockReturnValue({
      models: [],
      analyzedDefinitionIds: new Set<string>(),
    });
  });

  it('pages transcripts in bounded batches per run', async () => {
    transcriptFindMany.mockImplementation(async (args: { where?: { runId?: string }; cursor?: { id?: string | null }; skip?: number }) => {
      const runId = args.where?.runId;
      const cursorId = args.cursor?.id;

      if (runId === 'run-1' && cursorId == null) {
        return Array.from({ length: 500 }, (_, index) => makeTranscript(runId, index));
      }
      if (runId === 'run-1' && cursorId === 'run-1-transcript-499') {
        return [makeTranscript(runId, 500)];
      }
      if (runId === 'run-2' && cursorId == null) {
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
    }));
    expect(transcriptFindMany.mock.calls[0]?.[0]?.select).not.toHaveProperty('definitionSnapshot');
    expect(transcriptFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { runId: 'run-1', deletedAt: null },
      take: 500,
      cursor: { id: 'run-1-transcript-499' },
      skip: 1,
    }));
    expect(transcriptFindMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      where: { runId: 'run-2', deletedAt: null },
      take: 500,
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

  it('builds one small decision snapshot per definition and passes it to accumulation', async () => {
    resolveDefinitionContentMock.mockResolvedValue({ resolvedContent: makeDefinitionContent() });
    transcriptFindMany.mockResolvedValue([
      {
        id: 'run-1-transcript-0',
        runId: 'run-1',
        modelId: 'model-1',
        decisionMetadata: {},
        deletedAt: null,
        scenario: {
          id: 'scenario-1',
          content: {},
          orientationFlipped: false,
          deletedAt: null,
        },
      },
    ]);

    await buildSnapshotOutput({
      scope: 'ALL_DOMAINS',
      domain: { id: 'all-domains', name: 'All domains', defaultModelIds: [] },
      domains: [],
      definitions: [],
      latestDefinitions: [{ id: 'definition-1', updatedAt: new Date('2025-01-01T00:00:00.000Z') }],
      latestDefinitionIds: ['definition-1'],
      definitionNameById: new Map([['definition-1', 'Definition 1']]),
      definitionDomainIdById: new Map([['definition-1', 'domain-1']]),
      resolvedSignatureRuns: {
        selectedSignature: 'vnewtd',
        filteredSourceRunIds: ['run-1'],
        filteredSourceRunDefinitionById: new Map([
          ['run-1', 'definition-1'],
        ]),
        coveredDefinitionIds: new Set(['definition-1']),
        missingReasonByDefinitionId: new Map(),
      },
      selectedSignature: 'vnewtd',
      configSignature: 'vnewtd',
      fingerprintRows: [],
      inputHash: 'hash-1',
    });

    expect(resolveDefinitionContentMock).toHaveBeenCalledTimes(1);
    expect(resolveDefinitionContentMock).toHaveBeenCalledWith('definition-1');
    expect(accumulateTranscriptCellsMock).toHaveBeenCalledWith(expect.objectContaining({
      decisionSnapshotByDefinitionId: expect.any(Map),
    }));
    const [call] = accumulateTranscriptCellsMock.mock.calls;
    expect(call?.[0]?.decisionSnapshotByDefinitionId?.get('definition-1')).toEqual(expect.objectContaining({
      components: expect.objectContaining({
        value_first: expect.objectContaining({
          token: 'Achievement',
        }),
      }),
    }));
  });

  it('falls back to one stored transcript snapshot when resolved content lacks components', async () => {
    resolveDefinitionContentMock.mockResolvedValue({
      resolvedContent: {
        template: 'Legacy job choice',
        dimensions: [
          { name: 'achievement' },
          { name: 'security_personal' },
        ],
      },
    });
    transcriptFindFirst.mockResolvedValue({
      definitionSnapshot: makeDefinitionContent(),
    });
    transcriptFindMany.mockResolvedValue([
      {
        id: 'run-1-transcript-0',
        runId: 'run-1',
        modelId: 'model-1',
        decisionMetadata: {},
        deletedAt: null,
        scenario: {
          id: 'scenario-1',
          content: {},
          orientationFlipped: false,
          deletedAt: null,
        },
      },
    ]);

    await buildSnapshotOutput({
      scope: 'ALL_DOMAINS',
      domain: { id: 'all-domains', name: 'All domains', defaultModelIds: [] },
      domains: [],
      definitions: [],
      latestDefinitions: [{ id: 'definition-1', updatedAt: new Date('2025-01-01T00:00:00.000Z') }],
      latestDefinitionIds: ['definition-1'],
      definitionNameById: new Map([['definition-1', 'Definition 1']]),
      definitionDomainIdById: new Map([['definition-1', 'domain-1']]),
      resolvedSignatureRuns: {
        selectedSignature: 'vnewtd',
        filteredSourceRunIds: ['run-1'],
        filteredSourceRunDefinitionById: new Map([
          ['run-1', 'definition-1'],
        ]),
        coveredDefinitionIds: new Set(['definition-1']),
        missingReasonByDefinitionId: new Map(),
      },
      selectedSignature: 'vnewtd',
      configSignature: 'vnewtd',
      fingerprintRows: [],
      inputHash: 'hash-1',
    });

    expect(transcriptFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        runId: 'run-1',
        deletedAt: null,
      },
      select: {
        definitionSnapshot: true,
      },
    }));
    const [call] = accumulateTranscriptCellsMock.mock.calls;
    expect(call?.[0]?.decisionSnapshotByDefinitionId?.get('definition-1')).toEqual(expect.objectContaining({
      template: expect.any(String),
      components: expect.any(Object),
    }));
  });
});
