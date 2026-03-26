import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SurveyResults } from '../../src/pages/SurveyResults';
import { SCENARIOS_QUERY } from '../../src/api/operations/scenarios';
import { SURVEYS_QUERY } from '../../src/api/operations/surveys';

const mockUseQuery = vi.fn();
const mockUseInfiniteRuns = vi.fn();
const mockUseRun = vi.fn();
const mockUpdateTranscriptDecision = vi.fn();

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

vi.mock('../../src/hooks/useRunMutations', () => ({
  useRunMutations: () => ({
    updateTranscriptDecision: mockUpdateTranscriptDecision,
  }),
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

function createRenderableTranscript(
  id: string,
  scenarioId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    runId: 'run-1',
    scenarioId,
    modelId: 'model1',
    modelVersion: 'model-1',
    content: { turns: [] },
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
        rawScore: null,
        canonicalScore: null,
      },
    },
    ...overrides,
  };
}

function createLeanTranscript(id: string, scenarioId: string) {
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
        rawScore: null,
        canonicalScore: null,
      },
    },
  });
}

function createUnknownTranscript(id: string, scenarioId: string, decisionCode = 'x') {
  return {
    id,
    runId: 'run-1',
    scenarioId,
    modelId: 'model1',
    modelVersion: 'model-1',
    content: { turns: [] },
    decisionCode,
    decisionCodeSource: 'manual',
    decisionMetadata: null,
    decisionModelV2: null,
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    estimatedCost: null,
    createdAt: '2026-03-10T10:00:00Z',
    lastAccessedAt: null,
  };
}

function createRun(transcripts: Array<Record<string, unknown>>) {
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
    </MemoryRouter>
  );
}

describe('SurveyResults', () => {
  beforeEach(() => {
    const surveyTranscripts = [
      createRenderableTranscript('tx-majority-1', 's-majority'),
      createRenderableTranscript('tx-majority-2', 's-majority'),
      createLeanTranscript('tx-majority-3', 's-majority'),
      createRenderableTranscript('tx-mixed-1', 's-mixed'),
      createLeanTranscript('tx-mixed-2', 's-mixed'),
      createRenderableTranscript('tx-other', 's-other', { decisionCode: 'other' }),
    ];

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
                createScenario('s-other', 5, 'Other cell'),
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
      runs: [
        createRun(surveyTranscripts),
      ],
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
      run: createRun(surveyTranscripts),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUpdateTranscriptDecision.mockReset();
  });

  it('renders canonical cell summaries instead of raw numeric averages', () => {
    renderPage();

    expect(screen.getByText('Question x AI Matrix')).toBeInTheDocument();
    expect(screen.getByText('Empty cell')).toBeInTheDocument();
    expect(screen.getByText(/Strongly favors Benevolence Dependability/)).toBeInTheDocument();
    expect(screen.queryByText('4.00')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();

    const majorityButton = screen.getByRole('button', { name: /View transcript for Majority cell \/ model1/i });
    expect(majorityButton).toHaveTextContent('Strongly favors Benevolence Dependability');
    expect(majorityButton).toHaveAttribute(
      'title',
      'View transcript: Strongly favors Benevolence Dependability. Strongly favors Benevolence Dependability (2), Somewhat favors Achievement (1)',
    );
    fireEvent.click(majorityButton);
    expect(screen.getByTestId('transcript-viewer')).toHaveTextContent('tx-majority-1');

    const mixedButton = screen.getByRole('button', { name: /View transcript for Mixed cell \/ model1/i });
    expect(mixedButton).toHaveTextContent('Mixed*');
    expect(mixedButton).toHaveAttribute(
      'title',
      'View transcript: Mixed. Strongly favors Benevolence Dependability (1), Somewhat favors Achievement (1)',
    );
  });

  it('renders canonical labels in the override select for legacy other responses', () => {
    renderPage();

    const cell = screen.getByText('Other cell').closest('tr');
    expect(cell).not.toBeNull();

    const select = within(cell as HTMLElement).getByRole('combobox');
    expect(within(select).getByRole('option', { name: 'Strongly disagree' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Neutral' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: '1' })).not.toBeInTheDocument();
  });

  it('throws when the latest survey run includes legacy-only transcripts', () => {
    mockUseInfiniteRuns.mockReturnValue({
      runs: [
        createRun([
          createUnknownTranscript('tx-legacy', 's-unknown'),
        ]),
      ],
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
      run: createRun([
        createUnknownTranscript('tx-legacy', 's-unknown'),
      ]),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    expect(() => renderPage()).toThrow(/SurveyResults page requires canonical decision-model-v2 data for transcript tx-legacy/);
  });
});
