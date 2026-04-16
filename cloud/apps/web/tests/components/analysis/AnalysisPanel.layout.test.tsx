import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisPanelHarness, createMockAnalysis } from './analysisPanel.fixtures';
import { useAnalysis } from '../../../src/hooks/useAnalysis';

vi.mock('../../../src/hooks/useAnalysis', () => ({
  useAnalysis: vi.fn(),
}));

const mockUseAnalysis = vi.mocked(useAnalysis);

describe('AnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        <AnalysisPanelHarness runId="run-1" analysisMode="paired" />
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
        <AnalysisPanelHarness runId="run-1" isAggregate />
      </MemoryRouter>
    );

    expect(screen.getByText('This aggregate mixes in assumption or manipulated runs.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conditions' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conditions' }));
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
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.queryByText('Condition Decisions')).not.toBeInTheDocument();
  });

  it('uses Condition Decisions on the Conditions tab', async () => {
    const user = userEvent.setup();
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
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Conditions' }));

    expect(screen.getAllByText('Condition Decisions').length).toBeGreaterThan(0);
    expect(screen.queryByText('Condition Analysis')).not.toBeInTheDocument();
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
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /^Agreement$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Methods$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Stability$/i })).not.toBeInTheDocument();
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
        <AnalysisPanelHarness runId="run-1" />
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
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Model a has only 9 samples/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Model b has 20 samples/)).not.toBeInTheDocument();
  });

  it('keeps recompute hidden until details are expanded', () => {
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
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /^Recompute$/ })).not.toBeInTheDocument();
  });

  it('shows recompute inside details and disables it while recomputing', async () => {
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
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));

    const button = screen.getByRole('button', { name: /^Recompute$/ });
    expect(button).toBeDisabled();
  });
});
