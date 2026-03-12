import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelConsistencyChart } from '../../../src/components/analysis/ModelConsistencyChart';
import type { AnalysisSemanticsView } from '../../../src/components/analysis-v2/analysisSemantics';

function createReliabilityView(
  overrides: Partial<AnalysisSemanticsView['reliability']> = {},
): AnalysisSemanticsView['reliability'] {
  return {
    rowAvailability: { status: 'available' },
    byModel: {
      'gpt-4': {
        modelId: 'gpt-4',
        baselineReliability: 0.92,
        baselineNoise: 0.18,
        directionalAgreement: 0.96,
        neutralShare: 0.04,
        coverageCount: 8,
        uniqueScenarios: 8,
        repeatCoverageShare: null,
        contributingRunCount: null,
        weightedOverallSignedCenterSd: null,
        hasLowCoverageWarning: false,
        hasHighDriftWarning: false,
        availability: { status: 'available' },
      },
      'claude-3': {
        modelId: 'claude-3',
        baselineReliability: 0.83,
        baselineNoise: 0.24,
        directionalAgreement: 0.91,
        neutralShare: 0.09,
        coverageCount: 8,
        uniqueScenarios: 8,
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
    ...overrides,
  };
}

describe('ModelConsistencyChart', () => {
  it('renders baseline reliability content when data is available', () => {
    render(<ModelConsistencyChart reliability={createReliabilityView()} />);

    expect(screen.getByText('Baseline Reliability by Model')).toBeInTheDocument();
    expect(screen.getByText('Most Reliable')).toBeInTheDocument();
    expect(screen.getByText('Least Reliable')).toBeInTheDocument();
  });

  it('renders unavailable state when reliability is not available', () => {
    render(
      <ModelConsistencyChart
        reliability={createReliabilityView({
          rowAvailability: {
            status: 'unavailable',
            reason: 'no-repeat-coverage',
            message: 'This model has one sample per scenario, so baseline reliability is unavailable.',
          },
          byModel: {},
          hasAnyAvailableModel: false,
        })}
      />
    );

    expect(screen.getByText(/baseline reliability is unavailable/i)).toBeInTheDocument();
  });

  it('shows excluded models when availability is mixed', () => {
    render(
      <ModelConsistencyChart
        reliability={createReliabilityView({
          byModel: {
            ...createReliabilityView().byModel,
            'gemini-pro': {
              modelId: 'gemini-pro',
              baselineReliability: null,
              baselineNoise: null,
              directionalAgreement: null,
              neutralShare: null,
              coverageCount: 0,
              uniqueScenarios: 0,
              repeatCoverageShare: null,
              contributingRunCount: null,
              weightedOverallSignedCenterSd: null,
              hasLowCoverageWarning: false,
              hasHighDriftWarning: false,
              availability: {
                status: 'unavailable',
                reason: 'no-repeat-coverage',
                message: 'This model has one sample per scenario, so baseline reliability is unavailable.',
              },
            },
          },
          hasMixedAvailability: true,
        })}
      />
    );

    expect(screen.getByText('Excluded From Reliability Chart')).toBeInTheDocument();
    expect(screen.getByText('gemini-pro')).toBeInTheDocument();
  });
});
