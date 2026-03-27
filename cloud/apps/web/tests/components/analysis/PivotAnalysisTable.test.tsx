/**
 * PivotAnalysisTable Component Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PivotAnalysisTable } from '../../../src/components/analysis/PivotAnalysisTable';
import type { Transcript } from '../../../src/api/operations/runs';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function makeTranscript(
  id: string,
  scenarioId: string,
  modelId: string,
  direction: 'favor_first' | 'favor_second' | 'neutral',
  strength: 'strong' | 'lean' | 'neutral',
): Transcript {
  return {
    id,
    runId: 'run-1',
    scenarioId,
    modelId,
    modelVersion: null,
    content: null,
    decisionCode: null,
    turnCount: 1,
    tokenCount: 100,
    durationMs: 1000,
    estimatedCost: null,
    createdAt: '',
    lastAccessedAt: null,
    decisionModelV2: {
      raw: {
        matchedText: null,
        matchedLabel: null,
        parseClass: null,
        parsePath: null,
        parserVersion: null,
        responseExcerpt: null,
        manualOverride: null,
      },
      canonical: {
        favoredValueKey: null,
        opposedValueKey: null,
        direction,
        strength,
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      },
      legacy: { rawScore: null, canonicalScore: null },
    },
  };
}

// Visualization data with 3 scenarios spanning 2 dimensions
const BASE_VISUALIZATION_DATA = {
  decisionDistribution: {},
  scenarioDimensions: {
    s1: { Freedom: 'a1', Harmony: 'b1' },
    s2: { Freedom: 'a1', Harmony: 'b2' },
    s3: { Freedom: 'a2', Harmony: 'b2' },
  },
  modelScenarioMatrix: {
    model1: { s1: 1, s2: 3, s3: 5 },
  },
};

// s1 = favor_first strong → strongly=1 → score 2.00, blue (low/Freedom)
// s2 = neutral neutral → neutral=1 → score 0.00 (neutral)
// s3 = favor_second strong → opponentStrongly=1 → score 2.00, orange (high/Harmony)
const BASE_TRANSCRIPTS: Transcript[] = [
  makeTranscript('t1', 's1', 'model1', 'favor_first', 'strong'),
  makeTranscript('t2', 's2', 'model1', 'neutral', 'neutral'),
  makeTranscript('t3', 's3', 'model1', 'favor_second', 'strong'),
];

// Simpler fixtures for navigation tests: only one scored cell (a1,b1 = s1)
const NAV_VISUALIZATION_DATA = {
  decisionDistribution: {},
  scenarioDimensions: {
    s1: { Freedom: 'a1', Harmony: 'b1' },
    s2: { Freedom: 'a1', Harmony: 'b2' },
  },
  modelScenarioMatrix: {
    model1: { s1: 1, s2: 3 },
  },
};

// s1 = favor_first strong → score 2.00; s2 = neutral → score 0.00
const NAV_TRANSCRIPTS: Transcript[] = [
  makeTranscript('t1', 's1', 'model1', 'favor_first', 'strong'),
  makeTranscript('t2', 's2', 'model1', 'neutral', 'neutral'),
];

describe('PivotAnalysisTable', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('shows legend counts for low/neutral/high decisions', () => {
    render(
      <MemoryRouter>
        <PivotAnalysisTable
          runId="run-1"
          dimensionLabels={{
            '1': 'Strongly Support Freedom',
            '5': 'Strongly Support Harmony',
          }}
          visualizationData={BASE_VISUALIZATION_DATA}
          transcripts={BASE_TRANSCRIPTS}
        />
      </MemoryRouter>
    );

    // s1 → favor_first → low (Freedom side), s2 → neutral, s3 → favor_second → high (Harmony side)
    expect(screen.getByText('Freedom 1')).toBeInTheDocument();
    expect(screen.getByText('Neutral 1')).toBeInTheDocument();
    expect(screen.getByText('Harmony 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy pivot analysis table as image/i })).toBeInTheDocument();
  });

  it('keeps dimension selectors hidden until details are opened', () => {
    render(
      <MemoryRouter>
        <PivotAnalysisTable
          runId="run-1"
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: { s1: 1 },
            },
          }}
          transcripts={[makeTranscript('t1', 's1', 'model1', 'favor_first', 'strong')]}
        />
      </MemoryRouter>
    );

    expect(screen.queryByLabelText('Row Dimension (Y-Axis)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByLabelText('Row Dimension (Y-Axis)')).toBeInTheDocument();
    expect(screen.getByLabelText('Column Dimension (X-Axis)')).toBeInTheDocument();
  });

  it('opens pivot-cell condition details on the unified analysis route', () => {
    render(
      <MemoryRouter>
        <PivotAnalysisTable
          runId="run-1"
          analysisBasePath="/analysis"
          analysisSearchParams={new URLSearchParams({ mode: 'paired' })}
          dimensionLabels={{
            '1': 'Strongly Support Freedom',
            '5': 'Strongly Support Harmony',
          }}
          visualizationData={NAV_VISUALIZATION_DATA}
          transcripts={NAV_TRANSCRIPTS}
        />
      </MemoryRouter>
    );

    // s1 (a1, b1) has favor_first strong → displayScore = 2.00
    fireEvent.click(screen.getByText('2.00'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/conditions/a1%7C%7Cb1?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired'
    );
  });

  it('supports string analysisSearchParams when building pivot transcript links', () => {
    render(
      <MemoryRouter>
        <PivotAnalysisTable
          runId="run-1"
          analysisBasePath="/analysis"
          analysisSearchParams="?mode=paired"
          dimensionLabels={{
            '1': 'Strongly Support Freedom',
            '5': 'Strongly Support Harmony',
          }}
          visualizationData={NAV_VISUALIZATION_DATA}
          transcripts={NAV_TRANSCRIPTS}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('2.00'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/conditions/a1%7C%7Cb1?rowDim=Freedom&colDim=Harmony&modelId=model1&mode=paired'
    );
  });

  it('does not add extra query params when no analysis search params are provided', () => {
    render(
      <MemoryRouter>
        <PivotAnalysisTable
          runId="run-1"
          analysisBasePath="/analysis"
          dimensionLabels={{
            '1': 'Strongly Support Freedom',
            '5': 'Strongly Support Harmony',
          }}
          visualizationData={NAV_VISUALIZATION_DATA}
          transcripts={NAV_TRANSCRIPTS}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('2.00'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/conditions/a1%7C%7Cb1?rowDim=Freedom&colDim=Harmony&modelId=model1'
    );
  });
});
