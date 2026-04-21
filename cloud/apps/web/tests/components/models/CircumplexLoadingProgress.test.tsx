import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircumplexLoadingProgress } from '../../../src/components/models/CircumplexLoadingProgress';

describe('CircumplexLoadingProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an estimated percent and advances while loading', () => {
    render(<CircumplexLoadingProgress modelCount={4} signature="vnewtd" stage="analyze" threshold={5} />);

    const progress = screen.getByRole('progressbar', { name: /estimated circumplex loading progress/i });
    expect(progress).toHaveAttribute('aria-valuenow', '35');
    expect(screen.getByText(/4 models on/i)).toBeInTheDocument();
    expect(screen.getByText(/This is an estimate/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(35);
  });
});
