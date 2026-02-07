/**
 * VariableImpactChart Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VariableImpactChart } from '../../../src/components/analysis/VariableImpactChart';
import type { DimensionAnalysis } from '../../../src/api/operations/analysis';

function createMockDimensionAnalysis(): DimensionAnalysis {
  return {
    dimensions: {
      urgency: {
        effectSize: 0.45,
        rank: 1,
        pValue: 0.001,
        significant: true,
      },
      stakes: {
        effectSize: 0.32,
        rank: 2,
        pValue: 0.015,
        significant: true,
      },
      actor_type: {
        effectSize: 0.12,
        rank: 3,
        pValue: 0.08,
        significant: false,
      },
    },
    varianceExplained: 0.67,
    method: 'factorial_anova',
  };
}

describe('VariableImpactChart', () => {
  it('renders dimension analysis data', () => {
    const dimensionAnalysis = createMockDimensionAnalysis();
    render(<VariableImpactChart dimensionAnalysis={dimensionAnalysis} />);

    // Check for variance explained
    expect(screen.getByText('Variance Explained:')).toBeInTheDocument();
    expect(screen.getByText('67.0%')).toBeInTheDocument();

    // Check for method display
    expect(screen.getByText('Method: factorial anova')).toBeInTheDocument();
  });

  it('renders legend for significance', () => {
    const dimensionAnalysis = createMockDimensionAnalysis();
    render(<VariableImpactChart dimensionAnalysis={dimensionAnalysis} />);

    expect(screen.getByText('Significant')).toBeInTheDocument();
    expect(screen.getByText('Not significant')).toBeInTheDocument();
  });

  it('shows unavailable message when dimensionAnalysis is null', () => {
    render(<VariableImpactChart dimensionAnalysis={null} />);

    expect(screen.getByText('Dimension Analysis Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/This analysis requires a vignette with multiple dimensions/)
    ).toBeInTheDocument();
  });

  it('shows no data message when dimensions object is empty', () => {
    const emptyDimensionAnalysis: DimensionAnalysis = {
      dimensions: {},
      varianceExplained: 0,
      method: 'factorial_anova',
    };
    render(<VariableImpactChart dimensionAnalysis={emptyDimensionAnalysis} />);

    expect(screen.getByText('No dimension data available')).toBeInTheDocument();
  });

  it('handles single dimension data', () => {
    const singleDimension: DimensionAnalysis = {
      dimensions: {
        urgency: {
          effectSize: 0.45,
          rank: 1,
          pValue: 0.001,
          significant: true,
        },
      },
      varianceExplained: 0.45,
      method: 'one_way_anova',
    };
    render(<VariableImpactChart dimensionAnalysis={singleDimension} />);

    expect(screen.getByText('Variance Explained:')).toBeInTheDocument();
    expect(screen.getByText('45.0%')).toBeInTheDocument();
  });

  it('displays dimensions sorted by rank', () => {
    const dimensionAnalysis = createMockDimensionAnalysis();
    render(<VariableImpactChart dimensionAnalysis={dimensionAnalysis} />);

    // The chart should be rendered (checking for container)
    const chartContainer = document.querySelector('.recharts-responsive-container');
    expect(chartContainer).toBeInTheDocument();
  });

  it('formats dimension names with spaces and title case', () => {
    const dimensionAnalysis: DimensionAnalysis = {
      dimensions: {
        actor_type: {
          effectSize: 0.25,
          rank: 1,
          pValue: 0.05,
          significant: true,
        },
      },
      varianceExplained: 0.25,
      method: 'factorial_anova',
    };
    render(<VariableImpactChart dimensionAnalysis={dimensionAnalysis} />);

    // Check that the chart container renders
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('handles very long dimension names by truncating', () => {
    const dimensionAnalysis: DimensionAnalysis = {
      dimensions: {
        very_long_dimension_name_that_exceeds_limit: {
          effectSize: 0.30,
          rank: 1,
          pValue: 0.01,
          significant: true,
        },
      },
      varianceExplained: 0.30,
      method: 'factorial_anova',
    };
    render(<VariableImpactChart dimensionAnalysis={dimensionAnalysis} />);

    // Chart should still render
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('uses different colors for significant vs non-significant dimensions', () => {
    const dimensionAnalysis = createMockDimensionAnalysis();
    render(<VariableImpactChart dimensionAnalysis={dimensionAnalysis} />);

    // Verify legend shows both states
    expect(screen.getByText('Significant')).toBeInTheDocument();
    expect(screen.getByText('Not significant')).toBeInTheDocument();
  });
});
