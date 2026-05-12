import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisContextBar } from './AnalysisContextBar';

const domain = {
  label: 'Domain',
  value: 'dom1',
  options: [{ value: 'dom1', label: 'Test Domain' }],
  onChange: vi.fn(),
};

const signature = {
  label: 'Signature',
  value: 'sig1',
  options: [{ value: 'sig1', label: 'Test Sig' }],
  onChange: vi.fn(),
};

function renderBar(winRateMode?: {
  value: 'all' | 'exc-neutral';
  onChange: (mode: 'all' | 'exc-neutral') => void;
  disabled?: boolean;
}) {
  render(
    <AnalysisContextBar
      domain={domain}
      signature={signature}
      winRateMode={winRateMode}
    />,
  );
}

describe('AnalysisContextBar', () => {
  it('renders win rate buttons when winRateMode is provided', () => {
    renderBar({
      value: 'all',
      onChange: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'All responses' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Exc. neutral' })).not.toBeNull();
  });

  it('does not render win rate buttons when winRateMode is omitted', () => {
    renderBar();

    expect(screen.queryByRole('button', { name: 'All responses' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exc. neutral' })).toBeNull();
  });

  it('disables win rate buttons and shows a tooltip when disabled', () => {
    renderBar({
      value: 'all',
      onChange: vi.fn(),
      disabled: true,
    });

    const allResponses = screen.getByRole('button', { name: 'All responses' });
    const excNeutral = screen.getByRole('button', { name: 'Exc. neutral' });

    expect((allResponses as HTMLButtonElement).disabled).toBe(true);
    expect(allResponses.getAttribute('title')).toBe('Only applies when data source is Win Rate');
    expect((excNeutral as HTMLButtonElement).disabled).toBe(true);
    expect(excNeutral.getAttribute('title')).toBe('Only applies when data source is Win Rate');
  });

  it('calls onChange with exc-neutral when clicking Exc. neutral', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({
      value: 'all',
      onChange,
    });

    await user.click(screen.getByRole('button', { name: 'Exc. neutral' }));

    expect(onChange).toHaveBeenCalledWith('exc-neutral');
  });

  it('calls onChange with all when clicking All responses', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({
      value: 'exc-neutral',
      onChange,
    });

    await user.click(screen.getByRole('button', { name: 'All responses' }));

    expect(onChange).toHaveBeenCalledWith('all');
  });
});
