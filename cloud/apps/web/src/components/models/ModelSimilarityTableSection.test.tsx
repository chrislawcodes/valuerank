import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelSimilarityTableSection } from './ModelSimilarityTableSection';
import { VALUES, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';

function makeRecord(values: number[]): Record<ValueKey, number | null> {
  return Object.fromEntries(VALUES.map((key, index) => [key, values[index] ?? null])) as Record<ValueKey, number | null>;
}

function makeModel(model: string, label: string, winRates: number[]): ModelEntry {
  return {
    model,
    label,
    values: makeRecord(winRates) as Record<ValueKey, number>,
    winRates: makeRecord(winRates),
  };
}

describe('ModelSimilarityTableSection', () => {
  it('shows calculation toggles and opens the pair detail drawer', async () => {
    const user = userEvent.setup();
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);

    render(
      <ModelSimilarityTableSection
        models={[
          modelA,
          modelB,
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Model Similarity Table' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Absolute Value' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Weighted Euclidean' }).className.includes('bg-teal-600')).toBe(true);
    expect(screen.getByRole('button', { name: 'Distance' }).className.includes('bg-teal-600')).toBe(true);
    expect(screen.getAllByText('10.00').length).toBeGreaterThan(0);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Similarity' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('0.90').length).toBeGreaterThan(0);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Spearman' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('1.00').length).toBeGreaterThan(0);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Open details for Model A and Model B/i }));
    });

    const heading = await screen.findByRole('heading', { name: 'Model A vs Model B' });
    const drawer = heading.closest('aside');
    expect(drawer).not.toBeNull();

    const drawerTable = within(drawer as HTMLElement);
    expect(drawerTable.getByText('Win rate')).toBeTruthy();
    expect(drawerTable.getAllByText('Model A').length).toBeGreaterThan(0);
    expect(drawerTable.getAllByText('Model B').length).toBeGreaterThan(0);

    const table = drawerTable.getByText('Step-by-step calculation').closest('section');
    expect(table).not.toBeNull();

    expect(drawerTable.getAllByText('Spearman rho').length).toBeGreaterThan(0);
    expect(drawerTable.getByText('Sum of rank diff²')).toBeTruthy();
    expect(drawerTable.getAllByText('1.00').length).toBeGreaterThan(0);
  });
});
