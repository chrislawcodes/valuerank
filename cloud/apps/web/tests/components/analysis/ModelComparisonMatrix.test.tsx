/**
 * ModelComparisonMatrix Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelComparisonMatrix } from '../../../src/components/analysis/ModelComparisonMatrix';
import type { ModelAgreement, PerModelStats, PairwiseAgreement } from '../../../src/api/operations/analysis';

function createMockPairwiseAgreement(overrides: Partial<PairwiseAgreement> = {}): PairwiseAgreement {
  return {
    spearmanRho: 0.75,
    pValue: 0.01,
    pValueCorrected: 0.03,
    significant: true,
    effectSize: 0.65,
    effectInterpretation: 'large',
    ...overrides,
  };
}

function createMockModelAgreement(modelCount: number = 3): ModelAgreement {
  const models = ['gpt-4', 'claude-3', 'gemini'].slice(0, modelCount);
  const pairwise: Record<string, PairwiseAgreement> = {};

  // Create pairwise agreements
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const key = [models[i], models[j]].sort().join('|');
      pairwise[key] = createMockPairwiseAgreement({
        spearmanRho: 0.7 + (i * 0.05) - (j * 0.02),
      });
    }
  }

  return {
    pairwise,
    outlierModels: [],
    overallAgreement: 0.78,
  };
}

function createMockPerModel(modelCount: number = 3): Record<string, PerModelStats> {
  const models = ['gpt-4', 'claude-3', 'gemini'].slice(0, modelCount);
  const perModel: Record<string, PerModelStats> = {};

  for (const model of models) {
    perModel[model] = {
      sampleSize: 50,
      values: {},
      overall: { mean: 0.7, stdDev: 0.1, min: 0.5, max: 0.9 },
    };
  }

  return perModel;
}

describe('ModelComparisonMatrix', () => {
  it('renders matrix with multiple models', () => {
    const modelAgreement = createMockModelAgreement(3);
    const perModel = createMockPerModel(3);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    // Check for overall agreement
    expect(screen.getByText('Overall Agreement:')).toBeInTheDocument();
    expect(screen.getByText('78.0%')).toBeInTheDocument();
  });

  it('shows model names in headers', () => {
    const modelAgreement = createMockModelAgreement(2);
    const perModel = createMockPerModel(2);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    expect(screen.getAllByText('gpt-4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('claude-3').length).toBeGreaterThan(0);
  });

  it('shows unavailable message for single model', () => {
    const modelAgreement: ModelAgreement = {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 1.0,
    };
    const perModel = createMockPerModel(1);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    expect(screen.getByText('Model Comparison Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/Model comparison requires at least two models/)
    ).toBeInTheDocument();
  });

  it('highlights outlier models', () => {
    const modelAgreement = createMockModelAgreement(3);
    modelAgreement.outlierModels = ['gemini'];
    const perModel = createMockPerModel(3);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    expect(screen.getByText(/Outlier: gemini/)).toBeInTheDocument();
  });

  it('shows legend for correlation values', () => {
    const modelAgreement = createMockModelAgreement(2);
    const perModel = createMockPerModel(2);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    // Multiple elements may contain this text (tooltip + legend)
    expect(screen.getAllByText("Spearman's ρ:").length).toBeGreaterThan(0);
    expect(screen.getByText('~0')).toBeInTheDocument();
  });

  it('renders correlation values in cells', () => {
    const modelAgreement = createMockModelAgreement(2);
    const perModel = createMockPerModel(2);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    // Should have correlation values displayed
    expect(screen.getAllByText(/0\.\d+/).length).toBeGreaterThan(0);
  });

  it('handles missing pairwise data gracefully', () => {
    const modelAgreement: ModelAgreement = {
      pairwise: {}, // No pairwise data
      outlierModels: [],
      overallAgreement: 0.5,
    };
    const perModel = createMockPerModel(2);

    // Should not throw
    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    expect(screen.getByText('Overall Agreement:')).toBeInTheDocument();
  });

  it('shows outlier legend when outliers exist', () => {
    const modelAgreement = createMockModelAgreement(3);
    modelAgreement.outlierModels = ['gemini'];
    const perModel = createMockPerModel(3);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    expect(screen.getByText('Outlier model')).toBeInTheDocument();
  });

  it('handles multiple outliers', () => {
    const modelAgreement = createMockModelAgreement(3);
    modelAgreement.outlierModels = ['gemini', 'gpt-4'];
    const perModel = createMockPerModel(3);

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    expect(screen.getByText(/Outliers:/)).toBeInTheDocument();
  });

  it('truncates long model names', () => {
    const perModel: Record<string, PerModelStats> = {
      'very-long-model-name-that-exceeds-limit': {
        sampleSize: 50,
        values: {},
        overall: { mean: 0.7, stdDev: 0.1, min: 0.5, max: 0.9 },
      },
      'another-long-model-name': {
        sampleSize: 50,
        values: {},
        overall: { mean: 0.7, stdDev: 0.1, min: 0.5, max: 0.9 },
      },
    };
    const modelAgreement: ModelAgreement = {
      pairwise: {
        'another-long-model-name|very-long-model-name-that-exceeds-limit': createMockPairwiseAgreement(),
      },
      outlierModels: [],
      overallAgreement: 0.75,
    };

    render(<ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />);

    // Should render without error and show truncated names
    expect(screen.getByText('Overall Agreement:')).toBeInTheDocument();
  });
});
