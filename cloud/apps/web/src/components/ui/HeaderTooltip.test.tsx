import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { HeaderTooltip } from './HeaderTooltip';

describe('HeaderTooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows and hides the tooltip on focus and blur', () => {
    render(<HeaderTooltip label="Model" content="The model in this row." />);

    const trigger = screen.getByRole('button', { name: /show model help/i });
    fireEvent.focus(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent ?? '').toContain('The model in this row.');
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows and hides the tooltip on hover with the primitive delay', () => {
    vi.useFakeTimers();
    render(<HeaderTooltip label="Model" content="The model in this row." />);

    const trigger = screen.getByRole('button', { name: /show model help/i });
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('The model in this row.');

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stops click propagation to a parent header', () => {
    const onClick = vi.fn();
    render(
      <div onClick={onClick}>
        <HeaderTooltip label="Model" content="The model in this row." />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /show model help/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
