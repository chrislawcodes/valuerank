import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PairedRunComparisonCard } from '../../../src/components/analysis/PairedRunComparisonCard';
import type { AnalysisResult } from '../../../src/api/operations/analysis';
import type { Run } from '../../../src/api/operations/runs';

function createRun(id: string, presentationOrder: 'A_first' | 'B_first'): Run {
  return {
    id,
    name: `Run ${id}`,
    definitionId: `definition-${id}`,
    definitionVersion: 1,
    experimentId: null,
    status: 'COMPLETED',
    runCategory: 'PRODUCTION',
    config: {
      models: ['gpt-4'],
      jobChoiceLaunchMode: 'PAIRED_BATCH',
      jobChoiceBatchGroupId: 'batch-1',
      jobChoicePresentationOrder: presentationOrder,
    },
    stalledModels: [],
    progress: null,
    runProgress: null,
    summarizeProgress: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 0,
    recentTasks: [],
    analysisStatus: 'completed',
    executionMetrics: null,
    analysis: {
      actualCost: null,
    },
    definition: {
      id: `definition-${id}`,
      name: `Run ${id}`,
      version: 1,
      tags: [],
      content: {
        methodology: {
          family: 'job-choice',
          presentation_order: presentationOrder,
          pair_key: 'pair-1',
        },
        dimensions: [
          {
            name: 'Value A',
            levels: [{ score: 1, label: 'Weak' }],
          },
          {
            name: 'Value B',
            levels: [{ score: 1, label: 'Weak' }],
          },
        ],
      },
      domain: {
        name: 'Domain',
      },
    },
    tags: [],
  };
}

function createAnalysis(runId: string): AnalysisResult {
  return {
    id: `analysis-${runId}`,
    runId,
    analysisType: 'basic',
    status: 'CURRENT',
    codeVersion: '1.0.0',
    inputHash: 'hash',
    createdAt: '2024-01-01T00:00:00Z',
    computedAt: '2024-01-01T00:00:05Z',
    durationMs: 5000,
    perModel: {
      'gpt-4': {
        sampleSize: 4,
        values: {},
        overall: {
          mean: 0.5,
          stdDev: 0.1,
          min: 0.4,
          max: 0.6,
        },
      },
    },
    preferenceSummary: {
      perModel: {
        'gpt-4': {
          preferenceDirection: {
            byValue: {
              value_a: {
                winRate: 0.75,
                count: {
                  prioritized: 3,
                  deprioritized: 1,
                  neutral: 0,
                },
              },
              value_b: {
                winRate: 0.25,
                count: {
                  prioritized: 1,
                  deprioritized: 3,
                  neutral: 0,
                },
              },
            },
            overallLean: 'A',
            overallSignedCenter: 0.5,
          },
          preferenceStrength: 0.5,
        },
      },
    },
    reliabilitySummary: {
      perModel: {},
    },
    aggregateMetadata: null,
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0.5,
    },
    dimensionAnalysis: null,
    visualizationData: null,
    varianceAnalysis: null,
    mostContestedScenarios: [],
    methodsUsed: {
      winRateCI: 'wilson_score',
      modelComparison: 'spearman_rho',
      pValueCorrection: 'holm_bonferroni',
      effectSize: 'cohens_d',
      dimensionTest: 'kruskal_wallis',
      alpha: 0.05,
      codeVersion: '1.0.0',
    },
    warnings: [],
  };
}

describe('PairedRunComparisonCard', () => {
  it('describes the canonical decision buckets instead of the legacy 1-5 score wording', async () => {
    const currentRun = createRun('run-a', 'A_first');
    const companionRun = createRun('run-b', 'B_first');

    render(
      <MemoryRouter>
        <PairedRunComparisonCard
          currentRun={currentRun}
          currentAnalysis={createAnalysis('run-a')}
          companionRun={companionRun}
          companionAnalysis={createAnalysis('run-b')}
          analysisBasePath="/analysis"
          analysisSearch=""
        />
      </MemoryRouter>,
    );

    const infoButton = screen.getByLabelText('What Value A Sensitivity measures');
    await userEvent.hover(infoButton);

    expect(await screen.findByText(/canonical decision buckets/i)).toBeInTheDocument();
    expect(screen.queryByText(/decision score from 1 to 5/i)).not.toBeInTheDocument();
  });
});
