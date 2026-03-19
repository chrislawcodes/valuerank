/**
 * AnalysisPanel Component Tests
 *
 * Tests for the analysis panel display component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisPanel } from '../../../src/components/analysis/AnalysisPanel';
import type { AnalysisResult } from '../../../src/api/operations/analysis';

// Mock the useAnalysis hook
vi.mock('../../../src/hooks/useAnalysis', () => ({
  useAnalysis: vi.fn(),
}));

import { useAnalysis } from '../../../src/hooks/useAnalysis';
const mockUseAnalysis = vi.mocked(useAnalysis);

function createMockAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    id: 'analysis-1',
    runId: 'run-1',
    analysisType: 'basic',
    status: 'CURRENT',
    codeVersion: '1.0.0',
    inputHash: 'abc123',
    createdAt: '2024-01-15T10:00:00Z',
    computedAt: '2024-01-15T10:00:05Z',
    durationMs: 5000,
    perModel: {
      'gpt-4': {
        sampleSize: 50,
        values: {
          'Physical_Safety': {
            winRate: 0.8,
            confidenceInterval: { lower: 0.7, upper: 0.9, level: 0.95, method: 'wilson' },
            count: { prioritized: 40, deprioritized: 10, neutral: 0 },
          },
          'Compassion': {
            winRate: 0.6,
            confidenceInterval: { lower: 0.5, upper: 0.7, level: 0.95, method: 'wilson' },
            count: { prioritized: 30, deprioritized: 20, neutral: 0 },
          },
        },
        overall: { mean: 0.7, stdDev: 0.15, min: 0.4, max: 0.9 },
      },
      'claude-3': {
        sampleSize: 50,
        values: {
          'Physical_Safety': {
            winRate: 0.75,
            confidenceInterval: { lower: 0.65, upper: 0.85, level: 0.95, method: 'wilson' },
            count: { prioritized: 38, deprioritized: 12, neutral: 0 },
          },
        },
        overall: { mean: 0.65, stdDev: 0.12, min: 0.45, max: 0.85 },
      },
    },
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0.85,
    },

    visualizationData: null,
    varianceAnalysis: null,
    dimensionAnalysis: null,
    mostContestedScenarios: [],
    methodsUsed: {
      winRateCI: 'wilson_score',
      modelComparison: 'spearman_rho',
      pValueCorrection: 'holm_bonferroni',
      effectSize: 'cohens_d',
      dimensionTest: 'kruskal_wallis',
      alpha: 0.05,
      codeVersion: '1.0.0',
    },
    warnings: [],
    ...overrides,
  };
}

describe('AnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading analysis...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: new Error('Failed to load'),
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Failed to load analysis/)).toBeInTheDocument();
  });

  it('renders pending state when analysis is pending', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" analysisStatus="pending" />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis Pending')).toBeInTheDocument();
  });

  it('renders computing state when analysis is computing', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" analysisStatus="computing" />
      </MemoryRouter>
    );

    expect(screen.getByText('Computing Analysis...')).toBeInTheDocument();
  });

  it('renders empty state when no analysis available', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis Not Available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze Trial/i })).toBeInTheDocument();
  });

  it('calls recompute when Run Analysis button is clicked', () => {
    const recompute = vi.fn().mockResolvedValue(undefined);
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute,
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Analyze Trial/i }));
    expect(recompute).toHaveBeenCalled();
  });

  it('shows computed time in details instead of the header', async () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.queryByText(/Computed/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));
    expect(screen.getByText(/Computed/)).toBeInTheDocument();
  });

  it('renders the mode toggle in the header and hides removed export actions', async () => {
    const analysis = createMockAnalysis();
    const onModeChange = vi.fn();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel
          runId="run-1"
          analysisMode="single"
          onAnalysisModeChange={onModeChange}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /single vignette/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /paired vignettes/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /csv feed/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /paired vignettes/i }));
    expect(onModeChange).toHaveBeenCalledWith('paired');

    await userEvent.click(screen.getByRole('button', { name: /single vignette/i }));
    expect(onModeChange).toHaveBeenNthCalledWith(2, 'single');
  });

  it('pools overview summary semantics across the companion run in paired mode', () => {
    const analysis = createMockAnalysis({
      codeVersion: '1.1.1',
      preferenceSummary: {
        perModel: {
          'claude-3': {
            preferenceDirection: {
              byValue: {
                Achievement: {
                  winRate: 0.9,
                  count: { prioritized: 9, deprioritized: 1, neutral: 0 },
                },
                Care: {
                  winRate: 0.2,
                  count: { prioritized: 2, deprioritized: 8, neutral: 0 },
                },
              },
              overallLean: 'A',
              overallSignedCenter: 0.6,
            },
            preferenceStrength: 0.9,
          },
          'gpt-4': {
            preferenceDirection: {
              byValue: {
                Achievement: {
                  winRate: 0.8,
                  count: { prioritized: 8, deprioritized: 2, neutral: 0 },
                },
                Care: {
                  winRate: 0.3,
                  count: { prioritized: 3, deprioritized: 7, neutral: 0 },
                },
              },
              overallLean: 'A',
              overallSignedCenter: 0.4,
            },
            preferenceStrength: 0.8,
          },
        },
      },
      reliabilitySummary: {
        perModel: {
          'claude-3': {
            baselineNoise: 0.2,
            baselineReliability: 0.8,
            directionalAgreement: 0.8,
            neutralShare: 0.1,
            coverageCount: 4,
            uniqueScenarios: 4,
          },
          'gpt-4': {
            baselineNoise: 0.2,
            baselineReliability: 0.8,
            directionalAgreement: 0.75,
            neutralShare: 0.1,
            coverageCount: 4,
            uniqueScenarios: 4,
          },
        },
      },
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          s1: { Achievement: 'low', Care: 'high' },
        },
        modelScenarioMatrix: {
          'claude-3': { s1: 5 },
          'gpt-4': { s1: 4 },
        },
      },
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 4,
        orientationCorrectedCount: 1,
        perModel: {
          'claude-3': {
            totalSamples: 4,
            uniqueScenarios: 1,
            samplesPerScenario: 4,
            avgWithinScenarioVariance: 0.1,
            maxWithinScenarioVariance: 0.1,
            consistencyScore: 0.9,
            perScenario: {
              s1: {
                sampleCount: 4,
                mean: 4.5,
                stdDev: 0.2,
                variance: 0.04,
                min: 4,
                max: 5,
                range: 1,
                directionalAgreement: 0.8,
                medianSignedDistance: 0.9,
                neutralShare: 0,
              },
            },
          },
          'gpt-4': {
            totalSamples: 4,
            uniqueScenarios: 1,
            samplesPerScenario: 4,
            avgWithinScenarioVariance: 0.1,
            maxWithinScenarioVariance: 0.1,
            consistencyScore: 0.9,
            perScenario: {
              s1: {
                sampleCount: 4,
                mean: 4.2,
                stdDev: 0.2,
                variance: 0.04,
                min: 4,
                max: 5,
                range: 1,
                directionalAgreement: 0.75,
                medianSignedDistance: 0.7,
                neutralShare: 0,
              },
            },
          },
        },
        mostVariableScenarios: [],
        leastVariableScenarios: [],
      },
    });
    const companionAnalysis = createMockAnalysis({
      runId: 'run-2',
      codeVersion: '1.1.1',
      preferenceSummary: {
        perModel: {
          'claude-3': {
            preferenceDirection: {
              byValue: {
                Achievement: {
                  winRate: 0.1,
                  count: { prioritized: 1, deprioritized: 9, neutral: 0 },
                },
                Care: {
                  winRate: 0.8,
                  count: { prioritized: 8, deprioritized: 2, neutral: 0 },
                },
              },
              overallLean: 'B',
              overallSignedCenter: -0.5,
            },
            preferenceStrength: 1.0,
          },
          'gpt-4': {
            preferenceDirection: {
              byValue: {
                Achievement: {
                  winRate: 0.2,
                  count: { prioritized: 2, deprioritized: 8, neutral: 0 },
                },
                Care: {
                  winRate: 0.9,
                  count: { prioritized: 9, deprioritized: 1, neutral: 0 },
                },
              },
              overallLean: 'B',
              overallSignedCenter: -0.6,
            },
            preferenceStrength: 1.0,
          },
        },
      },
      reliabilitySummary: {
        perModel: {
          'claude-3': {
            baselineNoise: 0.2,
            baselineReliability: 0.9,
            directionalAgreement: 0.9,
            neutralShare: 0.1,
            coverageCount: 4,
            uniqueScenarios: 4,
          },
          'gpt-4': {
            baselineNoise: 0.2,
            baselineReliability: 0.85,
            directionalAgreement: 0.85,
            neutralShare: 0.1,
            coverageCount: 4,
            uniqueScenarios: 4,
          },
        },
      },
    });

    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel
          runId="run-1"
          analysisMode="paired"
          companionAnalysis={companionAnalysis}
        />
      </MemoryRouter>
    );

    const claudeRow = screen.getAllByText('claude-3')[0]?.closest('tr');
    const gptRow = screen.getAllByText('gpt-4')[0]?.closest('tr');

    expect(claudeRow).not.toBeNull();
    expect(gptRow).not.toBeNull();
    expect(within(claudeRow as HTMLTableRowElement).getByText('Moderate (+0.05)')).toBeInTheDocument();
    expect(within(gptRow as HTMLTableRowElement).getByText('Moderate (−0.10)')).toBeInTheDocument();
    expect(screen.getByText('Run-level evidence: pooled across 2 companion runs')).toBeInTheDocument();
  });

  it('pools Decisions tab distribution data across the companion run in paired mode', async () => {
    const analysis = createMockAnalysis({
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          s1: { Freedom: 'high', Harmony: 'low' },
        },
        modelScenarioMatrix: {
          'gpt-4': { s1: 5 },
        },
      },
    });

    const companionAnalysis = createMockAnalysis({
      id: 'analysis-2',
      runId: 'run-2',
      visualizationData: {
        decisionDistribution: {
          'gpt-4': { '1': 3, '5': 1 },
        },
        scenarioDimensions: {
          s2: { Freedom: 'high', Harmony: 'low' },
        },
        modelScenarioMatrix: {
          'gpt-4': { s2: 1 },
        },
      },
    });

    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel
          runId="run-1"
          analysisMode="paired"
          companionAnalysis={companionAnalysis}
        />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Decisions' }));

    expect(screen.queryByText(/uses pooled companion data for decision mix and baseline reliability when that data is available/i)).not.toBeInTheDocument();
    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
    expect(screen.queryByText('No decision distribution data available')).not.toBeInTheDocument();
  });

  it('keeps decision coverage details hidden until expanded', () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" analysisMode="paired" />
      </MemoryRouter>
    );

    expect(screen.queryByText('Decision Coverage')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^details$/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows decision coverage and evidence details when expanded', async () => {
    const analysis = createMockAnalysis({
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {},
        modelScenarioMatrix: {
          'gpt-4': { 'scenario-1': 2, 'scenario-2': 4 },
          'claude-3': { 'scenario-1': 2, 'scenario-2': 3 },
        },
      },
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel
          runId="run-1"
          analysisMode="paired"
          transcripts={[
            {
              id: 't1',
              runId: 'run-1',
              scenarioId: 'scenario-1',
              modelId: 'gpt-4',
              modelVersion: null,
              content: null,
              decisionCode: '4',
              decisionMetadata: { parseClass: 'exact' },
              turnCount: 1,
              tokenCount: 10,
              durationMs: 100,
              estimatedCost: null,
              createdAt: '2024-01-01T00:00:00Z',
              lastAccessedAt: null,
            },
            {
              id: 't2',
              runId: 'run-1',
              scenarioId: 'scenario-2',
              modelId: 'claude-3',
              modelVersion: null,
              content: null,
              decisionCode: null,
              decisionMetadata: null,
              turnCount: 1,
              tokenCount: 10,
              durationMs: 100,
              estimatedCost: null,
              createdAt: '2024-01-01T00:00:00Z',
              lastAccessedAt: null,
            },
          ]}
        />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));

    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Decision Coverage')).toBeInTheDocument();
    expect(screen.getByText(/Paired vignette summaries include 1 of 2 transcripts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unresolved transcript is currently excluded until manually adjudicated/i)).toBeInTheDocument();
    expect(screen.getByText(/Parser-scored: 1 \(1 exact, 0 fallback\) • Manually adjudicated: 0 • Legacy numeric: 0/i)).toBeInTheDocument();
    expect(screen.getByText('Evidence: 25 completed batches • 2 conditions per batch')).toBeInTheDocument();
  });

  it('shows paired scope copy in the scenarios tab', () => {
    const analysis = createMockAnalysis({
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          'scenario-1': { 'Dim A': '1', 'Dim B': '1' },
          'scenario-2': { 'Dim A': '2', 'Dim B': '2' },
        },
        modelScenarioMatrix: {
          'gpt-4': { 'scenario-1': 2, 'scenario-2': 4 },
        },
      },
      mostContestedScenarios: [],
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" analysisMode="paired" initialTab="scenarios" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Paired mode keeps the matched vignette context visible while you inspect the current pivot summary\./i)).toBeInTheDocument();
  });

  it('shows paired scope copy in the stability tab', () => {
    const analysis = createMockAnalysis({
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          'scenario-1': { 'Dim A': '1', 'Dim B': '1' },
          'scenario-2': { 'Dim A': '2', 'Dim B': '2' },
        },
        modelScenarioMatrix: {
          'gpt-4': { 'scenario-1': 2, 'scenario-2': 4 },
        },
      },
      varianceAnalysis: {
        orientationCorrectedCount: 0,
        perModel: {},
      } as any,
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" analysisMode="paired" initialTab="stability" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Paired mode keeps the matched vignette context visible while you review these stability metrics\./i)).toBeInTheDocument();
  });

  it('shows aggregate evidence details when expanded', async () => {
    const analysis = createMockAnalysis({
      analysisType: 'AGGREGATE',
      codeVersion: '1.2.0',
      aggregateMetadata: {
        aggregateEligibility: 'eligible_same_signature_baseline',
        aggregateIneligibilityReason: null,
        sourceRunCount: 4,
        sourceRunIds: ['run-a', 'run-b', 'run-c', 'run-d'],
        conditionCoverage: {
          plannedConditionCount: 2,
          observedConditionCount: 2,
          complete: true,
        },
        perModelRepeatCoverage: {},
        perModelDrift: {},
      },
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" isAggregate />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));

    expect(screen.getByText('Decision Coverage')).toBeInTheDocument();
    expect(screen.getByText('Evidence: 4 contributing source runs pooled')).toBeInTheDocument();
  });

  it('removes the old summary cards and paired scope copy from the top of the page', () => {
    const analysis = createMockAnalysis({
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 2,
        perModel: {},
        mostVariableScenarios: [],
        leastVariableScenarios: [],
        orientationCorrectedCount: 4,
      },
    } as any);
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" analysisMode="paired" />
      </MemoryRouter>
    );

    expect(screen.queryByText('Models')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Trials')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Orientation Pairs')).not.toBeInTheDocument();
    expect(screen.queryByText(/Paired vignette scope/i)).not.toBeInTheDocument();
  });

  it('keeps non-semantic tabs visible for ineligible aggregates', async () => {
    const user = userEvent.setup();
    const analysis = createMockAnalysis({
      analysisType: 'AGGREGATE',
      codeVersion: '1.2.0',
      aggregateMetadata: {
        aggregateEligibility: 'ineligible_run_type',
        aggregateIneligibilityReason: 'This aggregate mixes in assumption or manipulated runs.',
        sourceRunCount: 4,
        sourceRunIds: ['run-a', 'run-b', 'run-c', 'run-d'],
        conditionCoverage: {
          plannedConditionCount: 2,
          observedConditionCount: 2,
          complete: true,
        },
        perModelRepeatCoverage: {},
        perModelDrift: {},
      },
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          'scenario-1': { 'Dim A': '1', 'Dim B': '1' },
          'scenario-2': { 'Dim A': '2', 'Dim B': '2' },
        },
        modelScenarioMatrix: {
          'gpt-4': { 'scenario-1': 2, 'scenario-2': 4 },
          'claude-3': { 'scenario-1': 2, 'scenario-2': 3 },
        },
      },
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 2,
        perModel: {},
        mostVariableScenarios: [],
        leastVariableScenarios: [],
      },
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" isAggregate />
      </MemoryRouter>
    );

    expect(screen.getByText('This aggregate mixes in assumption or manipulated runs.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scenarios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stability' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scenarios' }));
    expect(screen.queryByText('Overview Summary')).not.toBeInTheDocument();
  });

  it('renders overview table titles', () => {
    const analysis = createMockAnalysis({
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          'scenario-1': { 'Dim A': '1', 'Dim B': '1' },
          'scenario-2': { 'Dim A': '2', 'Dim B': '2' },
        },
        modelScenarioMatrix: {
          'gpt-4': { 'scenario-1': 2, 'scenario-2': 4 },
          'claude-3': { 'scenario-1': 2, 'scenario-2': 3 },
        },
      },
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Condition Decisions')).toBeInTheDocument();
  });

  it('does not render removed tabs', () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /^Agreement$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Methods$/i })).not.toBeInTheDocument();
  });

  it('renders warnings when present', () => {
    const analysis = createMockAnalysis({
      warnings: [
        {
          code: 'NO_DIMENSIONS',
          message: 'No scenario dimensions found in transcripts',
          recommendation: 'Variable impact analysis will be empty',
        },
      ],
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('No scenario dimensions found in transcripts')).toBeInTheDocument();
    expect(screen.getByText('Variable impact analysis will be empty')).toBeInTheDocument();
  });

  it('does not render low-sample warnings', () => {
    const analysis = createMockAnalysis({
      warnings: [
        { code: 'SMALL_SAMPLE', message: 'Model a has only 9 samples', recommendation: 'Results may have wide confidence intervals' },
        { code: 'MODERATE_SAMPLE', message: 'Model b has 20 samples', recommendation: 'Consider using bootstrap confidence intervals' },
      ],
    });
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Model a has only 9 samples/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Model b has 20 samples/)).not.toBeInTheDocument();
  });

  it('renders recompute button', () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Recompute')).toBeInTheDocument();
  });

  it('shows loading state for recompute button when recomputing', () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: true,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /^Recompute$/ });
    expect(button).toBeDisabled();
  });

  it('renders stability tab', async () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    // Navigate to Stability tab
    const stabilityTab = screen.getByRole('button', { name: /Stability/i });
    await userEvent.click(stabilityTab);

    // Check for stability content (SEM)
    expect(screen.getByText(/Condition x AI Directional Stability/i)).toBeInTheDocument();
  });

  it('handles N<2 samples without crashing', async () => {
    // Mock analysis where one model has only 1 sample (N=1)
    // This causes calculateSEM to return null, which previously crashed the component
    const analysis = createMockAnalysis({
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          'scenario-1': { 'Dim A': 'Value 1', 'Dim B': 'Value 1' },
          'scenario-2': { 'Dim A': 'Value 1', 'Dim B': 'Value 1' }
        },
        modelScenarioMatrix: {
          'gpt-4': { 'scenario-1': 0.8, 'scenario-2': 0.9 }, // Valid model
          'claude-3': { 'scenario-1': 0.5, 'scenario-2': 0.6 } // Target model
        },
      }
    });

    // Force a scenario to have only 1 score (simulated by having only 1 scenario in the list for a condition)
    // Actually, calculateSEM takes an array of scores.
    // In StabilityTab logic (Lines 216-222), it collects scores for all scenarioIds matching the condition.
    // If we have only 1 scenario matching 'Dim A: Value 1' && 'Dim B: Value 1', then scores array has length 1.
    // calculateSEM([score]) returns null.

    // The mock data above has 'scenario-1' and 'scenario-2' both mapping to 'Dim A: Value 1', 'Dim B: Value 1'.
    // So for that condition, it will see 2 scenarios.
    // I need to make it so there is ONLY 1 scenario for a specific condition.

    if (analysis.visualizationData && analysis.visualizationData.scenarioDimensions) {
      // scenario-1: A=1, B=1
      analysis.visualizationData.scenarioDimensions['scenario-1'] = { 'Dim A': '1', 'Dim B': '1' };
      // scenario-2: A=2, B=2
      analysis.visualizationData.scenarioDimensions['scenario-2'] = { 'Dim A': '2', 'Dim B': '2' };
    }

    // Now for condition A=1, B=1, there is only scenario-1.
    // Scores for 'claude-3' will be [0.5]. Length = 1.
    // calculateSEM returns null.
    // getModelSEM returns { sem: null, count: 1 }.
    // Rendering: sem is null. getSEMTextColor(sem!) -> CRASH.

    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanel runId="run-1" />
      </MemoryRouter>
    );

    // Navigate to Stability tab
    const stabilityTab = screen.getByRole('button', { name: /Stability/i });
    await userEvent.click(stabilityTab);

    // Should render without error and show N<2 or placeholder
    expect(screen.getAllByText(/Condition x AI Directional Stability/i).length).toBeGreaterThan(0);
    // We expect "N<2" to be displayed for the cell with insufficient data,
    // OR at least the component shouldn't crash.
    // In the current broken state, this test might fail with the error observed in production.
  });

});
