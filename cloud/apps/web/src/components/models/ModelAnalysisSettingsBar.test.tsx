import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelAnalysisSettingsBar } from './ModelAnalysisSettingsBar';

describe('ModelAnalysisSettingsBar', () => {
  it('renders the shared analysis controls and forwards toggle changes', async () => {
    const user = userEvent.setup();
    const onDataSourceChange = vi.fn();
    const onSimilarityMethodChange = vi.fn();

    render(
      <ModelAnalysisSettingsBar
        dataSource="log-odds"
        onDataSourceChange={onDataSourceChange}
        similarityMethod="weighted-euclidean"
        onSimilarityMethodChange={onSimilarityMethodChange}
      />,
    );

    expect(screen.getByText('Analysis settings')).toBeTruthy();
    expect(screen.getByText('Affects all reports on this page.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log Odds' }).className.includes('bg-teal-600')).toBe(true);
    expect(screen.getByRole('button', { name: 'Weighted Euclidean' }).className.includes('bg-teal-600')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Win Rate' }));
    await user.click(screen.getByRole('button', { name: 'Kendall' }));

    expect(onDataSourceChange).toHaveBeenCalledWith('win-rate');
    expect(onSimilarityMethodChange).toHaveBeenCalledWith('kendall');
  });
});
