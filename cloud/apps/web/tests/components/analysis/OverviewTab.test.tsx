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
              s1: { Freedom: 'a1', Harmony: 'b1' },
              s2: { Freedom: 'a1', Harmony: 'b2' },
              s3: { Freedom: 'a2', Harmony: 'b2' },
              s4: { Freedom: 'a2', Harmony: 'b1' },
            },
            modelScenarioMatrix: {
              model1: {
                // rounds to 1 => Attribute A
                s1: 1.4,
                // rounds to 3 => Neutral
                s2: 2.6,
                // rounds to 5 => Attribute B
                s3: 4.6,
                // rounds to 2 => Attribute A
                s4: 1.6,
              },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Freedom')).toBeInTheDocument();
    expect(screen.getByText('Harmony')).toBeInTheDocument();
    expect(screen.getByText('Neutral')).toBeInTheDocument();

    // Counts for model1: A=2, Neutral=1, B=1
    expect(screen.getByText('2')).toBeInTheDocument();
    const ones = screen.getAllByText('1');
    expect(ones.length).toBe(2);

    // Largest count cell (A=2) is highlighted with its side color.
    const aCell = screen.getByText('2').closest('td');
    expect(aCell).toHaveClass('bg-blue-50');
  });
});
