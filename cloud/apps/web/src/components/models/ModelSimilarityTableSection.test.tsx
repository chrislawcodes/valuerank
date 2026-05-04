import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelSimilarityTableSection } from './ModelSimilarityTableSection';
import { VALUES, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';

function makeRecord(value: number | null): Record<ValueKey, number | null> {
  return Object.fromEntries(VALUES.map((key) => [key, value])) as Record<ValueKey, number | null>;
}

function makeModel(model: string, label: string, winRate: number): ModelEntry {
  return {
    model,
    label,
    values: makeRecord(0) as Record<ValueKey, number>,
    winRates: makeRecord(winRate),
  };
}

describe('ModelSimilarityTableSection', () => {
  it('shows weighted euclidean distance and opens the pair detail drawer', async () => {
    const user = userEvent.setup();

    render(
      <ModelSimilarityTableSection
        models={[
          makeModel('model-a', 'Model A', 80),
          makeModel('model-b', 'Model B', 60),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Model Similarity Table' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Distance' }).className.includes('bg-teal-600')).toBe(true);
    expect(screen.getAllByText('20.00').length).toBeGreaterThan(0);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Similarity' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('0.80').length).toBeGreaterThan(0);
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

    expect(drawerTable.getByText('Sum of weighted diff²')).toBeTruthy();
    expect(drawerTable.getByText('Square root = distance')).toBeTruthy();
    expect(drawerTable.getAllByText('20.00').length).toBeGreaterThan(0);
  });
});
