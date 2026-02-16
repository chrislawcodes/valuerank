/**
 * AnalysisPanel Component Tests
 *
 * Tests for the analysis panel display component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders analysis header with computed time', () => {
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
    expect(screen.getByText(/Computed/)).toBeInTheDocument();
  });

  it('renders model count stat', () => {
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

    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders total samples stat', () => {
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

    expect(screen.getByText('Total Samples')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
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

    expect(screen.getByText('Decision Frequency')).toBeInTheDocument();
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

    expect(screen.queryByRole('button', { name: /Agreement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Methods/i })).not.toBeInTheDocument();
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

    const button = screen.getByRole('button', { name: /Recompute/ });
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
    expect(screen.getByText(/Condition x AI Standard Error of Mean/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Condition x AI Standard Error of Mean/i)).toBeInTheDocument();
    // We expect "N<2" to be displayed for the cell with insufficient data, 
    // OR at least the component shouldn't crash.
    // In the current broken state, this test might fail with the error observed in production.
  });
});
