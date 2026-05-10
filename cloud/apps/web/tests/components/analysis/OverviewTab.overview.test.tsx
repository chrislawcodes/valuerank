import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverviewTab } from '../../../src/components/analysis/tabs/OverviewTab';
import { createCompanionAnalysis, createSemantics, createVarianceAnalysis } from './overviewTab.fixtures';

describe('OverviewTab', () => {
  it('renders the overview summary without duplicating Condition Decisions', () => {
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
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByText('Fairness')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Value Agreement')).toBeInTheDocument();
    expect(screen.getByText('Soft Lean %')).toBeInTheDocument();
    expect(screen.queryByText('Decision Consistency')).not.toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy overview summary as image/i })).toBeInTheDocument();

    expect(screen.queryByText('Condition Decisions')).not.toBeInTheDocument();
  });

  it('shows the coverage cell batch count when the overview was launched from a coverage cell', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={4}
          coverageBatchCount={5}
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

    expect(screen.getByText('Run-level evidence: 5 batches from coverage cell')).toBeInTheDocument();
  });

  it('shows paired coverage counts when the overview is launched from a coverage cell', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={createSemantics()}
          completedBatches={3}
          aggregateSourceRunCount={4}
          coverageBatchCount={5}
          coveragePairedBatchCount={2}
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

    expect(screen.getByText('Run-level evidence: 5 batches from coverage cell • 2 paired batches')).toBeInTheDocument();
  });

  it('renders an em dash when the preferred value win rate is missing', () => {
    const semantics = createSemantics();
    semantics.preference.byModel.model1.topPrioritizedValues = [{ name: 'Fairness', winRate: null }];

    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={semantics}
          completedBatches={3}
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

    const winRateCells = screen.getAllByText('—');
    expect(winRateCells.length).toBeGreaterThan(0);
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

  it('uses paired-specific no-repeat wording in overview summary', () => {
    const semantics = createSemantics();
    semantics.reliability.rowAvailability = {
      status: 'unavailable',
      reason: 'no-repeat-coverage',
      message:
        'This model has one sample per condition, so baseline reliability is unavailable. Recomputing the same run without repeated samples will not populate this section.',
    };
    semantics.reliability.byModel.model1 = {
      ...semantics.reliability.byModel.model1,
      availability: semantics.reliability.rowAvailability,
      baselineReliability: null,
      baselineNoise: null,
      directionalAgreement: null,
      neutralShare: null,
      coverageCount: 0,
      uniqueScenarios: 0,
      repeatCoverageShare: null,
      contributingRunCount: null,
      weightedOverallSignedCenterSd: null,
    };

    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          semantics={semantics}
          completedBatches={3}
          aggregateSourceRunCount={null}
          isAggregate={false}
          analysisMode="paired"
          companionAnalysis={createCompanionAnalysis()}
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

    expect(screen.getByText(/pooling both vignette orders does not add repeat coverage/i)).toBeInTheDocument();
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

    // waitFor: interaction triggers async state update before DOM settles
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        /How often repeated judgments stay on the same value side/i
      );
    });
  });
});
