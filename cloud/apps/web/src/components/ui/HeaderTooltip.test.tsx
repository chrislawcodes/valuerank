import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { HeaderTooltip } from './HeaderTooltip';
import { Tooltip } from './Tooltip';
import { Button } from './Button';

describe('HeaderTooltip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('repositions the tooltip when the page scrolls', () => {
    const rects = [
      { top: 100, left: 200, width: 24, height: 24, right: 224, bottom: 124, x: 200, y: 100, toJSON: () => undefined },
      { top: 0, left: 0, width: 120, height: 32, right: 120, bottom: 32, x: 0, y: 0, toJSON: () => undefined },
      { top: 140, left: 200, width: 24, height: 24, right: 224, bottom: 164, x: 200, y: 140, toJSON: () => undefined },
      { top: 0, left: 0, width: 120, height: 32, right: 120, bottom: 32, x: 0, y: 0, toJSON: () => undefined },
    ] as const;

    let callIndex = 0;
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
      const rect = rects[Math.min(callIndex, rects.length - 1)];
      callIndex += 1;
      return rect as DOMRect;
    });

    render(
      <Tooltip content="Tooltip content">
        <Button type="button" variant="secondary">
          Anchor
        </Button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Anchor' }));
    const tooltip = screen.getByRole('tooltip');
    const initialTop = tooltip.style.top;

    fireEvent.scroll(window);

    expect(screen.getByRole('tooltip').style.top).not.toBe(initialTop);

    rectSpy.mockRestore();
  });
});
