import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisPanelHarness, createCanonicalTranscript, createMockAnalysis } from './analysisPanel.fixtures';
import { useAnalysis } from '../../../src/hooks/useAnalysis';

vi.mock('../../../src/hooks/useAnalysis', () => ({
  useAnalysis: vi.fn(),
}));

const mockUseAnalysis = vi.mocked(useAnalysis);

describe('AnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('threads transcripts into the scenarios tab and renders canonical scores there', async () => {
    const analysis = createMockAnalysis({
      perModel: {
        'gpt-4': {
          sampleSize: 2,
          values: {},
          overall: { mean: 3, stdDev: 0, min: 3, max: 3 },
        },
      },
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          'scenario-1': { Achievement: 'high', Care: 'high' },
          'scenario-2': { Achievement: 'high', Care: 'high' },
        },
        modelScenarioMatrix: {
          'gpt-4': {
            'scenario-1': 3,
            'scenario-2': 3,
          },
        },
      } as any,
    });

    const transcripts = [
      createCanonicalTranscript({ id: 't1', scenarioId: 'scenario-1', direction: 'favor_first', strength: 'strong' }),
      createCanonicalTranscript({ id: 't2', scenarioId: 'scenario-2', direction: 'favor_first', strength: 'lean' }),
    ];

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
        <AnalysisPanelHarness runId="run-1" transcripts={transcripts} />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Conditions$/i }));

    // PivotAnalysisTable and ConditionDecisionsTable now show winner's weighted score (0–2).
    // t1=strongly(1) + t2=somewhat(1), totalTrials=2 → winnerScore=(2×1+1×1)/2=1.5
    const winnerScoreElement = screen
      .getAllByText('1.5')
      .find((element) => element.className.includes('text-blue-700'));
    expect(winnerScoreElement).toBeDefined();
    expect(winnerScoreElement).toHaveClass('text-blue-700');
    expect(screen.getByText('Unknown canonical trials are excluded from condition scores.')).toBeInTheDocument();
  });

  it('pools overview summary semantics across the companion run in paired mode', async () => {
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
        <AnalysisPanelHarness
          runId="run-1"
          analysisMode="paired"
          companionAnalysis={companionAnalysis}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      const claudeRow = screen.getAllByText('claude-3')[0]?.closest('tr');
      const gptRow = screen.getAllByText('gpt-4')[0]?.closest('tr');

      expect(claudeRow).not.toBeNull();
      expect(gptRow).not.toBeNull();
      expect(within(claudeRow as HTMLTableRowElement).getByText('Achievement')).toBeInTheDocument();
      expect(within(claudeRow as HTMLTableRowElement).getByText('50%')).toBeInTheDocument();
      expect(within(gptRow as HTMLTableRowElement).getByText('Care')).toBeInTheDocument();
      expect(within(gptRow as HTMLTableRowElement).getByText('60%')).toBeInTheDocument();
      expect(screen.getByText('Run-level evidence: pooled across 2 companion runs')).toBeInTheDocument();
    });
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
        <AnalysisPanelHarness
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
        <AnalysisPanelHarness runId="run-1" analysisMode="paired" />
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
        <AnalysisPanelHarness
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

  it('renders the conditions tab in paired mode', () => {
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
        <AnalysisPanelHarness runId="run-1" analysisMode="paired" initialTab="scenarios" />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Conditions' })).toBeInTheDocument();
    expect(screen.getByText('Pivot Analysis')).toBeInTheDocument();
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
        <AnalysisPanelHarness runId="run-1" isAggregate />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));

    expect(screen.getByText('Decision Coverage')).toBeInTheDocument();
    expect(screen.getByText('Evidence: 4 contributing source runs pooled')).toBeInTheDocument();
  });

  it('shows the coverage cell batch count when provided', async () => {
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
        <AnalysisPanelHarness runId="run-1" isAggregate coverageBatchCount={5} />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));

    expect(screen.getByText('Evidence: 5 batches from coverage cell')).toBeInTheDocument();
  });

  it('shows paired coverage counts when provided', async () => {
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
        <AnalysisPanelHarness
          runId="run-1"
          isAggregate
          coverageBatchCount={5}
          coveragePairedBatchCount={2}
        />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));

    expect(screen.getByText('Evidence: 5 batches from coverage cell • 2 paired batches')).toBeInTheDocument();
  });
});
