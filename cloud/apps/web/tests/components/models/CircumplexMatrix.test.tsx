import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CircumplexMatrix } from '../../../src/components/models/CircumplexMatrix';
import type { ValueKey } from '../../../src/data/domainAnalysisData';

const valueOrder: ValueKey[] = [
  'Self_Direction_Action',
  'Universalism_Nature',
  'Benevolence_Dependability',
];

describe('CircumplexMatrix', () => {
  it('labels cells as profile correlations and renders numeric values in cells', () => {
    render(
      <CircumplexMatrix
        matrix={[
          [1, 0.73, -0.42],
          [0.73, 1, 0.25],
          [-0.42, 0.25, 1],
        ]}
        pairTrialCounts={[
          [0, 30, 30],
          [30, 0, 8],
          [30, 8, 0],
        ]}
        valueOrder={valueOrder}
        excludedValues={new Set()}
      />,
    );

    expect(screen.getByText(/not the direct win rate/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.73')).toHaveLength(2);
    expect(screen.getAllByText('-0.42')).toHaveLength(2);
    expect(screen.getAllByText('0.25')).toHaveLength(2);
    expect(screen.queryByText('n=8')).not.toBeInTheDocument();
  });
});
