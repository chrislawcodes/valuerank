import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnalysisConditionDetail } from '../../src/pages/AnalysisConditionDetail';

const mockNavigate = vi.fn();
const mockUseRun = vi.fn();
const mockUseRuns = vi.fn();
const mockUseAnalysis = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../src/hooks/useRun', () => ({
  useRun: (args?: { id?: string }) => mockUseRun(args),
}));

vi.mock('../../src/hooks/useRuns', () => ({
  useRuns: () => mockUseRuns(),
}));

vi.mock('../../src/hooks/useAnalysis', () => ({
  useAnalysis: (args?: { runId?: string; pause?: boolean }) => mockUseAnalysis(args),
}));

function createTranscript(
  id: string,
  scenarioId: string,
  presentationOrder: 'A_first' | 'B_first',
  decisionCode: string | null,
) {
  const firstValueKey = presentationOrder === 'A_first' ? 'Freedom' : 'Harmony';
  const secondValueKey = presentationOrder === 'A_first' ? 'Harmony' : 'Freedom';

  const decisionModelV2 = decisionCode === '5'
    ? {
        raw: {
          matchedText: firstValueKey,
          matchedLabel: firstValueKey,
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          parserVersion: 'v1',
          responseExcerpt: firstValueKey,
          manualOverride: null,
        },
        canonical: {
          favoredValueKey: firstValueKey,
          opposedValueKey: secondValueKey,
          direction: 'favor_first',
          strength: 'strong',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'deterministic',
        },
        legacy: {
          rawScore: 5,
          canonicalScore: 5,
        },
      }
    : decisionCode === '1'
      ? {
          raw: {
            matchedText: secondValueKey,
            matchedLabel: secondValueKey,
            parseClass: 'exact',
            parsePath: 'exact.favor_second.strong',
            parserVersion: 'v1',
            responseExcerpt: secondValueKey,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: secondValueKey,
            opposedValueKey: firstValueKey,
            direction: 'favor_second',
            strength: 'strong',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: {
            rawScore: 1,
            canonicalScore: 1,
          },
        }
      : null;

  return {
    id,
    runId: id.startsWith('tx-') ? 'run-1' : id,
    scenarioId,
    modelId: 'model1',
    modelVersion: 'test-model',
    content: { turns: [] },
    decisionCode,
    decisionCodeSource: 'llm',
    decisionMetadata: null,
    turnCount: 1,
    tokenCount: 42,
    durationMs: 1000,
    estimatedCost: null,
    createdAt: '2026-03-10T10:00:00Z',
    lastAccessedAt: null,
    decisionModelV2,
  };
}

function createRun(
  id: string,
  presentationOrder: 'A_first' | 'B_first',
  transcripts: Array<ReturnType<typeof createTranscript>>,
) {
  const first = presentationOrder === 'A_first' ? 'Freedom' : 'Harmony';
  const second = presentationOrder === 'A_first' ? 'Harmony' : 'Freedom';
  const name = presentationOrder === 'A_first' ? 'Freedom -> Harmony' : 'Harmony -> Freedom';

  return {
    id,
    name,
    createdAt: id === 'run-1' ? '2026-03-10T10:00:00Z' : '2026-03-10T10:05:00Z',
    analysisStatus: 'completed',
    config: {
      jobChoiceLaunchMode: 'PAIRED_BATCH',
      jobChoiceBatchGroupId: 'batch-1',
      jobChoicePresentationOrder: presentationOrder,
    },
    definition: {
      id: `def-${id}`,
      name,
      content: {
        methodology: {
          family: 'job-choice',
          presentation_order: presentationOrder,
          pair_key: 'pair-1',
        },
        components: {
          value_first: { token: first },
          value_second: { token: second },
        },
        dimensions: [
          { name: 'Freedom' },
          { name: 'Harmony' },
        ],
      },
    },
    transcripts: transcripts.map((transcript) => ({
      ...transcript,
      runId: id,
    })),
  };
}

function createAnalysis(runId: string, scenarioId: string) {
  return {
    runId,
    analysisType: 'basic',
    visualizationData: {
      decisionDistribution: {},
      modelScenarioMatrix: {
        model1: {
          [scenarioId]: 5,
        },
      },
      scenarioDimensions: {
        [scenarioId]: {
          Freedom: 'High',
          Harmony: 'Low',
        },
      },
    },
  };
}

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/analysis/:id/conditions/:conditionKey" element={<AnalysisConditionDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AnalysisConditionDetail', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseRun.mockReset();
    mockUseRuns.mockReset();
    mockUseAnalysis.mockReset();

    const currentRun = createRun('run-1', 'A_first', [
      createTranscript('tx-1', 's1', 'A_first', '5'),
      createTranscript('tx-unknown', 's1', 'A_first', null),
    ]);
    const companionRun = createRun('run-2', 'B_first', [
      createTranscript('tx-2', 's2', 'B_first', '1'),
    ]);

    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-2') {
        return {
          run: companionRun,
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        run: currentRun,
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    mockUseRuns.mockReturnValue({
      runs: [companionRun],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string; pause?: boolean }) => {
      if (args?.pause) {
        return {
          analysis: null,
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      if (args?.runId === 'run-2') {
        return {
          analysis: createAnalysis('run-2', 's2'),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createAnalysis('run-1', 's1'),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });
  });

  it('renders paired canonical buckets with explicit unknown handling', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    expect(screen.getByText('Condition Detail')).toBeInTheDocument();
    expect(screen.getByText('Freedom = High, Harmony = Low')).toBeInTheDocument();
    expect(screen.getByText('Pooled')).toBeInTheDocument();
    expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
    expect(screen.getByText('Harmony -> Freedom')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Freedom')).toBeInTheDocument();
    expect(screen.getByText('Somewhat favors Freedom')).toBeInTheDocument();
    expect(screen.getByText('Neutral')).toBeInTheDocument();
    expect(screen.getByText('Somewhat favors Harmony')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Harmony')).toBeInTheDocument();

    const pooledRow = screen.getByText('Pooled').closest('tr');
    const canonicalRow = screen.getByText('Freedom -> Harmony').closest('tr');
    const flippedRow = screen.getByText('Harmony -> Freedom').closest('tr');

    expect(pooledRow).not.toBeNull();
    expect(canonicalRow).not.toBeNull();
    expect(flippedRow).not.toBeNull();

    expect(within(pooledRow as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent?.trim())).toEqual([
      'Pooled',
      '1',
      '0',
      '0',
      '0',
      '1',
      '1',
      '2',
      '1',
    ]);
    expect(within(canonicalRow as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent?.trim())).toEqual([
      'Freedom -> Harmony',
      '1',
      '0',
      '0',
      '0',
      '0',
      '1',
      '1',
      '1',
    ]);
    expect(within(flippedRow as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent?.trim())).toEqual([
      'Harmony -> Freedom',
      '0',
      '0',
      '0',
      '0',
      '1',
      '0',
      '1',
      '0',
    ]);
  });

  it('routes a canonical bucket click to the matching transcript slice', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    const row = screen.getByText('Freedom -> Harmony').closest('tr');
    expect(row).not.toBeNull();

    const button = within(row as HTMLElement).getAllByRole('button', { name: '1' })[0];
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&modelId=model1&mode=paired&companionRunId=run-2&pairView=condition-split&orientationBucket=canonical&decisionCode=5'
    );
  });

  it('renders the same canonical summary in single mode', () => {
    mockUseRuns.mockReturnValue({
      runs: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-1') {
        return {
          run: createRun('run-1', 'A_first', [
            createTranscript('tx-1', 's1', 'A_first', '5'),
            createTranscript('tx-unknown', 's1', 'A_first', null),
          ]),
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        run: null,
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string; pause?: boolean }) => {
      if (args?.pause) {
        return {
          analysis: null,
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createAnalysis('run-1', 's1'),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=single');

    expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Freedom')).toBeInTheDocument();

    const row = screen.getByText('Freedom -> Harmony').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent?.trim())).toEqual([
      'Freedom -> Harmony',
      '1',
      '0',
      '0',
      '0',
      '0',
      '1',
      '1',
      '1',
    ]);
  });
});
