import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PressureSensitivitySanityCheck } from './PressureSensitivitySanityCheck';
import type { DirectionalSanityCheck } from '../../api/operations/pressureSensitivity';

function createData(): DirectionalSanityCheck {
  return {
    positivePct: 68,
    flatPct: 20,
    negativePct: 12,
    measuredCount: 2,
    unmeasurableCount: 1,
    breakdown: [
      {
        modelId: 'model-a',
        pairKey: 'alpha::beta',
        winRateDelta: 0.031,
        classification: 'positive',
      },
    ],
  };
}

describe('PressureSensitivitySanityCheck', () => {
  it('renames the panel and table labels to win rate', () => {
    render(<PressureSensitivitySanityCheck data={createData()} />);

    expect(screen.getByText('Win rate sanity check')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /show breakdown/i }));
    expect(screen.getByText('Win rate Δ')).toBeDefined();
    expect(screen.getByText('+0.031')).toBeDefined();
    expect(screen.getByText(/Below 70% positive movement/)).toBeDefined();
  });
});
