import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { VarianceAnalysis } from '../../../src/api/operations/analysis';
import type { DecisionCoverageSummary } from '../../../src/utils/analysisCoverage';
import {
  StabilityTab,
  getDirectionBgColor,
  getDirectionTextColor,
  getModelStabilityMetrics,
  getStabilityLabel,
} from '../../../src/components/analysis/tabs/StabilityTab';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createVarianceAnalysis(): VarianceAnalysis {
  return {
    isMultiSample: true,
    samplesPerScenario: 3,
    orientationCorrectedCount: 1,
    perModel: {
      model1: {
        totalSamples: 5,
        uniqueScenarios: 2,
        samplesPerScenario: 3,
        avgWithinScenarioVariance: 0.12,
        maxWithinScenarioVariance: 0.2,
        consistencyScore: 0.8,
        perScenario: {
          s1: {
            sampleCount: 3,
            mean: 1.2,
            stdDev: 0.3,
            variance: 0.09,
            min: 1,
            max: 2,
            range: 1,
            direction: 'A',
            directionalAgreement: 1,
            medianSignedDistance: 0.8,
            iqr: 0.2,
            neutralShare: 0,
          },
          s2: {
            sampleCount: 2,
            mean: 1.1,
            stdDev: 0.2,
            variance: 0.04,
            min: 1,
            max: 2,
            range: 1,
            direction: 'A',
            directionalAgreement: 0.5,
            medianSignedDistance: 0.4,
            iqr: 0.6,
            neutralShare: 0.25,
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

const decisionCoverage: DecisionCoverageSummary = {
  totalTranscripts: 6,
  scoredTranscripts: 4,
  unresolvedTranscripts: 2,
  parserScoredTranscripts: 3,
  manuallyAdjudicatedTranscripts: 1,
  exactMatchTranscripts: 2,
  fallbackResolvedTranscripts: 1,
  ambiguousTranscripts: 2,
  legacyNumericTranscripts: 0,
  hasMethodologySignals: true,
  perModel: {
    model1: {
      modelId: 'model1',
      totalTranscripts: 6,
      scoredTranscripts: 4,
      unresolvedTranscripts: 2,
      parserScoredTranscripts: 3,
      manuallyAdjudicatedTranscripts: 1,
      exactMatchTranscripts: 2,
      fallbackResolvedTranscripts: 1,
      ambiguousTranscripts: 2,
      legacyNumericTranscripts: 0,
    },
  },
};

describe('getStabilityLabel', () => {
  it('returns null when N < 2', () => {
    expect(getStabilityLabel(1, 1)).toBeNull();
  });

  it('returns High when all agree (5/5)', () => {
    expect(getStabilityLabel(5, 5)).toBe('High');
  });

  it('returns Moderate when (N-1)/N agree (4/5)', () => {
    expect(getStabilityLabel(4, 5)).toBe('Moderate');
  });

  it('returns Low when <= (N-2)/N agree (3/5)', () => {
    expect(getStabilityLabel(3, 5)).toBe('Low');
  });
});

describe('direction color helpers', () => {
  it('returns expected background colors', () => {
    expect(getDirectionBgColor('A')).toBe('bg-blue-50');
    expect(getDirectionBgColor('B')).toBe('bg-orange-50');
    expect(getDirectionBgColor('NEUTRAL')).toBe('');
    expect(getDirectionBgColor(null)).toBe('');
  });

  it('returns expected text colors', () => {
    expect(getDirectionTextColor('A')).toBe('text-blue-700 font-medium');
    expect(getDirectionTextColor('B')).toBe('text-orange-700 font-medium');
    expect(getDirectionTextColor('NEUTRAL')).toBe('text-gray-600');
    expect(getDirectionTextColor(null)).toBe('text-gray-400');
  });
});

describe('getModelStabilityMetrics', () => {
  it('aggregates weighted directional metrics across scenarios', () => {
    const metrics = getModelStabilityMetrics('model1', ['s1', 's2'], createVarianceAnalysis());

    expect(metrics).toEqual({
      direction: 'A',
      agreementCount: 4,
      totalCount: 5,
      directionalAgreement: 0.8,
      medianSignedDistance: 0.64,
      iqr: 0.36,
      neutralShare: 0.1,
    });
  });

  it('returns null when variance analysis is missing', () => {
    expect(getModelStabilityMetrics('model1', ['s1'], null)).toBeNull();
  });
});

describe('StabilityTab', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders directional stability cells and orientation footnote', () => {
    render(
      <StabilityTab
        runId="run-1"
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={{
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: {
              s1: 1.2,
              s2: 1.1,
            },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
          },
        }}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Condition x AI Directional Stability' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/predominant direction/i)).toBeInTheDocument();
    expect(screen.getByText('Favors A')).toBeInTheDocument();
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();
    expect(screen.getByText(/\+0\.6.*IQR 0\.4/)).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText(/normalized before computing direction/i)).toBeInTheDocument();
  });

  it('opens stability transcripts on the unified analysis route', () => {
    render(
      <StabilityTab
        runId="run-1"
        analysisBasePath="/analysis"
        analysisSearchParams={new URLSearchParams({ mode: 'paired' })}
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={{
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: {
              s1: 1.2,
              s2: 1.1,
            },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
          },
        }}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    fireEvent.click(screen.getByTitle('View 5 transcripts for model1 | Freedom: High, Harmony: Low'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1&mode=paired',
    );
  });

  it('supports string analysisSearchParams when building stability transcript links', () => {
    render(
      <StabilityTab
        runId="run-1"
        analysisBasePath="/analysis"
        analysisSearchParams="?mode=paired"
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={{
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: {
              s1: 1.2,
              s2: 1.1,
            },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
          },
        }}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    fireEvent.click(screen.getByTitle('View 5 transcripts for model1 | Freedom: High, Harmony: Low'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1&mode=paired',
    );
  });

  it('keeps stability transcript routes clean when no extra search params are provided', () => {
    render(
      <StabilityTab
        runId="run-1"
        analysisBasePath="/analysis"
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={{
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: {
              s1: 1.2,
              s2: 1.1,
            },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
          },
        }}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    fireEvent.click(screen.getByTitle('View 5 transcripts for model1 | Freedom: High, Harmony: Low'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1',
    );
  });

  it('shows parser, manual, and unresolved decision coverage above the matrix', () => {
    render(
      <StabilityTab
        runId="run-1"
        perModel={{
          model1: {
            sampleSize: 6,
            values: {},
            overall: { mean: 0.5, stdDev: 0.2, min: -1, max: 1 },
          },
        }}
        visualizationData={null}
        varianceAnalysis={null}
        decisionCoverage={decisionCoverage}
      />,
    );

    const banner = screen.getByText('Decision coverage').parentElement;
    expect(banner).not.toBeNull();
    expect(banner).toHaveTextContent('Stability metrics include 4 of 6 transcripts.');
    expect(banner).toHaveTextContent('2 unresolved transcripts are currently excluded until manually adjudicated.');
    expect(banner).toHaveTextContent('Parser-scored: 3 (2 exact, 1 fallback)');
    expect(screen.getByText('model1')).toBeInTheDocument();
    expect(screen.getByText('4/6')).toBeInTheDocument();
  });

  it('shows paired orientation banner when pairedScopeContext.hasOrientationPairing is true', () => {
    render(
      <StabilityTab
        runId="run-1"
        analysisMode="paired"
        definitionContent={pairedDefinitionContent}
        pairedScopeContext={{ orientationCorrectedCount: 3, hasOrientationPairing: true }}
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={null}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    expect(screen.getByText(/Paired orientation pooling/i)).toBeInTheDocument();
    expect(screen.getByText(/3 scenarios had/i)).toBeInTheDocument();
  });

  it('does not show paired orientation banner in single mode even if corrections occurred', () => {
    render(
      <StabilityTab
        runId="run-1"
        analysisMode="single"
        pairedScopeContext={{ orientationCorrectedCount: 3, hasOrientationPairing: false }}
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={null}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    expect(screen.queryByText(/Paired orientation pooling/i)).not.toBeInTheDocument();
    // Footnote still shows in single mode
    expect(screen.getByText(/normalized before computing direction/i)).toBeInTheDocument();
  });

  it('supports split inspection in paired mode and preserves orientation bucket in transcript links', () => {
    render(
      <StabilityTab
        runId="run-1"
        analysisBasePath="/analysis"
        analysisSearchParams={new URLSearchParams({ mode: 'paired' })}
        analysisMode="paired"
        definitionContent={pairedDefinitionContent}
        pairedScopeContext={{ orientationCorrectedCount: 1, hasOrientationPairing: true }}
        perModel={{
          model1: {
            sampleSize: 5,
            values: {},
            overall: { mean: 1.1, stdDev: 0.2, min: 1, max: 2 },
          },
        }}
        visualizationData={{
          decisionDistribution: {},
          modelScenarioMatrix: {
            model1: {
              s1: 1.2,
              s2: 1.1,
            },
          },
          scenarioDimensions: {
            s1: { Freedom: 'High', Harmony: 'Low' },
            s2: { Freedom: 'High', Harmony: 'Low' },
          },
        }}
        varianceAnalysis={createVarianceAnalysis()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Split by order' }));

    expect(screen.getByText(/Split inspection keeps the pooled paired summary intact/i)).toBeInTheDocument();
    expect(screen.getAllByText('Freedom -> Harmony').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Harmony -> Freedom').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle('View 3 transcripts for model1 | Freedom: High, Harmony: Low | Freedom -> Harmony'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/transcripts?rowDim=Freedom&colDim=Harmony&row=High&col=Low&model=model1&orientationBucket=canonical&mode=paired',
    );
  });
});
