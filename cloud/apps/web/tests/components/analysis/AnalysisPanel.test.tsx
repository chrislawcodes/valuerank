/**
 * AnalysisPanel Component Tests
 *
 * Tests for the analysis panel display component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" analysisStatus="pending" />);

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

    render(<AnalysisPanel runId="run-1" analysisStatus="computing" />);

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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" />);

    expect(screen.getByText('Total Samples')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders per-model statistics', () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(<AnalysisPanel runId="run-1" />);

    expect(screen.getByText('Per-Model Statistics')).toBeInTheDocument();
    // Model names appear in both Per-Model Statistics and Model Comparison Matrix
    expect(screen.getAllByText('gpt-4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('claude-3').length).toBeGreaterThan(0);
  });

  it('renders top values for each model', () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(<AnalysisPanel runId="run-1" />);

    // Multiple models show "Top Values by Win Rate" - use getAllByText
    expect(screen.getAllByText('Top Values by Win Rate').length).toBeGreaterThan(0);
    expect(screen.getByText(/Physical_Safety.*80\.0%/)).toBeInTheDocument();
  });

  it('renders warnings when present', () => {
    const analysis = createMockAnalysis({
      warnings: [
        {
          code: 'SMALL_SAMPLE',
          message: 'Sample size is small',
          recommendation: 'Consider collecting more data',
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

    render(<AnalysisPanel runId="run-1" />);

    expect(screen.getByText('Sample size is small')).toBeInTheDocument();
    expect(screen.getByText('Consider collecting more data')).toBeInTheDocument();
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

    render(<AnalysisPanel runId="run-1" />);

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

    render(<AnalysisPanel runId="run-1" />);

    const button = screen.getByRole('button', { name: /Recompute/ });
    expect(button).toBeDisabled();
  });

  it('renders statistical methods documentation', async () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(<AnalysisPanel runId="run-1" />);

    // Navigate to Methods tab
    const methodsTab = screen.getByRole('button', { name: /Methods/i });
    await userEvent.click(methodsTab);

    expect(screen.getByText('Statistical Methods Used')).toBeInTheDocument();
  });
});
