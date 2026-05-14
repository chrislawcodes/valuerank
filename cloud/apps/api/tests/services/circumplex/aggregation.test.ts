import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';

const { mockDb, runMatchesSignatureMock, resolveTranscriptDecisionModelMock } = vi.hoisted(() => ({
  mockDb: {
    run: { findMany: vi.fn() },
    transcript: { findMany: vi.fn() },
  },
  runMatchesSignatureMock: vi.fn(),
  resolveTranscriptDecisionModelMock: vi.fn(),
}));

vi.mock('@valuerank/db', () => ({ db: mockDb }));
vi.mock('../../../src/graphql/queries/domain-coverage-gql-types.js', () => ({
  runMatchesSignature: runMatchesSignatureMock,
}));
vi.mock('../../../src/graphql/queries/domain/decision-model.js', () => ({
  resolveTranscriptDecisionModel: resolveTranscriptDecisionModelMock,
}));

const { aggregatePairwiseWinRates } = await import('../../../src/services/circumplex/aggregation.js');

type TranscriptFixture = {
  runId: string;
  modelId: string;
  orientationFlipped: boolean;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  scenarioId?: string | null;
};

function buildSnapshot() {
  return {
    dimensions: [
      { name: 'Self_Direction_Action' },
      { name: 'Stimulation' },
    ],
  };
}

function buildRuns() {
  return [
    { id: 'run-good-a', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: null, definitionId: 'def-1' },
    { id: 'run-good-b', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: null, definitionId: 'def-1' },
    { id: 'run-failed', config: { signature: 'vnewtd' }, status: 'FAILED', deletedAt: null, definitionId: 'def-1' },
    { id: 'run-deleted', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: new Date('2026-04-01T00:00:00.000Z'), definitionId: 'def-1' },
    { id: 'run-mismatch', config: { signature: 'vother' }, status: 'COMPLETED', deletedAt: null, definitionId: 'def-1' },
    { id: 'run-other-domain', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: null, definitionId: 'def-other' },
  ];
}

function buildTranscripts(fixture: TranscriptFixture[]): Array<Record<string, unknown>> {
  return fixture.map((entry) => ({
    runId: entry.runId,
    modelId: entry.modelId,
    scenarioId: entry.scenarioId ?? null,
    decisionCode: entry.direction,
    decisionMetadata: { direction: entry.direction },
    definitionSnapshot: buildSnapshot(),
    scenario: { orientationFlipped: entry.orientationFlipped, deletedAt: null },
    deletedAt: null,
  }));
}

function installRunMock(): void {
  // Mirror what Prisma does with the `where` clause: aggregation.ts now filters
  // status / deletedAt / definitionId in SQL, so the mock must honor those
  // instead of returning every run unconditionally.
  mockDb.run.findMany.mockImplementation((args: {
    where?: {
      status?: string;
      deletedAt?: null;
      definitionId?: { in?: string[] };
    };
  }) => {
    const where = args.where ?? {};
    return Promise.resolve(
      buildRuns().filter((run) => {
        if (where.status != null && run.status !== where.status) return false;
        if (where.deletedAt === null && run.deletedAt != null) return false;
        const inList = where.definitionId?.in;
        if (inList != null && !inList.includes(run.definitionId)) return false;
        return true;
      }),
    );
  });
}

function installDecisionMock(): void {
  resolveTranscriptDecisionModelMock.mockImplementation((input: {
    decisionMetadata: unknown;
    pairOverride?: { valueA: string; valueB: string } | null;
    orientationFlipped?: boolean | null;
  }) => {
    const pair = input.pairOverride ?? { valueA: SCHWARTZ_CIRCULAR_ORDER[0]!, valueB: SCHWARTZ_CIRCULAR_ORDER[1]! };
    const rawDirection = (input.decisionMetadata as { direction?: string } | null)?.direction ?? 'unknown';
    if (rawDirection === 'unknown') {
      return { canonical: { direction: 'unknown', favoredValueKey: null } };
    }

    const flippedDirection = input.orientationFlipped
      ? (rawDirection === 'favor_first' ? 'favor_second' : rawDirection === 'favor_second' ? 'favor_first' : rawDirection)
      : rawDirection;

    if (flippedDirection === 'neutral') {
      return { canonical: { direction: 'neutral', favoredValueKey: null } };
    }

    return {
      canonical: {
        direction: flippedDirection,
        favoredValueKey: flippedDirection === 'favor_first' ? pair.valueA : pair.valueB,
      },
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  runMatchesSignatureMock.mockImplementation((config: { signature?: string }, signature: string) => config.signature === signature);
  installRunMock();
  installDecisionMock();
});

describe('aggregatePairwiseWinRates', () => {
  it('canonicalizes flipped transcripts to the same pairwise counts as unflipped ones', async () => {

    const unflipped = buildTranscripts([
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-1' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-2' },
      { runId: 'run-failed', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-3' },
      { runId: 'run-deleted', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-4' },
      { runId: 'run-mismatch', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-5' },
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'unknown', scenarioId: 'sc-6' },
    ]);
    mockDb.transcript.findMany.mockResolvedValueOnce(unflipped);
    const unflippedResult = await aggregatePairwiseWinRates({
      modelIds: ['model-1'],
      signature: 'vnewtd',
      db: mockDb,
    });

    const flipped = buildTranscripts([
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-1' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: true, direction: 'favor_second', scenarioId: 'sc-2' },
      { runId: 'run-failed', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-3' },
      { runId: 'run-deleted', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-4' },
      { runId: 'run-mismatch', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-5' },
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'unknown', scenarioId: 'sc-6' },
    ]);
    mockDb.transcript.findMany.mockResolvedValueOnce(flipped);
    const flippedResult = await aggregatePairwiseWinRates({
      modelIds: ['model-1'],
      signature: 'vnewtd',
      db: mockDb,
    });

    const unflippedMatrix = unflippedResult.get('model-1');
    const flippedMatrix = flippedResult.get('model-1');
    expect(unflippedMatrix).toBeDefined();
    expect(flippedMatrix).toBeDefined();
    expect(flippedMatrix).toEqual(unflippedMatrix);

    // sc-1 wins (favor_first), sc-2 wins (favor_first) → 2 vignettes each with rate 1.0 → avg = 1.0
    const pair = unflippedMatrix?.[0]?.[1];
    expect(pair?.trials).toBe(2);
    expect(pair?.neutrals).toBe(0);
    expect(pair?.winRate).toBe(1);
  });

  it('returns an empty matrix for models with no matching transcripts', async () => {
    mockDb.transcript.findMany.mockResolvedValue([]);

    const result = await aggregatePairwiseWinRates({
      modelIds: ['model-2'],
      signature: 'vnewtd',
      db: mockDb,
    });

    const matrix = result.get('model-2');
    expect(matrix).toBeDefined();
    expect(matrix?.[0]?.[1]?.trials).toBe(0);
    expect(matrix?.[0]?.[1]?.winRate).toBeNull();
  });

  it('averages win rates per vignette rather than pooling raw counts', async () => {

    // Vignette sc-A: 3 wins for Self_Direction (favor_first), 0 losses → rate = 1.0
    // Vignette sc-B: 1 win for Self_Direction, 3 losses → rate = 0.25
    // Pooled (old): 4 wins / 7 total ≈ 0.571
    // Vignette average (new): (1.0 + 0.25) / 2 = 0.625
    const transcripts = buildTranscripts([
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-A' },
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-A' },
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-A' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-B' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-B' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-B' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-B' },
    ]);
    mockDb.transcript.findMany.mockResolvedValueOnce(transcripts);

    const result = await aggregatePairwiseWinRates({
      modelIds: ['model-1'],
      signature: 'vnewtd',
      db: mockDb,
    });

    // Self_Direction_Action is index 0, Stimulation is index 1 in SCHWARTZ_CIRCULAR_ORDER
    const matrix = result.get('model-1');
    const cell = matrix?.[0]?.[1];
    expect(cell).toBeDefined();
    expect(cell?.trials).toBe(7);
    expect(cell?.winRate).toBeCloseTo(0.625);
  });

  it('filters transcripts to runs belonging to the specified domain', async () => {

    // run-good-a and run-good-b belong to def-1; run-other-domain belongs to def-other
    const transcripts = buildTranscripts([
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first', scenarioId: 'sc-1' },
      { runId: 'run-other-domain', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second', scenarioId: 'sc-2' },
    ]);
    mockDb.transcript.findMany.mockResolvedValueOnce(transcripts);

    const result = await aggregatePairwiseWinRates({
      modelIds: ['model-1'],
      signature: 'vnewtd',
      domainDefinitionIds: new Set(['def-1']),
      db: mockDb,
    });

    const matrix = result.get('model-1');
    const cell = matrix?.[0]?.[1];
    // Only sc-1 (favor_first = Self_Direction wins) should be counted
    expect(cell?.trials).toBe(1);
    expect(cell?.winRate).toBe(1);
  });
});
