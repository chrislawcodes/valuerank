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
    { id: 'run-good-a', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: null },
    { id: 'run-good-b', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: null },
    { id: 'run-failed', config: { signature: 'vnewtd' }, status: 'FAILED', deletedAt: null },
    { id: 'run-deleted', config: { signature: 'vnewtd' }, status: 'COMPLETED', deletedAt: new Date('2026-04-01T00:00:00.000Z') },
    { id: 'run-mismatch', config: { signature: 'vother' }, status: 'COMPLETED', deletedAt: null },
  ];
}

function buildTranscripts(fixture: TranscriptFixture[]): Array<Record<string, unknown>> {
  return fixture.map((entry) => ({
    runId: entry.runId,
    modelId: entry.modelId,
    decisionCode: entry.direction,
    decisionMetadata: { direction: entry.direction },
    definitionSnapshot: buildSnapshot(),
    scenario: { orientationFlipped: entry.orientationFlipped, deletedAt: null },
    deletedAt: null,
  }));
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
  installDecisionMock();
});

describe('aggregatePairwiseWinRates', () => {
  it('canonicalizes flipped transcripts to the same pairwise counts as unflipped ones', async () => {
    mockDb.run.findMany.mockResolvedValue(buildRuns());

    const unflipped = buildTranscripts([
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first' },
      { runId: 'run-failed', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second' },
      { runId: 'run-deleted', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second' },
      { runId: 'run-mismatch', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second' },
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'unknown' },
    ]);
    mockDb.transcript.findMany.mockResolvedValueOnce(unflipped);
    const unflippedResult = await aggregatePairwiseWinRates({
      modelIds: ['model-1'],
      signature: 'vnewtd',
      db: mockDb,
    });

    const flipped = buildTranscripts([
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'favor_first' },
      { runId: 'run-good-b', modelId: 'model-1', orientationFlipped: true, direction: 'favor_second' },
      { runId: 'run-failed', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second' },
      { runId: 'run-deleted', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second' },
      { runId: 'run-mismatch', modelId: 'model-1', orientationFlipped: false, direction: 'favor_second' },
      { runId: 'run-good-a', modelId: 'model-1', orientationFlipped: false, direction: 'unknown' },
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

    const pair = unflippedMatrix?.[0]?.[1];
    expect(pair?.trials).toBe(2);
    expect(pair?.neutrals).toBe(0);
    expect(pair?.winRate).toBe(1);
  });

  it('returns an empty matrix for models with no matching transcripts', async () => {
    mockDb.run.findMany.mockResolvedValue(buildRuns());
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
});
