import { describe, expect, it, vi } from 'vitest';

vi.mock('@valuerank/db', () => ({
  db: {},
  resolveDefinitionContent: vi.fn(),
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../../src/graphql/queries/pressure-sensitivity.js');
}

describe('pressure-sensitivity resolver helpers', () => {
  it('last-write-wins for sourceRunId collisions and logs a structured warning', async () => {
    const { buildSourceRunToDefIdMap } = await loadModule();
    const warn = vi.fn();

    const map = buildSourceRunToDefIdMap(
      [
        {
          id: 'run-a',
          config: { sourceRunIds: ['source-1'] },
          definitionId: 'def-a',
          definition: { id: 'def-a', name: 'Def A', domainId: 'domain-1' },
        },
        {
          id: 'run-b',
          config: { sourceRunIds: ['source-1'] },
          definitionId: 'def-b',
          definition: { id: 'def-b', name: 'Def B', domainId: 'domain-1' },
        },
      ],
      new Map([
        ['def-a', { id: 'def-a' } as never],
        ['def-b', { id: 'def-b' } as never],
      ]),
      { warn },
    );

    expect(map.get('source-1')).toBe('def-b');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        sourceRunId: 'source-1',
        existingDefinitionId: 'def-a',
        newDefinitionId: 'def-b',
        code: 'source_run_collision',
      },
      'sourceRunId mapped to multiple definitions; last write wins',
    );
  });

  it('normalizes source-run collision precedence by aggregate run id', async () => {
    const { buildSourceRunToDefIdMap } = await loadModule();
    const warn = vi.fn();

    const map = buildSourceRunToDefIdMap(
      [
        {
          id: 'run-b',
          config: { sourceRunIds: ['source-1'] },
          definitionId: 'def-b',
          definition: { id: 'def-b', name: 'Def B', domainId: 'domain-1' },
        },
        {
          id: 'run-a',
          config: { sourceRunIds: ['source-1'] },
          definitionId: 'def-a',
          definition: { id: 'def-a', name: 'Def A', domainId: 'domain-1' },
        },
      ],
      new Map([
        ['def-a', { id: 'def-a' } as never],
        ['def-b', { id: 'def-b' } as never],
      ]),
      { warn },
    );

    expect(map.get('source-1')).toBe('def-b');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        existingDefinitionId: 'def-a',
        newDefinitionId: 'def-b',
        code: 'source_run_collision',
      }),
      'sourceRunId mapped to multiple definitions; last write wins',
    );
  });

  it('flags transcript cap hits and logs a structured warning', async () => {
    const { fetchTranscriptsFromSourceRuns } = await loadModule();
    const warn = vi.fn();
    const fetchPage = vi.fn(async () => ({
      rows: [
        {
          id: 'tx-1',
          modelId: 'model-1',
          runId: 'source-1',
          scenarioId: null,
          decisionMetadata: {},
        },
        {
          id: 'tx-2',
          modelId: 'model-1',
          runId: 'source-1',
          scenarioId: null,
          decisionMetadata: {},
        },
      ],
      hasMore: true,
    }));

    const result = await fetchTranscriptsFromSourceRuns(
      ['source-1'],
      ['model-1'],
      fetchPage,
      { warn },
      2,
    );

    expect(result.transcriptCapHit).toBe(true);
    expect(result.transcripts).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        sourceRunIds: ['source-1'],
        scanned: 2,
        limit: 2,
        code: 'transcript_cap_hit',
      },
      'Transcript fetch hit cap; results may be biased',
    );
  });

  it('returns a clean empty result with transcriptCapHit false', async () => {
    const { buildEmptyResult } = await loadModule();
    const result = buildEmptyResult([
      {
        id: 'model-a',
        displayName: 'Model A',
        provider: { displayName: 'Provider A', id: 'provider-a', name: 'provider-a' },
        providerId: 'provider-a',
      },
    ] as never);

    expect(result.transcriptCapHit).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.insufficient).toHaveLength(1);
  });
});
