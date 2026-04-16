import { useState, type ComponentProps } from 'react';
import { AnalysisPanel } from '../../../src/components/analysis/AnalysisPanel';
import type { AnalysisTab } from '../../../src/components/analysis/tabs';
import type { AnalysisResult } from '../../../src/api/operations/analysis';
import type { Transcript } from '../../../src/api/operations/runs';

export function AnalysisPanelHarness({
  initialTab = 'overview',
  ...props
}: {
  initialTab?: AnalysisTab;
} & Omit<ComponentProps<typeof AnalysisPanel>, 'activeTab' | 'onTabChange'>) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>(initialTab);

  return (
    <AnalysisPanel
      {...props}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

export function createMockAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    id: 'analysis-1',
    runId: 'run-1',
    analysisType: 'basic',
    status: 'CURRENT',
    codeVersion: '1.0.0',
    inputHash: 'abc123',
    createdAt: '2024-01-15T10:00:00Z',
    computedAt: '2024-01-15T10:00:05Z',
    durationMs: 5000,
    perModel: {
      'gpt-4': {
        sampleSize: 50,
        values: {
          Physical_Safety: {
            winRate: 0.8,
            count: { prioritized: 40, deprioritized: 10, neutral: 0 },
          },
          Compassion: {
            winRate: 0.6,
            count: { prioritized: 30, deprioritized: 20, neutral: 0 },
          },
        },
        overall: { mean: 0.7, stdDev: 0.15, min: 0.4, max: 0.9 },
      },
      'claude-3': {
        sampleSize: 50,
        values: {
          Physical_Safety: {
            winRate: 0.75,
            count: { prioritized: 38, deprioritized: 12, neutral: 0 },
          },
        },
        overall: { mean: 0.65, stdDev: 0.12, min: 0.45, max: 0.85 },
      },
    },
    modelAgreement: {
      pairwise: {},
      outlierModels: [],
      overallAgreement: 0.85,
    },
    visualizationData: null,
    varianceAnalysis: null,
    dimensionAnalysis: null,
    mostContestedScenarios: [],
    methodsUsed: {
      modelComparison: 'spearman_rho',
      pValueCorrection: 'holm_bonferroni',
      effectSize: 'cohens_d',
      dimensionTest: 'kruskal_wallis',
      alpha: 0.05,
      codeVersion: '1.0.0',
    },
    warnings: [],
    ...overrides,
  };
}

export function createCanonicalTranscript({
  id,
  scenarioId,
  direction,
  strength,
}: {
  id: string;
  scenarioId: string;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
}): Transcript {
  return {
    id,
    runId: 'run-1',
    scenarioId,
    modelId: 'gpt-4',
    modelVersion: null,
    content: {},
    decisionCode: direction === 'favor_second' ? '1' : direction === 'neutral' ? '3' : '5',
    decisionCodeSource: 'deterministic',
    decisionMetadata: null,
    turnCount: 4,
    tokenCount: 100,
    durationMs: 800,
    estimatedCost: null,
    createdAt: '2024-01-01T00:00:00Z',
    lastAccessedAt: null,
    dimensionValues: null,
    decisionModelV2:
      direction === 'unknown'
        ? null
        : {
            raw: {
              matchedText: 'test',
              matchedLabel: 'test',
              parseClass: 'exact',
              parsePath: 'exact',
              parserVersion: 'job-choice-v2',
              responseExcerpt: null,
              manualOverride: null,
            },
            canonical: {
              favoredValueKey: direction === 'neutral' ? null : 'value-a',
              opposedValueKey: direction === 'neutral' ? null : 'value-b',
              direction,
              strength,
              normalizationApplied: false,
              normalizationReason: null,
              source: 'deterministic',
            },
            legacy: {},
          },
  } as Transcript;
}
