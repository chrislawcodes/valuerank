import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DomainAnalysisValueDetail } from '../../src/pages/DomainAnalysisValueDetail';
import {
  DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY,
  DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY,
} from '../../src/api/operations/domainAnalysis';
import type { Transcript } from '../../src/api/operations/runs';

const useQueryMock = vi.fn();
let lastTranscriptListProps: {
  transcripts: Transcript[];
  decisionColumnLabel?: string;
  decisionDisplayMode?: string;
  groupByModel?: boolean;
  scenarioDimensions?: Record<string, Record<string, string | number>>;
  onSelect: (transcript: Transcript) => void;
} | null = null;

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

vi.mock('../../src/components/runs/TranscriptViewer', () => ({
  TranscriptViewer: ({ transcript, decisionDisplayMode }: { transcript: { id: string }; decisionDisplayMode?: string }) => (
    <div data-testid="transcript-viewer">
      <span>{transcript.id}</span>
      <span>{decisionDisplayMode ?? 'unset'}</span>
    </div>
  ),
}));

vi.mock('../../src/components/runs/TranscriptList', () => ({
  TranscriptList: (props: {
    transcripts: Transcript[];
    decisionColumnLabel?: string;
    decisionDisplayMode?: string;
    groupByModel?: boolean;
    scenarioDimensions?: Record<string, Record<string, string | number>>;
    onSelect: (transcript: Transcript) => void;
  }) => {
    lastTranscriptListProps = props;
    return (
      <div data-testid="transcript-list">
        <span>{props.decisionColumnLabel ?? 'unset'}</span>
        <span>{props.decisionDisplayMode ?? 'unset'}</span>
        <span>{props.groupByModel ? 'grouped' : 'flat'}</span>
        <span>{props.transcripts.length}</span>
        {props.transcripts.map((transcript) => (
          <button key={transcript.id} type="button" onClick={() => props.onSelect(transcript)}>
            {transcript.id}
          </button>
        ))}
      </div>
    );
  },
}));

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: { turns: [] },
    decisionCode: '3',
    decisionCodeSource: 'llm',
    decisionMetadata: null,
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    estimatedCost: null,
    createdAt: '2024-01-15T10:00:00Z',
    lastAccessedAt: null,
    ...overrides,
  };
}

function createRenderableTranscript(
  id: string,
  overrides: {
    raw?: Partial<NonNullable<Transcript['decisionModelV2']>['raw']>;
    canonical?: Partial<NonNullable<Transcript['decisionModelV2']>['canonical']>;
    legacy?: Partial<NonNullable<Transcript['decisionModelV2']>['legacy']>;
  } = {},
): Transcript {
  return createTranscript({
    id,
    decisionModelV2: {
      raw: {
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'exact.favor_second.strong',
        parserVersion: 'v1',
        responseExcerpt: 'Achievement',
        manualOverride: null,
        ...overrides.raw,
      },
      canonical: {
        favoredValueKey: 'Benevolence_Dependability',
        opposedValueKey: 'Achievement',
        direction: 'favor_second',
        strength: 'strong',
        normalizationApplied: true,
        normalizationReason: 'orientation_flipped',
        source: 'deterministic',
        ...overrides.canonical,
      },
      legacy: {
        rawScore: null,
        canonicalScore: 1,
        ...overrides.legacy,
      },
    },
  });
}

function createCondition(overrides: {
  scenarioId: string;
  conditionName: string;
  dimensions: Record<string, string | number>;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  unknownCount?: number;
  strongly?: number;
  somewhat?: number;
  opponentSomewhat?: number;
  opponentStrongly?: number;
}) {
  return {
    scenarioId: overrides.scenarioId,
    conditionName: overrides.conditionName,
    dimensions: overrides.dimensions,
    prioritized: overrides.prioritized,
    deprioritized: overrides.deprioritized,
    neutral: overrides.neutral,
    totalTrials: overrides.totalTrials,
    selectedValueWinRate: overrides.prioritized + overrides.deprioritized + overrides.neutral === 0
      ? null
      : overrides.prioritized / (overrides.prioritized + overrides.deprioritized + overrides.neutral),
    strongly: overrides.strongly ?? 0,
    somewhat: overrides.somewhat ?? 0,
    opponentSomewhat: overrides.opponentSomewhat ?? 0,
    opponentStrongly: overrides.opponentStrongly ?? 0,
    unknownCount: overrides.unknownCount ?? 0,
  };
}

function createVignette(
  definitionId: string,
  definitionName: string,
  conditions: ReturnType<typeof createCondition>[],
  overrides: Partial<Record<string, unknown>> = {},
) {
  const prioritized = conditions.reduce((sum, condition) => sum + condition.prioritized, 0);
  const deprioritized = conditions.reduce((sum, condition) => sum + condition.deprioritized, 0);
  const neutral = conditions.reduce((sum, condition) => sum + condition.neutral, 0);
  const totalResponses = prioritized + deprioritized + neutral;

  return {
    definitionId,
    definitionName,
    definitionVersion: 1,
    aggregateRunId: 'run-1',
    otherValueKey: 'Benevolence_Dependability',
    prioritized,
    deprioritized,
    neutral,
    totalTrials: conditions.reduce((sum, condition) => sum + condition.totalTrials, 0),
    selectedValueWinRate: totalResponses === 0
      ? null
      : prioritized / totalResponses,
    conditions,
    ...overrides,
  };
}

function createDetail(vignettes: ReturnType<typeof createVignette>[]) {
  return {
    domainId: 'domain-a',
    domainName: 'Domain A',
    modelId: 'gpt-4',
    modelLabel: 'GPT-4',
    valueKey: 'Achievement',
    score: 1.25,
    prioritized: 8,
    deprioritized: 3,
    neutral: 2,
    totalTrials: 13,
    targetedDefinitions: 1,
    coveredDefinitions: 1,
    missingDefinitionIds: [],
    generatedAt: '2026-03-15T12:00:00.000Z',
    vignettes,
  };
}

function mockQueries(options: {
  detail?: unknown;
  detailFetching?: boolean;
  detailError?: Error;
  transcripts?: unknown;
  transcriptsFetching?: boolean;
  transcriptsError?: Error;
}) {
  useQueryMock.mockImplementation((args: { query: unknown }) => {
    if (args.query === DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY) {
      return [{
        data: options.detail === undefined ? undefined : { domainAnalysisValueDetail: options.detail },
        fetching: options.detailFetching ?? false,
        error: options.detailError,
      }];
    }

    if (args.query === DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY) {
      return [{
        data: options.transcripts === undefined ? undefined : { domainAnalysisConditionTranscripts: options.transcripts },
        fetching: options.transcriptsFetching ?? false,
        error: options.transcriptsError,
      }];
    }

    return [{ data: undefined, fetching: false, error: undefined }];
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/domains/analysis/value-detail?domainId=domain-a&modelId=gpt-4&valueKey=Achievement']}>
      <DomainAnalysisValueDetail />
    </MemoryRouter>,
  );
}

describe('DomainAnalysisValueDetail', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    lastTranscriptListProps = null;
  });

  it('renders the canonical matrix labels and canonical transcript drilldown', async () => {
    mockQueries({
      detail: createDetail([
        createVignette('def-1', 'One vignette', [
          createCondition({
            scenarioId: 'scenario-1',
            conditionName: 'Condition 1',
            dimensions: { A: 'negligible', B: 'same' },
            prioritized: 2,
            deprioritized: 1,
            neutral: 0,
            totalTrials: 3,
            // Winner: selected value (prioritized > deprioritized)
            // Strength: (2*1 + 1*1) / 3 = 1.0 → rounds to 1
            strongly: 1,
            somewhat: 1,
            opponentSomewhat: 1,
            opponentStrongly: 0,
          }),
          createCondition({
            scenarioId: 'scenario-2',
            conditionName: 'Condition 2',
            dimensions: { A: 'minimal', B: 'same' },
            prioritized: 1,
            deprioritized: 2,
            neutral: 0,
            totalTrials: 3,
            // Winner: opponent (deprioritized > prioritized)
            // Strength: (2*1 + 1*1) / 3 = 1.0 → rounds to 1
            strongly: 0,
            somewhat: 1,
            opponentSomewhat: 1,
            opponentStrongly: 1,
          }),
          createCondition({
            scenarioId: 'scenario-3',
            conditionName: 'Condition 3',
            dimensions: { A: 'moderate', B: 'same' },
            prioritized: 1,
            deprioritized: 1,
            neutral: 0,
            totalTrials: 2,
          }),
          createCondition({
            scenarioId: 'scenario-4',
            conditionName: 'Condition 4',
            dimensions: { A: 'substantial', B: 'same' },
            prioritized: 0,
            deprioritized: 0,
            neutral: 2,
            totalTrials: 2,
          }),
          createCondition({
            scenarioId: 'scenario-5',
            conditionName: 'Condition 5',
            dimensions: { A: 'full', B: 'same' },
            prioritized: 3,
            deprioritized: 0,
            neutral: 0,
            totalTrials: 3,
            // Winner: selected value (all prioritized)
            // Strength: (2*2 + 1*1) / 3 = 5/3 = 1.67 → rounds to 2
            strongly: 2,
            somewhat: 1,
            opponentSomewhat: 0,
            opponentStrongly: 0,
          }),
        ]),
      ]),
      transcripts: [
        createRenderableTranscript('transcript-v2'),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Value Score Detail')).toBeInTheDocument();
    });

    const matrixTable = screen.getByTitle('Condition 1').closest('table');
    expect(matrixTable).not.toBeNull();

    const rows = within(matrixTable as HTMLTableElement).getAllByRole('row');
    expect(rows.slice(2).map((row) => within(row).getAllByRole('cell')[0].textContent?.trim())).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
    // Cell labels show strength score (0/1/2), not which side won.
    // Color (not captured here) encodes the winner (blue=selected, orange=opponent).
    expect(rows.slice(2).map((row) => within(row).getAllByRole('cell')[1].textContent?.trim())).toEqual([
      '1',  // Condition 1: strength 1 (selected wins)
      '1',  // Condition 2: strength 1 (opponent wins — shown in orange)
      '-',  // Condition 3: tied
      '-',  // Condition 4: no directional trials
      '2',  // Condition 5: strength 2 (selected wins)
    ]);

    fireEvent.click(screen.getByTitle('Condition 1'));

    await waitFor(() => {
      expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    });

    expect(lastTranscriptListProps?.decisionColumnLabel).toBe('Decision summary');
    expect(lastTranscriptListProps?.decisionDisplayMode).toBe('audit');
    expect(lastTranscriptListProps?.groupByModel).toBe(false);
    expect(lastTranscriptListProps?.scenarioDimensions).toEqual({
      'scenario-1': { A: 'negligible', B: 'same' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'transcript-v2' }));

    const viewer = await screen.findByTestId('transcript-viewer');
    expect(within(viewer).getByText('transcript-v2')).toBeInTheDocument();
    expect(within(viewer).getByText('audit')).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    mockQueries({
      detailFetching: true,
    });

    renderPage();
    expect(screen.getByText('Loading value detail...')).toBeInTheDocument();
  });

  it('shows the top-level API error state', async () => {
    mockQueries({
      detailError: new Error('boom'),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load value detail: boom')).toBeInTheDocument();
    });
  });

  it('shows the empty state when no vignettes are available', async () => {
    mockQueries({
      detail: createDetail([]),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No transcript data found for this model/value in the selected domain.')).toBeInTheDocument();
    });
  });

  it('renders transcripts and always passes audit mode (TranscriptRow handles per-row fallback)', async () => {
    mockQueries({
      detail: createDetail([
        createVignette('def-1', 'One vignette', [
          createCondition({
            scenarioId: 'scenario-1',
            conditionName: 'Condition A',
            dimensions: { Row: 'negligible', Col: 'same' },
            prioritized: 2,
            deprioritized: 1,
            neutral: 0,
            totalTrials: 3,
          }),
        ]),
      ]),
      transcripts: [
        createTranscript({
          id: 'legacy-only',
          decisionModelV2: null,
        }),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Value Score Detail')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Condition A'));

    await waitFor(() => {
      expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    });

    expect(lastTranscriptListProps?.decisionDisplayMode).toBe('audit');
    expect(screen.queryByText(/Failed to render transcripts/)).not.toBeInTheDocument();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['negative', -1],
    ['non-integer', 1.5],
  ] as const)('rejects invalid canonical counts: %s', async (_label, invalidValue) => {
    mockQueries({
      detail: createDetail([
        createVignette('def-1', 'One vignette', [
          createCondition({
            scenarioId: 'scenario-1',
            conditionName: 'Condition A',
            dimensions: { A: 'negligible', B: 'same' },
            prioritized: invalidValue as number,
            deprioritized: 1,
            neutral: 0,
            totalTrials: 1,
          }),
        ]),
      ]),
      transcripts: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/ConditionMatrix requires canonical count data/)).toBeInTheDocument();
    });
  });
});
