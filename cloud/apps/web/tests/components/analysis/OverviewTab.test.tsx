/**
 * OverviewTab Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OverviewTab } from '../../../src/components/analysis/tabs/OverviewTab';

describe('OverviewTab', () => {
  it('shows per-AI rounded decision counts by condition (A/Neutral/B)', () => {
    render(
      <MemoryRouter>
        <OverviewTab
          runId="run-1"
          dimensionLabels={{
            '1': 'Strongly Support Freedom',
            '5': 'Strongly Support Harmony',
          }}
          perModel={{
            model1: {
              sampleSize: 3,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          }}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              s1: { A: 'a1', B: 'b1' },
              s2: { A: 'a1', B: 'b2' },
              s3: { A: 'a2', B: 'b2' },
            },
            modelScenarioMatrix: {
              model1: {
                // rounds to 1 => Attribute A
                s1: 1.4,
                // rounds to 3 => Neutral
                s2: 2.6,
                // rounds to 5 => Attribute B
                s3: 4.6,
              },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Freedom')).toBeInTheDocument();
    expect(screen.getByText('Harmony')).toBeInTheDocument();
    expect(screen.getByText('Neutral')).toBeInTheDocument();

    // There should be exactly three count cells for the only model row: 1 / 1 / 1.
    const ones = screen.getAllByText('1');
    expect(ones.length).toBe(3);
  });
});
