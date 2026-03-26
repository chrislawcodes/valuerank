import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnalysisTranscripts } from '../../src/pages/AnalysisTranscripts';

const mockNavigate = vi.fn();
const mockUseRun = vi.fn();
const mockUseRuns = vi.fn();
const mockUseAnalysis = vi.fn();
const mockUpdateTranscriptDecision = vi.fn();
let lastTranscriptListProps: {
  transcripts: Array<{ id: string }>;
  decisionColumnLabel?: string;
  normalizedDecisionTranscriptIds?: Set<string>;
  decisionDisplayMode?: string;
} | null = null;
let lastTranscriptViewerProps: {
  transcript: { id: string };
  decisionDisplayMode?: string;
} | null = null;

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
  TranscriptList: (props: {
    transcripts: Array<{ id: string }>;
    decisionColumnLabel?: string;
    normalizedDecisionTranscriptIds?: Set<string>;
    decisionDisplayMode?: string;
  }) => {
    lastTranscriptListProps = props;
    return (
      <div data-testid="transcript-list">Transcript count: {props.transcripts.length}</div>
    );
  },
}));

vi.mock('../../src/components/runs/TranscriptViewer', () => ({
  TranscriptViewer: (props: { transcript: { id: string }; decisionDisplayMode?: string }) => {
    lastTranscriptViewerProps = props;
    return <div data-testid="transcript-viewer">Viewer transcript: {props.transcript.id}</div>;
  },
}));

function createRun(id: string, definitionVersion: number, overrides: Record<string, unknown> = {}) {
  const inputTranscripts = Array.isArray(overrides.transcripts)
    ? overrides.transcripts
    : [
        { id: 'tx-1', modelId: 'model1', scenarioId: 's1', decisionCode: 'A' },
        { id: 'tx-2', modelId: 'model1', scenarioId: 's2', decisionCode: 'A' },
        { id: 'tx-3', modelId: 'model2', scenarioId: 's3', decisionCode: 'B' },
      ];
  const transcripts = inputTranscripts.map((transcript) => ensureRenderableDecisionModel(transcript as Record<string, unknown>));

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
      content: {
        methodology: {
          family: 'job-choice',
          presentation_order: 'A_first',
        },
        components: {
          value_first: { token: 'freedom' },
          value_second: { token: 'harmony' },
        },
        dimensions: [
          { name: 'Freedom' },
          { name: 'Harmony' },
        ],
      },
    },
    ...overrides,
    transcripts,
  };
}

function createAggregateRun(id: string, definitionVersion: number) {
  return createRun(id, definitionVersion, {
    tags: [{ name: 'Aggregate' }],
  });
}

function createRenderableDecisionModelV2() {
  return {
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
      rawScore: null,
      canonicalScore: null,
    },
  };
}

function ensureRenderableDecisionModel(transcript: Record<string, unknown>) {
  if (Object.prototype.hasOwnProperty.call(transcript, 'decisionModelV2')) {
    return transcript;
  }

  return {
    ...transcript,
    decisionModelV2: createRenderableDecisionModelV2(),
  };
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

function createPairedAnalysis(
  scenarios: Array<{ id: string; row: string; col: string; score: number }>,
  orientationCorrectedIds: string[] = [],
) {
  const perScenario = Object.fromEntries(
    scenarios.map((scenario) => [
      scenario.id,
      {
        sampleCount: 1,
        mean: scenario.score,
        stdDev: 0,
        variance: 0,
        min: scenario.score,
        max: scenario.score,
        range: 0,
        ...(orientationCorrectedIds.includes(scenario.id) ? { orientationCorrected: true } : {}),
      },
    ]),
  );

  return {
    analysisType: 'basic',
    varianceAnalysis: {
      isMultiSample: true,
      samplesPerScenario: 1,
      orientationCorrectedCount: orientationCorrectedIds.length,
      perModel: {
        model1: {
          totalSamples: scenarios.length,
          uniqueScenarios: scenarios.length,
          samplesPerScenario: 1,
          avgWithinScenarioVariance: 0,
          maxWithinScenarioVariance: 0,
          consistencyScore: 1,
          perScenario,
        },
      },
      mostVariableScenarios: [],
      leastVariableScenarios: [],
    },
    visualizationData: {
      decisionDistribution: {},
      modelScenarioMatrix: {
        model1: Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.score])),
      },
      scenarioDimensions: Object.fromEntries(
        scenarios.map((scenario) => [
          scenario.id,
          { Freedom: scenario.row, Harmony: scenario.col },
        ]),
      ),
    },
  };
}

describe('AnalysisTranscripts', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseRun.mockReset();
    mockUseRuns.mockReset();
    mockUseAnalysis.mockReset();
    mockUpdateTranscriptDecision.mockReset();
    lastTranscriptListProps = null;
    lastTranscriptViewerProps = null;

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
        varianceAnalysis: {
          isMultiSample: true,
          samplesPerScenario: 1,
          orientationCorrectedCount: 1,
          perModel: {
            model1: {
              totalSamples: 2,
              uniqueScenarios: 2,
              samplesPerScenario: 1,
              avgWithinScenarioVariance: 0,
              maxWithinScenarioVariance: 0,
              consistencyScore: 1,
              perScenario: {
                s1: { sampleCount: 1, mean: 1, stdDev: 0, variance: 0, min: 1, max: 1, range: 0 },
                s2: { sampleCount: 1, mean: 2, stdDev: 0, variance: 0, min: 2, max: 2, range: 0, orientationCorrected: true },
              },
            },
          },
          mostVariableScenarios: [],
          leastVariableScenarios: [],
        },
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
    expect(headerMeta).toHaveTextContent('Decision summary: Strongly favors Benevolence Dependability');
    expect(screen.queryByText('Decision: 1')).not.toBeInTheDocument();
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

  it('filters transcript drilldown by orientation bucket in paired split inspection', () => {
    renderPage('/analysis/run-1/transcripts?mode=paired&rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1&orientationBucket=canonical');

    expect(screen.getByText(/Split inspection is active/i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'Split inspection is active for the Freedom -> Harmony side of the paired vignette.')).toBeInTheDocument();
    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 1');
  });

  it('filters blended paired clickthrough to matching transcripts across both orders', () => {
    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-2') {
        return {
          run: createRun('run-2', 1, {
            definition: {
              id: 'def-2',
              name: 'Harmony -> Freedom',
              content: {
                methodology: {
                  family: 'job-choice',
                  presentation_order: 'B_first',
                },
                template: 'Choose between [Harmony] and [Freedom].',
                components: {
                  value_first: { token: 'harmony' },
                  value_second: { token: 'freedom' },
                },
                dimensions: [
                  { name: 'Freedom' },
                  { name: 'Harmony' },
                ],
              },
            },
            transcripts: [
              { id: 'tx-4', modelId: 'model1', scenarioId: 's4', decisionCode: 'A' },
              { id: 'tx-5', modelId: 'model1', scenarioId: 's5', decisionCode: 'A' },
            ],
          }),
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        run: createRun('run-1', 1, {
          transcripts: [
            { id: 'tx-1', modelId: 'model1', scenarioId: 's1', decisionCode: 'A' },
            { id: 'tx-2', modelId: 'model1', scenarioId: 's2', decisionCode: 'A' },
          ],
        }),
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string }) => {
      if (args?.runId === 'run-2') {
        return {
          analysis: createPairedAnalysis([
            { id: 's4', row: 'High', col: 'Low', score: 1 },
            { id: 's5', row: 'Low', col: 'High', score: 5 },
          ], ['s4', 's5']),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createPairedAnalysis([
          { id: 's1', row: 'High', col: 'Low', score: 5 },
          { id: 's2', row: 'Low', col: 'High', score: 1 },
        ]),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/transcripts?mode=paired&companionRunId=run-2&modelId=model1&pairedValueKey=freedom&pairedValueLabel=Freedom&pairView=blended');

    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 2');
  });

  it('filters blended paired condition clickthrough across both companion runs', () => {
    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-2') {
        return {
          run: createRun('run-2', 1, {
            definition: {
              id: 'def-2',
              name: 'Harmony -> Freedom',
              content: {
                methodology: {
                  family: 'job-choice',
                  presentation_order: 'B_first',
                },
                components: {
                  value_first: { token: 'harmony' },
                  value_second: { token: 'freedom' },
                },
                dimensions: [
                  { name: 'Freedom' },
                  { name: 'Harmony' },
                ],
              },
            },
            transcripts: [
              { id: 'tx-4', modelId: 'model1', scenarioId: 's4', decisionCode: 'A' },
            ],
          }),
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        run: createRun('run-1', 1, {
          transcripts: [
            { id: 'tx-1', modelId: 'model1', scenarioId: 's1', decisionCode: 'A' },
          ],
        }),
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string }) => {
      if (args?.runId === 'run-2') {
        return {
          analysis: createPairedAnalysis([
            { id: 's4', row: 'High', col: 'Low', score: 5 },
          ], ['s4']),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createPairedAnalysis([
          { id: 's1', row: 'High', col: 'Low', score: 1 },
        ]),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/transcripts?mode=paired&companionRunId=run-2&pairView=condition-blended&rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1');

    expect(screen.getByText(/Blended paired inspection is active for this condition cell/i)).toBeInTheDocument();
    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 2');
  });

  it('filters paired condition clickthrough by exact decision code when requested', () => {
    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-2') {
        return {
          run: createRun('run-2', 1, {
            definition: {
              id: 'def-2',
              name: 'Harmony -> Freedom',
              content: {
                methodology: {
                  family: 'job-choice',
                  presentation_order: 'B_first',
                },
                components: {
                  value_first: { token: 'harmony' },
                  value_second: { token: 'freedom' },
                },
                dimensions: [
                  { name: 'Freedom' },
                  { name: 'Harmony' },
                ],
              },
            },
            transcripts: [
              { id: 'tx-4', modelId: 'model1', scenarioId: 's4', decisionCode: '1' },
            ],
          }),
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        run: createRun('run-1', 1, {
          transcripts: [
            { id: 'tx-1', modelId: 'model1', scenarioId: 's1', decisionCode: '5' },
            { id: 'tx-2', modelId: 'model1', scenarioId: 's1', decisionCode: '1' },
          ],
        }),
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string }) => {
      if (args?.runId === 'run-2') {
        return {
          analysis: createPairedAnalysis([
            { id: 's4', row: 'High', col: 'Low', score: 1 },
          ], ['s4']),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createPairedAnalysis([
          { id: 's1', row: 'High', col: 'Low', score: 5 },
        ]),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/transcripts?mode=paired&companionRunId=run-2&pairView=condition-blended&rowDim=Freedom&colDim=Harmony&row=High&col=Low&modelId=model1&decisionCode=1');

    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 2');
  });

  it('filters pooled paired decision-bucket clickthrough across both orders', () => {
    mockUseRun.mockImplementation((args?: { id?: string }) => {
      if (args?.id === 'run-2') {
        return {
          run: createRun('run-2', 1, {
            definition: {
              id: 'def-2',
              name: 'Harmony -> Freedom',
              content: {
                methodology: {
                  family: 'job-choice',
                  presentation_order: 'B_first',
                },
                template: 'Choose between [Harmony] and [Freedom].',
                components: {
                  value_first: { token: 'harmony' },
                  value_second: { token: 'freedom' },
                },
                dimensions: [
                  { name: 'Freedom' },
                  { name: 'Harmony' },
                ],
              },
            },
            transcripts: [
              { id: 'tx-4', modelId: 'model1', scenarioId: 's4', decisionCode: 'A' },
              { id: 'tx-5', modelId: 'model1', scenarioId: 's5', decisionCode: 'A' },
            ],
          }),
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      }

      return {
        run: createRun('run-1', 1, {
          transcripts: [
            { id: 'tx-1', modelId: 'model1', scenarioId: 's1', decisionCode: 'A' },
            { id: 'tx-2', modelId: 'model1', scenarioId: 's2', decisionCode: 'A' },
          ],
        }),
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    mockUseAnalysis.mockImplementation((args?: { runId?: string }) => {
      if (args?.runId === 'run-2') {
        return {
          analysis: createPairedAnalysis([
            { id: 's4', row: 'High', col: 'Low', score: 5 },
            { id: 's5', row: 'Low', col: 'High', score: 1 },
          ], ['s4', 's5']),
          loading: false,
          error: null,
          refetch: vi.fn(),
          recompute: vi.fn(),
          recomputing: false,
        };
      }

      return {
        analysis: createPairedAnalysis([
          { id: 's1', row: 'High', col: 'Low', score: 5 },
          { id: 's2', row: 'Low', col: 'High', score: 1 },
        ]),
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      };
    });

    renderPage('/analysis/run-1/transcripts?mode=paired&companionRunId=run-2&modelId=model1&pairedDecisionBucket=b&pairedValueLabel=Harmony&pairView=blended');

    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 2');
  });

  it('filters reversed-order clickthrough to the flipped companion transcripts', () => {
    mockUseRun.mockReturnValue({
      run: createRun('run-2', 1, {
        definition: {
          id: 'def-2',
          name: 'Harmony -> Freedom',
          content: {
            methodology: {
              family: 'job-choice',
              presentation_order: 'B_first',
            },
            template: 'Choose between [Harmony] and [Freedom].',
            components: {
              value_first: { token: 'harmony' },
              value_second: { token: 'freedom' },
            },
            dimensions: [
              { name: 'Freedom' },
              { name: 'Harmony' },
            ],
          },
        },
        transcripts: [
          { id: 'tx-4', runId: 'run-2', modelId: 'model1', scenarioId: 's4', decisionCode: 'A' },
          { id: 'tx-5', runId: 'run-2', modelId: 'model1', scenarioId: 's5', decisionCode: 'A' },
        ],
      }),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseAnalysis.mockReturnValue({
      analysis: createPairedAnalysis([
        { id: 's4', row: 'High', col: 'Low', score: 1 },
        { id: 's5', row: 'Low', col: 'High', score: 5 },
      ], ['s4', 's5']),
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    renderPage('/analysis/run-2/transcripts?mode=paired&rowDim=Freedom&colDim=Harmony&modelId=model1&decisionBucket=a&orientationBucket=flipped');

    expect(screen.getByText(/Split inspection is active/i)).toBeInTheDocument();
    expect(screen.getByTestId('transcript-list')).toHaveTextContent('Transcript count: 1');
    expect(lastTranscriptListProps?.decisionColumnLabel).toBe('Decision summary');
    expect(lastTranscriptListProps?.normalizedDecisionTranscriptIds).toEqual(new Set());
  });

  it('switches transcript audit surfaces to canonical decision mode when V2 data is present', async () => {
    mockUseRun.mockReturnValue({
      run: createRun('run-3', 1, {
        transcripts: [
          {
            id: 'tx-10',
            runId: 'run-3',
            modelId: 'model1',
            scenarioId: 's10',
            decisionCode: '1',
            decisionModelV2: {
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
                rawScore: null,
                canonicalScore: null,
              },
            },
          },
        ],
      }),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseAnalysis.mockReturnValue({
      analysis: createPairedAnalysis([{ id: 's10', row: 'High', col: 'Low', score: 1 }], ['s10']),
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    renderPage('/analysis/run-3/transcripts?mode=paired&rowDim=Freedom&colDim=Harmony&modelId=model1&transcriptId=tx-10');

    await waitFor(() => {
      expect(lastTranscriptListProps?.decisionColumnLabel).toBe('Decision summary');
      expect(lastTranscriptListProps?.decisionDisplayMode).toBe('audit');
      expect(lastTranscriptViewerProps?.decisionDisplayMode).toBe('audit');
    });
  });

  it('throws when a mixed legacy and canonical transcript set reaches the report surface', () => {
    mockUseRun.mockReturnValue({
      run: createRun('run-4', 1, {
        transcripts: [
          {
            id: 'tx-11',
            runId: 'run-4',
            modelId: 'model1',
            scenarioId: 's11',
            decisionCode: '1',
            decisionModelV2: {
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
                rawScore: null,
                canonicalScore: null,
              },
            },
          },
          {
            id: 'tx-12',
            runId: 'run-4',
            modelId: 'model1',
            scenarioId: 's12',
            decisionCode: '4',
            decisionModelV2: null,
          },
        ],
      }),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseAnalysis.mockReturnValue({
      analysis: createPairedAnalysis([
        { id: 's11', row: 'High', col: 'Low', score: 1 },
        { id: 's12', row: 'High', col: 'Low', score: 4 },
      ]),
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    expect(() => renderPage('/analysis/run-4/transcripts?modelId=model1&repeatPattern=stable&rowDim=Freedom&colDim=Harmony&conditionIds=High%7C%7CLow')).toThrow(
      /AnalysisTranscripts page requires canonical decision-model-v2 data for transcript tx-12/,
    );
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
