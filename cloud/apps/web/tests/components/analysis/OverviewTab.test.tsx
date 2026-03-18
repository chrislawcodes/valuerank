import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OverviewTab } from '../../../src/components/analysis/tabs/OverviewTab';
import type { VarianceAnalysis } from '../../../src/api/operations/analysis';
import type { AnalysisSemanticsView } from '../../../src/components/analysis-v2/analysisSemantics';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createSemantics(): AnalysisSemanticsView {
  return {
    preference: {
      rowAvailability: { status: 'available' },
      byModel: {
        model1: {
          modelId: 'model1',
          overallLean: 'A',
          overallSignedCenter: 1.2,
          preferenceStrength: 1.1,
          topPrioritizedValues: ['Fairness'],
          topDeprioritizedValues: ['Loyalty'],
          neutralValues: [],
          availability: { status: 'available' },
        },
      },
    },
    reliability: {
      rowAvailability: { status: 'available' },
      byModel: {
        model1: {
          modelId: 'model1',
          baselineReliability: 0.92,
          baselineNoise: 0.18,
          directionalAgreement: 0.88,
          neutralShare: 0.1,
          coverageCount: 3,
          uniqueScenarios: 3,
          repeatCoverageShare: null,
          contributingRunCount: null,
          weightedOverallSignedCenterSd: null,
          hasLowCoverageWarning: false,
          hasHighDriftWarning: false,
          availability: { status: 'available' },
        },
      },
      hasAnyAvailableModel: true,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    },
  };
}

function createVarianceAnalysis(): VarianceAnalysis {
  return {
    isMultiSample: true,
    samplesPerScenario: 12,
    orientationCorrectedCount: 1,
    perModel: {
      model1: {
        totalSamples: 60,
        uniqueScenarios: 5,
        samplesPerScenario: 12,
        avgWithinScenarioVariance: 0.2,
        maxWithinScenarioVariance: 0.3,
        consistencyScore: 0.85,
        perScenario: {
          s1: {
            sampleCount: 12,
            mean: 4.6,
            stdDev: 0.1,
            variance: 0.01,
            min: 4,
            max: 5,
            range: 1,
            directionalAgreement: 0.9,
            medianSignedDistance: 1.1,
            neutralShare: 0,
          },
          s2: {
            sampleCount: 12,
            mean: 3.2,
            stdDev: 0.4,
            variance: 0.16,
            min: 3,
            max: 4,
            range: 1,
            directionalAgreement: 0.6,
            medianSignedDistance: 0.1,
            neutralShare: 0.7,
          },
          s3: {
            sampleCount: 12,
            mean: 1.9,
            stdDev: 0.8,
            variance: 0.64,
            min: 2,
            max: 5,
            range: 3,
            directionalAgreement: 0.5,
            medianSignedDistance: 0.5,
            neutralShare: 0.1,
          },
          s4: {
            sampleCount: 12,
            mean: 2.4,
            stdDev: 0.4,
            variance: 0.16,
            min: 2,
            max: 3,
            range: 1,
            directionalAgreement: 0.583333,
            medianSignedDistance: -1,
            neutralShare: 0.416667,
          },
          s5: {
            sampleCount: 12,
            mean: 4.4,
            stdDev: 0.2,
            variance: 0.04,
            min: 4,
            max: 5,
            range: 1,
            directionalAgreement: 0.85,
            medianSignedDistance: 1,
            neutralShare: 0,
            orientationCorrected: true,
          },
        },
      },
    },
    mostVariableScenarios: [],
    leastVariableScenarios: [],
  };
}

const pairedDefinitionContent = {
  methodology: {
    family: 'job-choice',
    presentation_order: 'A_first' as const,
  },
  components: {
    value_first: { token: 'freedom' },
    value_second: { token: 'harmony' },
  },
  dimensions: [
    { name: 'Freedom' },
    { name: 'Harmony' },
  ],
};

describe('OverviewTab', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders the summary table above Condition Decisions', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Overview Summary')).toBeInTheDocument();
    expect(screen.getByText('Run-level evidence: 3 completed batches')).toBeInTheDocument();
    expect(screen.getByText('Preferred Value')).toBeInTheDocument();
    expect(screen.getByText('Preference Strength')).toBeInTheDocument();
    expect(screen.getByText('Fairness')).toBeInTheDocument();
    expect(screen.getByText('Strong (+1.20)')).toBeInTheDocument();
    expect(screen.getByText('Value Agreement')).toBeInTheDocument();
    expect(screen.getByText('Soft Lean %')).toBeInTheDocument();
    expect(screen.queryByText('Decision Consistency')).not.toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();

    const summaryHeading = screen.getByText('Overview Summary');
    const conditionDecisionsHeading = screen.getByText('Condition Decisions');
    expect(summaryHeading.compareDocumentPosition(conditionDecisionsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps one decimal for non-integer summary percentages', () => {
    const semantics = createSemantics();
    semantics.reliability.byModel.model1.directionalAgreement = 0.983333;

    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={semantics}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('98.3%')).toBeInTheDocument();
  });

  it('shows the custom header tooltip on focus', async () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    fireEvent.focus(screen.getByRole('button', { name: /Value Agreement:/i }));

    expect(screen.getByRole('tooltip')).toHaveTextContent(/How often repeated judgments stay on the same value side/i);
  });

  it('navigates repeat-pattern cells with condition-level ids in paired mode', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          analysisBasePath="/analysis"
          analysisSearchParams={new URLSearchParams({ mode: 'paired' })}
          definitionContent={pairedDefinitionContent}
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /^Stable: 1 of 4 repeated conditions/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?modelId=model1&repeatPattern=stable&rowDim=Freedom&colDim=Harmony&conditionIds=a1%7C%7Cb1&mode=paired'
    );
  });

  it('classifies aggregate repeat-pattern columns from pooled variance data', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          analysisBasePath="/analysis"
          semantics={createSemantics()}
          completedBatches="-"
          aggregateSourceRunCount={4}
          isAggregate
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Run-level evidence: 4 contributing source runs')).toBeInTheDocument();
    expect(screen.getAllByText('25%')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /^Soft Lean: 1 of 4 repeated conditions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Unstable: 1 of 4 repeated conditions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Torn: 1 of 4 repeated conditions/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Unstable: 1 of 4 repeated conditions/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?modelId=model1&repeatPattern=noisy&rowDim=Freedom&colDim=Harmony&conditionIds=a2%7C%7Cb2'
    );
  });

  it('renders zero-count repeat-pattern cells as non-clickable text', () => {
    const varianceAnalysis = createVarianceAnalysis();
    varianceAnalysis.perModel.model1.perScenario = {
      s1: varianceAnalysis.perModel.model1.perScenario.s1,
      s5: varianceAnalysis.perModel.model1.perScenario.s5,
    };

    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          analysisBasePath="/analysis"
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s5: 4 },
            },
          }}
          varianceAnalysis={varianceAnalysis}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /Torn:/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unstable:/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('0%')).toHaveLength(3);
  });

  it('shows unavailable aggregate summaries without blocking the rest of the page', () => {
    const semantics = createSemantics();
    semantics.preference.rowAvailability = {
      status: 'unavailable',
      reason: 'aggregate-analysis',
      message: 'Aggregate summary unavailable for this run.',
    };

    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={semantics}
          completedBatches="-"
          aggregateSourceRunCount={4}
          isAggregate
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Aggregate summary unavailable for this run.')).toBeInTheDocument();
    expect(screen.getByText('Condition Decisions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Stable: 1 of 4 repeated conditions/i })).toBeInTheDocument();
  });

  it('does not treat a mostly-neutral condition as stable', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          definitionContent={pairedDefinitionContent}
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /^Torn: 1 of 4 repeated conditions/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Stable: 2 of 4 repeated conditions/i })).not.toBeInTheDocument();
  });

  it('shows paired scope note when analysisMode is paired', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={createSemantics()}
          completedBatches={2}
          aggregateSourceRunCount={null}
          isAggregate={false}
          analysisMode="paired"
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={null}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Paired vignette scope/i)).toBeInTheDocument();
  });

  it('does not show paired scope note when analysisMode is single', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={createSemantics()}
          completedBatches={2}
          aggregateSourceRunCount={null}
          isAggregate={false}
          analysisMode="single"
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={null}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Paired vignette scope/i)).not.toBeInTheDocument();
  });

  it('supports split inspection in paired mode and preserves orientation bucket in drilldown links', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          analysisBasePath="/analysis"
          analysisSearchParams={new URLSearchParams({ mode: 'paired' })}
          definitionContent={pairedDefinitionContent}
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          analysisMode="paired"
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
              s5: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 5, s2: 3, s3: 1, s4: 2, s5: 4 },
            },
          }}
          varianceAnalysis={createVarianceAnalysis()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Split by order' }));

    expect(screen.getByText(/Split inspection keeps the pooled paired summary above/i)).toBeInTheDocument();
    expect(screen.getAllByText('Freedom -> Harmony').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Harmony -> Freedom').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle('View transcripts for model1 | Freedom: a1, Harmony: b1 | Freedom -> Harmony'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=a1&col=b1&model=model1&orientationBucket=canonical&mode=paired'
    );
  });
});
