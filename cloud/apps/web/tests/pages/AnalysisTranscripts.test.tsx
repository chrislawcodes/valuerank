import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnalysisTranscripts } from '../../src/pages/AnalysisTranscripts';

const mockNavigate = vi.fn();
const mockUseRun = vi.fn();
const mockUseRuns = vi.fn();
const mockUseAnalysis = vi.fn();
const mockUpdateTranscriptDecision = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../src/hooks/useRun', () => ({
  useRun: () => mockUseRun(),
}));

vi.mock('../../src/hooks/useRuns', () => ({
  useRuns: () => mockUseRuns(),
}));

vi.mock('../../src/hooks/useAnalysis', () => ({
  useAnalysis: () => mockUseAnalysis(),
}));

vi.mock('../../src/hooks/useRunMutations', () => ({
  useRunMutations: () => ({
    updateTranscriptDecision: mockUpdateTranscriptDecision,
  }),
}));

vi.mock('../../src/components/runs/TranscriptList', () => ({
  TranscriptList: ({ transcripts }: { transcripts: Array<{ id: string }> }) => (
    <div data-testid="transcript-list">Transcript count: {transcripts.length}</div>
  ),
}));

vi.mock('../../src/components/runs/TranscriptViewer', () => ({
  TranscriptViewer: ({ transcript }: { transcript: { id: string } }) => (
    <div data-testid="transcript-viewer">Viewer transcript: {transcript.id}</div>
  ),
}));

function createRun(id: string, definitionVersion: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tags: [],
    completedAt: '2026-03-10T18:00:00Z',
    analysisStatus: 'completed',
    definitionVersion,
    config: {
      definitionSnapshot: {
        _meta: { definitionVersion },
      },
      temperature: 0,
    },
    definition: {
      id: 'def-1',
      name: 'Test Definition',
    },
    transcripts: [
      {
        id: 'tx-1',
        modelId: 'model1',
        scenarioId: 's1',
        decisionCode: 'A',
      },
      {
        id: 'tx-2',
        modelId: 'model1',
        scenarioId: 's2',
        decisionCode: 'A',
      },
      {
        id: 'tx-3',
        modelId: 'model2',
        scenarioId: 's3',
        decisionCode: 'B',
      },
    ],
    ...overrides,
  };
}

function createAggregateRun(id: string, definitionVersion: number) {
  return createRun(id, definitionVersion, {
    tags: [{ name: 'Aggregate' }],
  });
}

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/analysis/:id/transcripts" element={<AnalysisTranscripts />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AnalysisTranscripts', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseRun.mockReset();
    mockUseRuns.mockReset();
    mockUseAnalysis.mockReset();
    mockUpdateTranscriptDecision.mockReset();

    mockUseRun.mockReturnValue({
      run: createRun('run-1', 1),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseRuns.mockReturnValue({
      runs: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseAnalysis.mockReturnValue({
      analysis: {
        analysisType: 'basic',
        visualizationData: {
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: { s1: 1, s2: 2 },
            model2: { s3: 4 },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
            s3: { Freedom: 'Low', Harmony: 'High' },
          },
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });
  });

  it('filters transcripts by repeatPattern and conditionIds', () => {
    renderPage('/analysis/run-1/transcripts?modelId=model1&repeatPattern=stable&rowDim=Freedom&colDim=Harmony&conditionIds=High%7C%7CLow');

    const headerMeta = screen.getByText('Test Definition').parentElement;
    expect(headerMeta).not.toBeNull();
    expect(headerMeta).toHaveTextContent('Repeat Pattern: Stable');
    expect(headerMeta).toHaveTextContent('Model: model1');
    expect(headerMeta).toHaveTextContent('Conditions: 1');
    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 2');
  });

  it('fuzzy-matches model ids for repeat-pattern drilldowns', () => {
    renderPage('/analysis/run-1/transcripts?modelId=provider:model1&repeatPattern=stable&rowDim=Freedom&colDim=Harmony&conditionIds=High%7C%7CLow');

    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 2');
  });

  it('shows an empty repeat-pattern state when conditionIds are present but empty', () => {
    renderPage('/analysis/run-1/transcripts?modelId=model1&repeatPattern=stable&conditionIds=');

    expect(screen.getByText('No transcripts found for these conditions.')).toBeInTheDocument();
  });

  it('opens a direct transcript exemplar link in paired mode without cell filter params', () => {
    renderPage('/analysis/run-1/transcripts?transcriptId=tx-2&mode=paired');

    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 1');
    expect(screen.queryByText('Missing filter parameters. Return to the pivot table and click a cell to view transcripts.')).not.toBeInTheDocument();
    expect(screen.getByText('Paired vignette scope')).toBeInTheDocument();
    expect(screen.getByTestId('transcript-viewer')).toHaveTextContent('Viewer transcript: tx-2');
  });

  it('shows the paired scope banner when the mode query param is present', () => {
    renderPage('/analysis/run-1/transcripts?mode=paired&rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1');

    expect(screen.getByText('Paired vignette scope')).toBeInTheDocument();
    expect(screen.getByText(/Paired mode keeps the matched vignette context visible while the analysis surface is adapted\./i)).toBeInTheDocument();
  });

  it('keeps repeat-pattern query params when aggregate signature switching changes runs', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: {
        analysisType: 'AGGREGATE',
        visualizationData: {
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: { s1: 1, s2: 2 },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
          },
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });
    mockUseRun.mockReturnValue({
      run: createAggregateRun('run-1', 1),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseRuns.mockReturnValue({
      runs: [
        createAggregateRun('run-1', 1),
        createAggregateRun('run-2', 2),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage('/analysis/run-1/transcripts?modelId=model1&repeatPattern=stable&rowDim=Freedom&colDim=Harmony&conditionIds=High%7C%7CLow');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v2t0' } });

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-2/transcripts?modelId=model1&repeatPattern=stable&rowDim=Freedom&colDim=Harmony&conditionIds=High%7C%7CLow'
    );
  });
});
