import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { VisualizationData } from '../../../src/api/operations/analysis';
import type { AnalysisSemanticsView } from '../../../src/components/analysis-v2/analysisSemantics';
import { DecisionsTab } from '../../../src/components/analysis/tabs/DecisionsTab';
import { getDecisionDistributionHelperText } from '../../../src/utils/decisionDistributionDisplay';

function createSemantics(): AnalysisSemanticsView {
  return {
    preference: {
      rowAvailability: {
        status: 'available',
      },
      byModel: {},
    },
    reliability: {
      rowAvailability: {
        status: 'unavailable',
        reason: 'invalid-summary-shape',
        message: 'Stored analysis summaries are invalid for this UI version.',
      },
      byModel: {},
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    },
  };
}

function createVisualizationData(): VisualizationData {
  return {
    decisionDistribution: {
      'gpt-4': { '1': 10, '2': 15, '3': 20, '4': 8, '5': 7 },
    },
    modelScenarioMatrix: {},
  };
}

describe('DecisionsTab', () => {
  it('shows the canonical decision-bucket explanation above the chart', () => {
    render(
      <DecisionsTab
        visualizationData={createVisualizationData()}
        semantics={createSemantics()}
      />,
    );

    expect(screen.getByText(getDecisionDistributionHelperText())).toBeInTheDocument();
    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
    expect(screen.queryByText(/1-5/i)).not.toBeInTheDocument();
  });
});
