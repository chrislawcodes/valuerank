/**
 * PivotAnalysisTable Component Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PivotAnalysisTable } from '../../../src/components/analysis/PivotAnalysisTable';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
            },
            modelScenarioMatrix: {
              model1: { s1: 1, s2: 3, s3: 5 },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Freedom 1')).toBeInTheDocument();
    expect(screen.getByText('Neutral 1')).toBeInTheDocument();
    expect(screen.getByText('Harmony 1')).toBeInTheDocument();
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
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
            },
            modelScenarioMatrix: {
              model1: { s1: 1, s2: 3, s3: 5 },
            },
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('1.00'));

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
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
            },
            modelScenarioMatrix: {
              model1: { s1: 1, s2: 3, s3: 5 },
            },
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('1.00'));

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
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
            },
            modelScenarioMatrix: {
              model1: { s1: 1, s2: 3, s3: 5 },
            },
          }}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('1.00'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/analysis/run-1/conditions/a1%7C%7Cb1?rowDim=Freedom&colDim=Harmony&modelId=model1'
    );
  });
});
