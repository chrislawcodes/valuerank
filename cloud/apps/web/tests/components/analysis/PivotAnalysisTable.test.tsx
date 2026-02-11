/**
 * PivotAnalysisTable Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PivotAnalysisTable } from '../../../src/components/analysis/PivotAnalysisTable';

describe('PivotAnalysisTable', () => {
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
              s1: { A: 'a1', B: 'b1' },
              s2: { A: 'a1', B: 'b2' },
              s3: { A: 'a2', B: 'b2' },
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
});

