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
  useAnalysis: (args?: { runId?: string }) => mockUseAnalysis(args),
}));

function createRun(id: string, presentationOrder: 'A_first' | 'B_first', transcripts: Array<{ id: string; scenarioId: string; decisionCode: string }>) {
  const first = presentationOrder === 'A_first' ? 'freedom' : 'harmony';
  const second = presentationOrder === 'A_first' ? 'harmony' : 'freedom';
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
      modelId: 'model1',
    })),
  };
}

function createAnalysis(runId: string, scenarioId: string, score: number) {
  return {
    runId,
    analysisType: 'basic',
    visualizationData: {
      decisionDistribution: {},
      modelScenarioMatrix: {
        model1: {
          [scenarioId]: score,
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
      { id: 'tx-1', scenarioId: 's1', decisionCode: '5' },
    ]);
    const companionRun = createRun('run-2', 'B_first', [
      { id: 'tx-2', scenarioId: 's2', decisionCode: '1' },
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

    mockUseAnalysis.mockImplementation((args?: { runId?: string }) => {
      if (args?.runId === 'run-2') {
        return {
          analysis: createAnalysis('run-2', 's2', 1),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createAnalysis('run-1', 's1', 5),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });
  });

  it('renders pooled and ordered paired rows with score labels', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    expect(screen.getByText('Condition Detail')).toBeInTheDocument();
    expect(screen.getByText('Freedom = High, Harmony = Low')).toBeInTheDocument();
    expect(screen.getByText('model1')).toBeInTheDocument();
    expect(screen.getByText('Pooled')).toBeInTheDocument();
    expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
    expect(screen.getByText('Harmony -> Freedom')).toBeInTheDocument();
    expect(screen.getByText('Strongly Support Harmony')).toBeInTheDocument();
    expect(screen.getByText('Strongly Support Freedom')).toBeInTheDocument();
  });

  it('routes a paired row count click to the matching transcript slice', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    const row = screen.getByText('Freedom -> Harmony').closest('tr');
    expect(row).not.toBeNull();

    const buttons = within(row as HTMLElement).getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&modelId=model1&mode=paired&companionRunId=run-2&pairView=condition-split&orientationBucket=canonical&decisionCode=5'
    );
  });

  it('still loads split rows when the companion run list item lacks analysisStatus', () => {
    const currentRun = createRun('run-1', 'A_first', [
      { id: 'tx-1', scenarioId: 's1', decisionCode: '5' },
    ]);
    const companionRun = {
      ...createRun('run-2', 'B_first', [
        { id: 'tx-2', scenarioId: 's2', decisionCode: '1' },
      ]),
      analysisStatus: null,
    };

    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-2') {
        return {
          run: {
            ...companionRun,
            analysisStatus: 'completed',
          },
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
          analysis: createAnalysis('run-2', 's2', 1),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createAnalysis('run-1', 's1', 5),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
    expect(screen.getByText('Harmony -> Freedom')).toBeInTheDocument();
  });

  it('uses the full companion run transcripts instead of the run list summary', () => {
    const currentRun = createRun('run-1', 'A_first', [
      { id: 'tx-1', scenarioId: 's1', decisionCode: '5' },
    ]);
    const companionRun = createRun('run-2', 'B_first', [
      { id: 'tx-2', scenarioId: 's2', decisionCode: '1' },
    ]);
    const companionSummary = {
      ...companionRun,
      transcripts: [],
    };

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
      runs: [companionSummary],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string }) => {
      if (args?.runId === 'run-2') {
        return {
          analysis: createAnalysis('run-2', 's2', 1),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createAnalysis('run-1', 's1', 5),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    const pooledRow = screen.getByText('Pooled').closest('tr');
    expect(pooledRow).not.toBeNull();
    expect(within(pooledRow as HTMLElement).getAllByRole('button', { name: '1' })).toHaveLength(2);
    expect(within(pooledRow as HTMLElement).getByText('2')).toBeInTheDocument();

    const flippedRow = screen.getByText('Harmony -> Freedom').closest('tr');
    expect(flippedRow).not.toBeNull();
    expect(within(flippedRow as HTMLElement).getByRole('button', { name: '1' })).toBeInTheDocument();
  });
});
