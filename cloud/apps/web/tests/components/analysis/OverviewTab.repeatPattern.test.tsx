import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: vi.fn(() => [{ data: undefined, fetching: false, error: null }, vi.fn()]),
  };
});

import { OverviewTab } from '../../../src/components/analysis/tabs/OverviewTab';
import {
  createCompanionAnalysis,
  createSemantics,
  createVarianceAnalysis,
  mockNavigate as sharedMockNavigate,
  pairedDefinitionContent,
} from './overviewTab.fixtures';
import type { AnalysisResult } from '../../../src/api/operations/analysis';

const mockNavigate = sharedMockNavigate;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('OverviewTab', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
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
    expect(screen.queryByText('Condition Decisions')).not.toBeInTheDocument();
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

  it('pools repeat-pattern percentages across both companion runs in paired mode', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
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
          analysisMode="paired"
          companionAnalysis={createCompanionAnalysis()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Run-level evidence: pooled across 2 companion runs')).toBeInTheDocument();
    expect(screen.getByText('62.5%')).toBeInTheDocument();
    // Paired mode now enables drilldown — the stable cell should be a clickable button
    expect(screen.getByRole('button', { name: /stable: 5 of 8 repeated conditions/i })).toBeInTheDocument();
  });

  it('does not show the old paired scope note in overview', () => {
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

  it('shows pooled paired summary context without duplicating the condition table', () => {
    const currentAnalysis: AnalysisResult = {
      ...createCompanionAnalysis(),
      runId: 'run-b',
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          s1: { Freedom: 'a1', Harmony: 'b1' },
        },
        modelScenarioMatrix: {
          model1: { s1: 5 },
        },
      },
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 1,
        orientationCorrectedCount: 1,
        perModel: {
          model1: {
            totalSamples: 1,
            uniqueScenarios: 1,
            samplesPerScenario: 1,
            avgWithinScenarioVariance: 0,
            maxWithinScenarioVariance: 0,
            consistencyScore: 1,
            perScenario: {
              s1: {
                sampleCount: 1,
                mean: 5,
                stdDev: 0,
                variance: 0,
                min: 5,
                max: 5,
                range: 0,
                orientationCorrected: true,
              },
            },
          },
        },
        mostVariableScenarios: [],
        leastVariableScenarios: [],
      },
    };

    const companionAnalysis: AnalysisResult = {
      ...createCompanionAnalysis(),
      runId: 'run-a',
      visualizationData: {
        decisionDistribution: {},
        scenarioDimensions: {
          s2: { Freedom: 'a1', Harmony: 'b1' },
        },
        modelScenarioMatrix: {
          model1: { s2: 1 },
        },
      },
      varianceAnalysis: {
        isMultiSample: true,
        samplesPerScenario: 1,
        orientationCorrectedCount: 0,
        perModel: {
          model1: {
            totalSamples: 1,
            uniqueScenarios: 1,
            samplesPerScenario: 1,
            avgWithinScenarioVariance: 0,
            maxWithinScenarioVariance: 0,
            consistencyScore: 1,
            perScenario: {
              s2: {
                sampleCount: 1,
                mean: 1,
                stdDev: 0,
                variance: 0,
                min: 1,
                max: 1,
                range: 0,
              },
            },
          },
        },
        mostVariableScenarios: [],
        leastVariableScenarios: [],
      },
    };

    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-b"
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
              sampleSize: 2,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={currentAnalysis.visualizationData}
          varianceAnalysis={currentAnalysis.varianceAnalysis}
          currentAnalysis={currentAnalysis}
          companionAnalysis={companionAnalysis}
          currentRun={{
            id: 'run-b',
            config: { jobChoicePresentationOrder: 'B_first' },
            definition: {
              name: 'Harmony -> Freedom',
              content: {
                ...pairedDefinitionContent,
                methodology: {
                  ...pairedDefinitionContent.methodology,
                  presentation_order: 'B_first',
                },
              },
            },
          } as any}
          companionRun={{
            id: 'run-a',
            config: { jobChoicePresentationOrder: 'A_first' },
            definition: {
              name: 'Freedom -> Harmony',
              content: pairedDefinitionContent,
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Run-level evidence: pooled across 2 companion runs')).toBeInTheDocument();
    expect(screen.getByText('Paired Run Comparison')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy paired run comparison as image/i })).toBeInTheDocument();
    expect(screen.queryByText('Condition Decisions')).not.toBeInTheDocument();
  });
});
