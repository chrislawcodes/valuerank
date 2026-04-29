import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StabilityDots } from '../../../src/components/models/StabilityDotsView.tsx';

describe('StabilityDots', () => {
  it('renders a full-size half-filled circle for half states', () => {
    const { container } = render(<StabilityDots score={55} title="Stability 55/100" />);

    const dots = container.querySelectorAll('[data-state]');
    const halfDot = container.querySelector('[data-state="half"]');

    expect(dots).toHaveLength(5);
    expect(halfDot).not.toBeNull();
    const halfCircle = halfDot as HTMLElement;
    expect(halfCircle).toHaveClass('inline-block', 'h-1.5', 'w-1.5', 'overflow-hidden', 'rounded-full', 'border', 'border-current');

    const fill = halfCircle.firstElementChild as HTMLElement;
    expect(fill).toHaveClass('absolute', 'inset-y-0', 'left-0', 'w-1/2', 'bg-current');
  });
});
