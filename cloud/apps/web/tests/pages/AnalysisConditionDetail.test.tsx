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
  useRuns: (args: unknown) => mockUseRuns(args),
}));

vi.mock('../../src/hooks/useAnalysis', () => ({
  useAnalysis: (args?: { runId?: string; pause?: boolean }) => mockUseAnalysis(args),
}));

function createTranscript(
  id: string,
  scenarioId: string,
  presentationOrder: 'A_first' | 'B_first',
  decisionCode: string | null,
  valuePair?: {
    favoredValueKey: string;
    opposedValueKey: string;
  },
) {
  const firstValueKey = presentationOrder === 'A_first' ? 'Freedom' : 'Harmony';
  const secondValueKey = presentationOrder === 'A_first' ? 'Harmony' : 'Freedom';
  const favoredValueKey = valuePair?.favoredValueKey ?? firstValueKey;
  const opposedValueKey = valuePair?.opposedValueKey ?? secondValueKey;

  const decisionModelV2 = decisionCode === '5'
    ? {
        raw: {
          matchedText: favoredValueKey,
          matchedLabel: favoredValueKey,
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          parserVersion: 'v1',
          responseExcerpt: favoredValueKey,
          manualOverride: null,
        },
        canonical: {
          favoredValueKey,
          opposedValueKey,
          direction: 'favor_first',
          strength: 'strong',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'deterministic',
        },
        legacy: {
          },
      }
      : decisionCode === '1'
      ? {
          raw: {
            matchedText: opposedValueKey,
            matchedLabel: opposedValueKey,
            parseClass: 'exact',
            parsePath: 'exact.favor_second.strong',
            parserVersion: 'v1',
            responseExcerpt: opposedValueKey,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: opposedValueKey,
            opposedValueKey: favoredValueKey,
            direction: 'favor_second',
            strength: 'strong',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: {
            },
        }
      : null;

  return {
    id,
    runId: id.startsWith('tx-') ? 'run-1' : id,
    scenarioId,
    modelId: 'model1',
    modelVersion: 'test-model',
    content: {
      turns: [],
      decisionCode: decisionCode ?? '5',
      decision: decisionCode ?? '5',
      score: decisionCode ?? '5',
      summary: {
        decisionCode: decisionCode ?? '5',
        decision: decisionCode ?? '5',
        score: decisionCode ?? '5',
      },
    },
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

  const renderableDecisionModelV2 = {
    raw: {
      matchedText: 'Achievement',
      matchedLabel: 'Achievement',
      parseClass: 'exact',
      parsePath: 'exact.favor_second.strong',
      parserVersion: 'v1',
      responseExcerpt: 'Achievement',
      manualOverride: null,
    },
    canonical: {
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'strong',
      normalizationApplied: true,
      normalizationReason: 'orientation_flipped',
      source: 'deterministic',
    },
    legacy: {
      },
  };

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
      decisionModelV2: Object.prototype.hasOwnProperty.call(transcript, 'decisionModelV2')
        ? (transcript as Record<string, unknown>).decisionModelV2
        : renderableDecisionModelV2,
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
      createTranscript('tx-unknown', 's1', 'A_first', '1'),
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

  it('renders paired condition rows with source-based labels', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    expect(screen.getByText('Condition Detail')).toBeInTheDocument();
    expect(screen.getByText('Freedom = High, Harmony = Low')).toBeInTheDocument();
    expect(screen.getByText('model1')).toBeInTheDocument();
    expect(screen.getByText('Pooled')).toBeInTheDocument();
    expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
    expect(screen.getByText('Harmony -> Freedom')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Freedom')).toBeInTheDocument();
    expect(screen.getByText('Somewhat favors Freedom')).toBeInTheDocument();
    expect(screen.getByText('Neutral')).toBeInTheDocument();
    expect(screen.getByText('Somewhat favors Harmony')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Harmony')).toBeInTheDocument();
    expect(screen.getByText('Unknown Count')).toBeInTheDocument();
    expect(screen.queryByText('Mean')).not.toBeInTheDocument();
    expect(screen.getByText('Canonical transcript counts by decision label. Click any non-zero count to open the matching transcripts.')).toBeInTheDocument();
    const row = screen.getByText('Pooled').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('prefers the current vignette labels over the pooled row in paired mode', () => {
    const currentRun = createRun('run-1', 'A_first', [
      createTranscript(
        'tx-1',
        's1',
        'A_first',
        '5',
        {
          favoredValueKey: 'Conformity_Interpersonal',
          opposedValueKey: 'Achievement',
        },
      ),
    ]);
    const companionRun = createRun('run-2', 'B_first', [
      createTranscript(
        'tx-2',
        's2',
        'B_first',
        '5',
        {
          favoredValueKey: 'Achievement',
          opposedValueKey: 'Conformity_Interpersonal',
        },
      ),
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

    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.replace(/\s+/g, ' ').trim() ?? '');

    // Achievement < Conformity_Interpersonal alphabetically → Achievement is canonical "first" (blue)
    expect(headers.slice(1, 6)).toEqual([
      'Strongly favors Achievement',
      'Somewhat favors Achievement',
      'Neutral',
      'Somewhat favors Conformity Interpersonal',
      'Strongly favors Conformity Interpersonal',
    ]);
  });

  it('falls back to a later paired row when the preferred row has no resolved label pair', () => {
    const currentRun = createRun('run-1', 'A_first', []);
    const companionRun = createRun('run-2', 'B_first', [
      createTranscript(
        'tx-2',
        's2',
        'B_first',
        '5',
        {
          favoredValueKey: 'Conformity_Interpersonal',
          opposedValueKey: 'Achievement',
        },
      ),
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

    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.replace(/\s+/g, ' ').trim() ?? '');

    expect(headers.slice(1, 6)).toEqual([
      'Strongly favors Achievement',
      'Somewhat favors Achievement',
      'Neutral',
      'Somewhat favors Conformity Interpersonal',
      'Strongly favors Conformity Interpersonal',
    ]);
  });

  it('routes a pooled row count click to the matching transcript slice', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');
    const row = screen.getByText('Pooled').closest('tr');
    expect(row).not.toBeNull();

    const buttons = within(row as HTMLElement).getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&modelId=model1&mode=paired&companionRunId=run-2&pairView=condition-blended&sourceRun=pooled&decisionStrength=strong&favoredValueKey=Freedom'
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

  it('renders paired canonical buckets without unresolved transcripts', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    expect(screen.getByText('Condition Detail')).toBeInTheDocument();
    expect(screen.getByText('Freedom = High, Harmony = Low')).toBeInTheDocument();
    expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Freedom')).toBeInTheDocument();
    expect(screen.getByText('Somewhat favors Freedom')).toBeInTheDocument();
    expect(screen.getByText('Neutral')).toBeInTheDocument();
    expect(screen.getByText('Somewhat favors Harmony')).toBeInTheDocument();
    expect(screen.getByText('Strongly favors Harmony')).toBeInTheDocument();

    const row = screen.getByText('Freedom -> Harmony').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('routes a current row bucket click to the matching transcript slice', () => {
    renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

    const row = screen.getByText('Freedom -> Harmony').closest('tr');
    expect(row).not.toBeNull();

    const button = within(row as HTMLElement).getAllByRole('button', { name: '1' })[0];
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&modelId=model1&mode=paired&companionRunId=run-2&pairView=condition-split&sourceRun=current&decisionStrength=strong&favoredValueKey=Freedom'
    );
  });

  it('renders the same canonical summary in single mode and ignores legacy score fields', () => {
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
            createTranscript('tx-unknown', 's1', 'A_first', '1'),
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

    const row = screen.getByText('Freedom -> Harmony').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('throws when a condition report row includes a legacy-only transcript', () => {
    mockUseRun.mockReturnValue({
      run: createRun('run-1', 'A_first', [
        { id: 'tx-legacy', scenarioId: 's1', decisionCode: '5', decisionModelV2: null } as any,
      ]),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    expect(() => renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired')).toThrow(
      /AnalysisConditionDetail page: transcript tx-legacy is missing renderable canonical decisionModelV2 data\./,
    );
  });

  describe('companion run resolution', () => {
    it('uses direct companionRunId from run data and skips the heuristic runs search', () => {
      const currentRun = {
        ...createRun('run-1', 'A_first', [
          createTranscript('tx-1', 's1', 'A_first', '5'),
        ]),
        // Direct companion link — this is what the paired launch path writes
        companionRunId: 'run-2',
      };
      const companionRun = createRun('run-2', 'B_first', [
        createTranscript('tx-2', 's2', 'B_first', '1'),
      ]);

      mockUseRun.mockImplementation((args?: { id?: string }) => {
        if (args?.id === 'run-2') {
          return { run: companionRun, loading: false, error: null, refetch: vi.fn() };
        }
        return { run: currentRun, loading: false, error: null, refetch: vi.fn() };
      });

      mockUseAnalysis.mockImplementation((args?: { runId?: string; pause?: boolean }) => {
        if (args?.pause) return { analysis: null, loading: false, error: null, refetch: vi.fn(), recompute: vi.fn(), recomputing: false };
        if (args?.runId === 'run-2') return { analysis: createAnalysis('run-2', 's2'), loading: false, error: null, refetch: vi.fn(), recompute: vi.fn(), recomputing: false };
        return { analysis: createAnalysis('run-1', 's1'), loading: false, error: null, refetch: vi.fn(), recompute: vi.fn(), recomputing: false };
      });

      // Do NOT include companionRunId in the URL — it must come from run.companionRunId
      renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

      // Paired rows must appear (companion was resolved via direct link)
      expect(screen.getByText('Pooled')).toBeInTheDocument();
      expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
      expect(screen.getByText('Harmony -> Freedom')).toBeInTheDocument();

      // useRuns must have been paused — heuristic search should NOT run
      expect(mockUseRuns).toHaveBeenCalled();
      expect(
        (mockUseRuns.mock.calls as Array<[{ pause?: boolean }]>).every(([args]) => args?.pause === true),
      ).toBe(true);
    });

    it('falls back to heuristic search when companionRunId is absent from the run', () => {
      // currentRun has NO companionRunId — legacy run scenario
      const currentRun = createRun('run-1', 'A_first', [
        createTranscript('tx-1', 's1', 'A_first', '5'),
      ]);
      const companionRun = createRun('run-2', 'B_first', [
        createTranscript('tx-2', 's2', 'B_first', '1'),
      ]);

      mockUseRun.mockImplementation((args?: { id?: string }) => {
        if (args?.id === 'run-2') {
          return { run: companionRun, loading: false, error: null, refetch: vi.fn() };
        }
        return { run: currentRun, loading: false, error: null, refetch: vi.fn() };
      });

      mockUseAnalysis.mockImplementation((args?: { runId?: string; pause?: boolean }) => {
        if (args?.pause) return { analysis: null, loading: false, error: null, refetch: vi.fn(), recompute: vi.fn(), recomputing: false };
        if (args?.runId === 'run-2') return { analysis: createAnalysis('run-2', 's2'), loading: false, error: null, refetch: vi.fn(), recompute: vi.fn(), recomputing: false };
        return { analysis: createAnalysis('run-1', 's1'), loading: false, error: null, refetch: vi.fn(), recompute: vi.fn(), recomputing: false };
      });

      // No companionRunId in URL and none on run — must use heuristic
      renderPage('/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired');

      // Paired rows must appear (companion found by heuristic via batchGroupId)
      expect(screen.getByText('Pooled')).toBeInTheDocument();
      expect(screen.getByText('Freedom -> Harmony')).toBeInTheDocument();
      expect(screen.getByText('Harmony -> Freedom')).toBeInTheDocument();

      // useRuns must NOT have been fully paused — heuristic search must run
      expect(mockUseRuns).toHaveBeenCalled();
      expect(
        (mockUseRuns.mock.calls as Array<[{ pause?: boolean }]>).some(([args]) => args?.pause !== true),
      ).toBe(true);
    });
  });
});
