import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OverviewTab } from '../../../src/components/analysis/tabs/OverviewTab';
import { createSemantics, createVarianceAnalysis, pairedDefinitionContent } from './overviewTab.fixtures';

describe('OverviewTab', () => {
  it('does not surface companion-only condition rows on overview', () => {
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
              sampleSize: 1,
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

    expect(screen.queryByText('Condition Decisions')).not.toBeInTheDocument();
    expect(screen.queryByText('model2')).not.toBeInTheDocument();
  });

  it('does not render split inspection controls on overview', () => {
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

    expect(screen.queryByRole('button', { name: 'Split by order' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Split inspection keeps the pooled paired summary above/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Condition Decisions')).not.toBeInTheDocument();
  });
});
