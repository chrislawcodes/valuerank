import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConditionDecisionsTable } from '../../../src/components/analysis/ConditionDecisionsTable';
import type { Transcript } from '../../../src/api/operations/runs';

function createTranscript({
  id,
  scenarioId,
  modelId,
  direction,
  strength,
}: {
  id: string;
  scenarioId: string;
  modelId: string;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
}): Transcript {
  return {
    id,
    runId: 'run-1',
    scenarioId,
    modelId,
    modelVersion: null,
    content: {},
    decisionCode: direction === 'favor_first' ? '5' : direction === 'favor_second' ? '1' : '3',
    decisionCodeSource: 'deterministic',
    decisionMetadata: null,
    turnCount: 4,
    tokenCount: 120,
    durationMs: 800,
    estimatedCost: null,
    createdAt: '2024-01-01T00:00:00Z',
    lastAccessedAt: null,
    dimensionValues: null,
    decisionModelV2: direction === 'unknown'
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
          legacy: {
            rawScore: direction === 'favor_second' ? 1 : direction === 'neutral' ? 3 : 5,
            canonicalScore: direction === 'favor_second' ? 1 : direction === 'neutral' ? 3 : 5,
          },
        },
  } as Transcript;
}

function createVisualizationData() {
  return {
    decisionDistribution: {},
    scenarioDimensions: {
      'scenario-1': { Achievement: 'high', Care: 'high' },
      'scenario-2': { Achievement: 'high', Care: 'high' },
      'scenario-3': { Achievement: 'high', Care: 'high' },
      'scenario-4': { Achievement: 'high', Care: 'high' },
      'scenario-5': { Achievement: 'high', Care: 'high' },
      'scenario-6': { Achievement: 'low', Care: 'low' },
      'scenario-7': { Achievement: 'low', Care: 'low' },
      'scenario-8': { Achievement: 'medium', Care: 'medium' },
      'scenario-9': { Achievement: 'medium', Care: 'medium' },
    },
    modelScenarioMatrix: {
      'gpt-4': {
        'scenario-1': 3,
        'scenario-2': 3,
        'scenario-3': 3,
        'scenario-4': 3,
        'scenario-5': 3,
        'scenario-6': 3,
        'scenario-7': 3,
      },
      'gpt-5': {
        'scenario-8': 3,
        'scenario-9': 3,
      },
    },
  } as const;
}

describe('ConditionDecisionsTable', () => {
  it('groups model headers by family when multiple variants share a provider', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          perModel={{}}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Benevolence_Dependability: 'full' },
            },
            modelScenarioMatrix: {
              'deepseek-chat': { 'scenario-1': 2 },
              'deepseek-reasoner': { 'scenario-1': 3 },
              'gpt-4': { 'scenario-1': 4 },
              'gpt-5': { 'scenario-1': 5 },
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: 'DeepSeek' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('columnheader', { name: 'GPT' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('columnheader', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reasoner' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '5' })).toBeInTheDocument();
  });

  it('uses the Claude model line as the header and version as the sublabel when available', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          perModel={{}}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Benevolence_Dependability: 'full' },
            },
            modelScenarioMatrix: {
              'deepseek-chat': { 'scenario-1': 2 },
              'deepseek-reasoner': { 'scenario-1': 3 },
              'claude-sonnet-4-5': { 'scenario-1': 4 },
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: 'DeepSeek' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('columnheader', { name: 'Sonnet' })).toHaveAttribute('colspan', '1');
    expect(screen.getByRole('columnheader', { name: '4.5' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reasoner' })).toBeInTheDocument();
  });

  it('formats long Grok reasoning labels with a deliberate wrap point', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          perModel={{}}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Benevolence_Dependability: 'full' },
            },
            modelScenarioMatrix: {
              'grok-4-1-fast-reasoning': { 'scenario-1': 4 },
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: 'Grok' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /4\.1 Fast\s+Reasoning/i })).toBeInTheDocument();
  });

  it('shows source-based split labels instead of order labels in paired mode', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          analysisMode="paired"
          companionRunId="run-2"
          varianceAnalysis={{
            isMultiSample: true,
            samplesPerScenario: 12,
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
                  'scenario-4': {
                    sampleCount: 1,
                    mean: 3,
                    stdDev: 0,
                    variance: 0,
                    min: 3,
                    max: 3,
                    range: 0,
                    directionalAgreement: 1,
                    medianSignedDistance: 0,
                    neutralShare: 0,
                    orientationCorrected: true,
                  },
                },
              },
            },
            mostVariableScenarios: [],
            leastVariableScenarios: [],
          } as any}
          perModel={{ 'gpt-4': { sampleSize: 7, values: {}, overall: { mean: 3, stdDev: 0, min: 3, max: 3 } } as any }}
          visualizationData={createVisualizationData() as any}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Split by order' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Split by source' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Split by source' }));

    expect(screen.getAllByText('Current vignette').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Companion vignette').length).toBeGreaterThan(0);
  });

  it('renders canonical winner scores and the unknown footer copy', () => {
    const visualizationData = createVisualizationData();
    const transcripts = [
      createTranscript({ id: 't1', scenarioId: 'scenario-1', modelId: 'gpt-4', direction: 'favor_second', strength: 'strong' }),
      createTranscript({ id: 't2', scenarioId: 'scenario-2', modelId: 'gpt-4', direction: 'favor_second', strength: 'strong' }),
      createTranscript({ id: 't3', scenarioId: 'scenario-3', modelId: 'gpt-4', direction: 'favor_second', strength: 'strong' }),
      createTranscript({ id: 't4', scenarioId: 'scenario-4', modelId: 'gpt-4', direction: 'favor_second', strength: 'lean' }),
      createTranscript({ id: 't5', scenarioId: 'scenario-5', modelId: 'gpt-4', direction: 'neutral', strength: 'neutral' }),
      createTranscript({ id: 't6', scenarioId: 'scenario-6', modelId: 'gpt-4', direction: 'unknown', strength: 'unknown' }),
      createTranscript({ id: 't7', scenarioId: 'scenario-7', modelId: 'gpt-4', direction: 'unknown', strength: 'unknown' }),
    ];

    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          perModel={{ 'gpt-4': { sampleSize: 7, values: {}, overall: { mean: 3, stdDev: 0, min: 3, max: 3 } } as any }}
          transcripts={transcripts}
          visualizationData={visualizationData as any}
        />
      </MemoryRouter>
    );

    const winnerScore = screen.getByText('1.4');
    expect(winnerScore.parentElement).toHaveClass('text-orange-700');
    expect(screen.getByText('Unknown canonical trials are excluded from condition scores.')).toBeInTheDocument();
    expect(screen.getByTitle('View transcripts for gpt-4 | Achievement: low, Care: low | Decision: other | Unknown: 2')).toBeInTheDocument();
  });

  it('renders ties as 0.0 neutral (neither side won)', () => {
    const visualizationData = createVisualizationData();
    const transcripts = [
      createTranscript({ id: 't8', scenarioId: 'scenario-8', modelId: 'gpt-5', direction: 'favor_first', strength: 'strong' }),
      createTranscript({ id: 't9', scenarioId: 'scenario-9', modelId: 'gpt-5', direction: 'favor_second', strength: 'strong' }),
    ];

    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          perModel={{ 'gpt-5': { sampleSize: 2, values: {}, overall: { mean: 3, stdDev: 0, min: 3, max: 3 } } as any }}
          transcripts={transcripts}
          visualizationData={visualizationData as any}
        />
      </MemoryRouter>
    );

    // tie: meanPreferenceScore === opponentMeanPreferenceScore → displayScore reads as 0
    const tieButton = screen.getByTitle('View transcripts for gpt-5 | Achievement: medium, Care: medium');
    expect(within(tieButton).getByText('0.0')).toBeInTheDocument();
  });

  it('orders condition rows from negligible to full', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          expectedAttributes={['Achievement', 'Care']}
          perModel={{
            model1: {
              sampleSize: 5,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          } as any}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Care: 'same' },
              'scenario-2': { Achievement: 'minimal', Care: 'same' },
              'scenario-3': { Achievement: 'moderate', Care: 'same' },
              'scenario-4': { Achievement: 'negligible', Care: 'same' },
              'scenario-5': { Achievement: 'substantial', Care: 'same' },
            },
            modelScenarioMatrix: {
              model1: {
                'scenario-1': 3,
                'scenario-2': 3,
                'scenario-3': 3,
                'scenario-4': 3,
                'scenario-5': 3,
              },
            },
          } as any}
        />
      </MemoryRouter>
    );

    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows.map((row) => within(row).getAllByRole('cell')[0].textContent?.trim())).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
  });

  it('orders condition rows from negligible to full', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          expectedAttributes={['Achievement', 'Care']}
          perModel={{
            model1: {
              sampleSize: 5,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          } as any}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Care: 'same' },
              'scenario-2': { Achievement: 'minimal', Care: 'same' },
              'scenario-3': { Achievement: 'moderate', Care: 'same' },
              'scenario-4': { Achievement: 'negligible', Care: 'same' },
              'scenario-5': { Achievement: 'substantial', Care: 'same' },
            },
            modelScenarioMatrix: {
              model1: {
                'scenario-1': 3,
                'scenario-2': 3,
                'scenario-3': 3,
                'scenario-4': 3,
                'scenario-5': 3,
              },
            },
          } as any}
        />
      </MemoryRouter>
    );

    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows.map((row) => within(row).getAllByRole('cell')[0].textContent?.trim())).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
  });

  it('renders unknown-only cells as dashes without canonical tinting', () => {
    const visualizationData = createVisualizationData();
    const transcripts = [
      createTranscript({ id: 't10', scenarioId: 'scenario-6', modelId: 'gpt-4', direction: 'unknown', strength: 'unknown' }),
      createTranscript({ id: 't11', scenarioId: 'scenario-7', modelId: 'gpt-4', direction: 'unknown', strength: 'unknown' }),
    ];

    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          perModel={{ 'gpt-4': { sampleSize: 2, values: {}, overall: { mean: 3, stdDev: 0, min: 3, max: 3 } } as any }}
          transcripts={transcripts}
          visualizationData={visualizationData as any}
        />
      </MemoryRouter>
    );

    const unknownButton = screen.getByTitle('View transcripts for gpt-4 | Achievement: low, Care: low | Decision: other | Unknown: 2');
    expect(within(unknownButton).getByText('-')).toBeInTheDocument();
  });
});
