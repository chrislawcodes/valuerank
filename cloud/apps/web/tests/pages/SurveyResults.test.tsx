import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Transcript } from '../../src/api/operations/runs';
import { SCENARIOS_QUERY } from '../../src/api/operations/scenarios';
import { SURVEYS_QUERY } from '../../src/api/operations/surveys';
import {
  SurveyResults,
  buildSurveyResultsCsv,
  type SurveyMatrixData,
} from '../../src/pages/SurveyResults';

const mockUseQuery = vi.fn();
const mockUseInfiniteRuns = vi.fn();
const mockUseRun = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  };
});

vi.mock('../../src/hooks/useInfiniteRuns', () => ({
  useInfiniteRuns: (...args: unknown[]) => mockUseInfiniteRuns(...args),
}));

vi.mock('../../src/hooks/useRun', () => ({
  useRun: (...args: unknown[]) => mockUseRun(...args),
}));

vi.mock('../../src/components/analysis', () => ({
  AnalysisListFilters: () => <div data-testid="analysis-filters" />,
  VirtualizedAnalysisFolderView: ({ runs }: { runs: Array<{ id: string }> }) => (
    <div data-testid="folder-view">Folder runs: {runs.length}</div>
  ),
  VirtualizedAnalysisList: ({ runs }: { runs: Array<{ id: string }> }) => (
    <div data-testid="list-view">List runs: {runs.length}</div>
  ),
}));

vi.mock('../../src/components/runs/TranscriptViewer', () => ({
  TranscriptViewer: ({ transcript }: { transcript: { id: string } }) => (
    <div data-testid="transcript-viewer">Transcript: {transcript.id}</div>
  ),
}));

function createSurveyPlan() {
  return {
    kind: 'survey',
    version: 1,
    definitionId: 'def-1',
    responseOptions: [
      { value: 1, order: 1, label: 'Strongly disagree' },
      { value: 2, order: 2, label: 'Disagree' },
      { value: 3, order: 3, label: 'Neutral' },
      { value: 4, order: 4, label: 'Agree' },
      { value: 5, order: 5, label: 'Strongly agree' },
    ],
  };
}

function createSurvey() {
  return {
    id: 'survey-1',
    name: 'Legacy Survey',
    updatedAt: '2026-03-10T18:00:00Z',
    runCount: 1,
    analysisPlan: createSurveyPlan(),
  };
}

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'model1',
    modelVersion: 'model-1',
    content: { turns: [{ targetResponse: 'Canonical answer' }] },
    decisionCode: '5',
    decisionCodeSource: 'llm',
    decisionMetadata: null,
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    estimatedCost: null,
    createdAt: '2026-03-10T10:00:00Z',
    lastAccessedAt: null,
    decisionModelV2: {
      raw: {
        matchedText: 'Benevolence',
        matchedLabel: 'Benevolence',
        parseClass: 'exact',
        parsePath: 'exact.favor_first.strong',
        parserVersion: 'v1',
        responseExcerpt: 'Benevolence',
        manualOverride: null,
      },
      canonical: {
        favoredValueKey: 'Benevolence_Dependability',
        opposedValueKey: 'Achievement',
        direction: 'favor_first',
        strength: 'strong',
        normalizationApplied: true,
        normalizationReason: 'orientation_flipped',
        source: 'deterministic',
      },
      legacy: {
        },
    },
    ...overrides,
  };
}

function createRenderableTranscript(id: string, scenarioId: string, overrides: Partial<Transcript> = {}): Transcript {
  return createTranscript({
    id,
    scenarioId,
    ...overrides,
  });
}

function createLeanTranscript(id: string, scenarioId: string): Transcript {
  return createRenderableTranscript(id, scenarioId, {
    decisionCode: '4',
    decisionModelV2: {
      raw: {
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'exact.favor_first.lean',
        parserVersion: 'v1',
        responseExcerpt: 'Achievement',
        manualOverride: null,
      },
      canonical: {
        favoredValueKey: 'Achievement',
        opposedValueKey: 'Benevolence_Dependability',
        direction: 'favor_first',
        strength: 'lean',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      },
      legacy: {
        },
    },
  });
}

function createExplicitUnknownTranscript(id: string, scenarioId: string, decisionCode = 'x'): Transcript {
  return {
    id,
    runId: 'run-1',
    scenarioId,
    modelId: 'model1',
    modelVersion: 'model-1',
    content: { turns: [{ targetResponse: 'Unknown answer' }] },
    decisionCode,
    decisionCodeSource: 'manual',
    decisionMetadata: null,
    decisionModelV2: {
      raw: {
        matchedText: null,
        matchedLabel: null,
        parseClass: 'unparseable',
        parsePath: null,
        parserVersion: null,
        responseExcerpt: null,
        manualOverride: null,
      },
      canonical: {
        favoredValueKey: null,
        opposedValueKey: null,
        direction: 'unknown',
        strength: 'unknown',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'unknown',
      },
      legacy: {
        },
    },
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    estimatedCost: null,
    createdAt: '2026-03-10T10:00:00Z',
    lastAccessedAt: null,
  };
}

function createMissingEnvelopeTranscript(id: string, scenarioId: string): Transcript {
  return {
    ...createRenderableTranscript(id, scenarioId),
    decisionModelV2: null,
  };
}

function createPartialEnvelopeTranscript(id: string, scenarioId: string): Transcript {
  return {
    ...createRenderableTranscript(id, scenarioId),
    decisionModelV2: {
      raw: {
        parseClass: 'exact',
      } as NonNullable<Transcript['decisionModelV2']>['raw'],
      canonical: {
        favoredValueKey: null,
        opposedValueKey: null,
        direction: 'favor_first',
        strength: 'strong',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      } as NonNullable<Transcript['decisionModelV2']>['canonical'],
      legacy: null,
    } as NonNullable<Transcript['decisionModelV2']>,
  };
}

function createRun(transcripts: Transcript[]) {
  return {
    id: 'run-1',
    experimentId: 'survey-1',
    status: 'COMPLETED',
    definitionId: 'def-1',
    name: '[Survey] Legacy survey run',
    definition: {
      id: 'def-1',
      name: '[Survey] Legacy survey run',
      tags: [],
      content: {
        version: 1,
      },
    },
    config: {
      models: ['model1'],
    },
    transcripts,
  };
}

function createScenario(id: string, questionNumber: number, questionText: string) {
  return {
    id,
    name: questionText,
    content: {
      prompt: `Question: ${questionText}`,
      dimensions: {
        questionNumber,
        questionText,
      },
    },
  };
}

function renderPage(initialEntry = '/survey-results?surveyId=survey-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SurveyResults />
    </MemoryRouter>,
  );
}

function setBaseQueryState(transcripts: Transcript[]) {
  mockUseQuery.mockImplementation((args: { query: unknown }) => {
    if (args.query === SURVEYS_QUERY) {
      return [
        {
          data: { surveys: [createSurvey()] },
          fetching: false,
        },
        vi.fn(),
      ];
    }

    if (args.query === SCENARIOS_QUERY) {
      return [
        {
          data: {
            scenarios: [
              createScenario('s-empty', 1, 'Empty cell'),
              createScenario('s-unknown', 2, 'Unknown cell'),
              createScenario('s-majority', 3, 'Majority cell'),
              createScenario('s-mixed', 4, 'Mixed cell'),
            ],
          },
          fetching: false,
        },
        vi.fn(),
      ];
    }

    return [
      {
        data: null,
        fetching: false,
      },
      vi.fn(),
    ];
  });

  mockUseInfiniteRuns.mockReturnValue({
    runs: [createRun(transcripts)],
    loading: false,
    loadingMore: false,
    error: null,
    hasNextPage: false,
    totalCount: 1,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    softRefetch: vi.fn(),
  });

  mockUseRun.mockReturnValue({
    run: createRun(transcripts),
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('SurveyResults', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseInfiniteRuns.mockReset();
    mockUseRun.mockReset();

    setBaseQueryState([
      createExplicitUnknownTranscript('tx-unknown', 's-unknown'),
      createRenderableTranscript('tx-majority-1', 's-majority'),
      createRenderableTranscript('tx-majority-2', 's-majority'),
      createLeanTranscript('tx-majority-3', 's-majority'),
      createRenderableTranscript('tx-mixed-1', 's-mixed'),
      createLeanTranscript('tx-mixed-2', 's-mixed'),
    ]);
  });

  it('renders canonical cell summaries and ignores legacy score buckets', () => {
    renderPage();

    expect(screen.getByText('Question x AI Matrix')).toBeInTheDocument();
    expect(screen.getByText('Empty cell')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/Strongly supports Benevolence Dependability/)).toBeInTheDocument();
    expect(screen.queryByText('4.00')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    const majorityButton = screen.getByRole('button', { name: /View transcript for Majority cell \/ model1/i });
    expect(majorityButton).toHaveTextContent('Strongly supports Benevolence Dependability');
    expect(majorityButton).toHaveTextContent('(n=3)');
    expect(majorityButton).toHaveAttribute(
      'title',
      'View transcript: Strongly supports Benevolence Dependability. Strongly supports Benevolence Dependability (2), Somewhat supports Achievement (1)',
    );
    fireEvent.click(majorityButton);
    expect(screen.getByTestId('transcript-viewer')).toHaveTextContent('tx-majority-1');

    const mixedButton = screen.getByRole('button', { name: /View transcript for Mixed cell \/ model1/i });
    expect(mixedButton).toHaveTextContent('Mixed');
    expect(mixedButton).toHaveTextContent('(n=2)');
    expect(mixedButton).toHaveAttribute(
      'title',
      'View transcript: Mixed. Strongly supports Benevolence Dependability (1), Somewhat supports Achievement (1)',
    );
  });

  it('exports canonical summaries instead of legacy decision codes', () => {
    const csv = buildSurveyResultsCsv({
      models: ['model1'],
      rows: [
        { scenarioId: 's-majority', order: 1, questionText: 'Majority cell' },
        { scenarioId: 's-unknown', order: 2, questionText: 'Unknown cell' },
      ],
      transcriptsByCell: new Map<string, Transcript[]>([
        ['s-majority::model1', [createRenderableTranscript('tx-majority-1', 's-majority')]],
        ['s-unknown::model1', [createExplicitUnknownTranscript('tx-unknown', 's-unknown')]],
      ]),
      cellSummaries: new Map([
        [
          's-majority::model1',
          {
            headline: 'Strongly supports Benevolence Dependability',
            totalCount: 1,
            renderableCount: 1,
            unknownCount: 0,
            buckets: [
              { kind: 'strong', label: 'Strongly supports Benevolence Dependability', count: 1 },
            ],
          },
        ],
        [
          's-unknown::model1',
          {
            headline: 'Unknown',
            totalCount: 1,
            renderableCount: 0,
            unknownCount: 1,
            buckets: [
              { kind: 'unknown', label: 'Unknown', count: 1 },
            ],
          },
        ],
      ]),
    } satisfies SurveyMatrixData);

    expect(csv).toContain('model1 decision summary');
    expect(csv).toContain('Strongly supports Benevolence Dependability');
    expect(csv).toContain('Unknown');
    expect(csv).not.toContain('decision code');
    expect(csv).not.toContain('4.00');
  });

  it('surfaces an inline matrix error when canonical v2 data is missing', () => {
    setBaseQueryState([
      createMissingEnvelopeTranscript('tx-missing', 's-majority'),
      createRenderableTranscript('tx-valid', 's-majority'),
    ]);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Canonical decision-model-v2 data is missing or malformed.');
    expect(screen.getByText(/Survey results require canonical decision-model-v2 data for transcript tx-missing/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /View transcript for/ })).not.toBeInTheDocument();
  });

  it('surfaces the same inline matrix error when canonical v2 data is partial', () => {
    setBaseQueryState([
      createPartialEnvelopeTranscript('tx-partial', 's-majority'),
      createRenderableTranscript('tx-valid', 's-majority'),
    ]);

    renderPage();

    expect(screen.getByText('Canonical decision-model-v2 data is missing or malformed.')).toBeInTheDocument();
    expect(screen.getByText(/Survey results require canonical decision-model-v2 data for transcript tx-partial/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDisabled();
  });
});
