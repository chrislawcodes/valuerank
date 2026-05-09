import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelSimilarityTableSection } from './ModelSimilarityTableSection';
import { type PairwiseKappaEntry } from './ModelSimilarityMetrics';
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
  it('renders kappa values when method is kappa and pairwiseKappa map is provided', () => {
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
    const entry: PairwiseKappaEntry = { kappa: 0.75, kappaSpread: 0.30, kappaByDomain: [] };
    const pairwiseKappa = new Map([
      ['model-a', new Map([['model-b', entry]])],
      ['model-b', new Map([['model-a', entry]])],
    ]);

    render(
      <ModelSimilarityTableSection
        models={[modelA, modelB]}
        method="kappa"
        pairwiseKappa={pairwiseKappa}
      />,
    );

    // Default view is 'distance'; kappa=0.75 → distance = 1 - 0.75 = 0.25.
    expect(screen.getAllByText('0.25').length).toBeGreaterThan(0);
  });

  it('shows 1 - kappa in distance view and kappa in similarity view for kappa method', async () => {
    const user = userEvent.setup();
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
    // kappa = 0.70 → distance = 0.30, similarity = 0.70
    const entry070: PairwiseKappaEntry = { kappa: 0.70, kappaSpread: null, kappaByDomain: [] };
    const pairwiseKappa = new Map([
      ['model-a', new Map([['model-b', entry070]])],
      ['model-b', new Map([['model-a', entry070]])],
    ]);

    render(
      <ModelSimilarityTableSection
        models={[modelA, modelB]}
        method="kappa"
        pairwiseKappa={pairwiseKappa}
      />,
    );

    // Default view is 'distance' (1 - kappa = 1 - 0.70 = 0.30)
    expect(screen.getAllByText('0.30').length).toBeGreaterThan(0);

    // Switch to similarity view — should show 0.70 (the kappa itself)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Similarity' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('0.70').length).toBeGreaterThan(0);
    });
  });

  it('renders em-dash for missing kappa cells', () => {
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
    // Empty pairwiseKappa — no data for any pair.
    const pairwiseKappa = new Map<string, Map<string, PairwiseKappaEntry>>();

    render(
      <ModelSimilarityTableSection
        models={[modelA, modelB]}
        method="kappa"
        pairwiseKappa={pairwiseKappa}
      />,
    );

    // Only the self cells and unavailable pair cells show '—'.
    const dashes = screen.getAllByText('—');
    // At least the pair cell (2 cells: A→B and B→A) plus 2 self cells = 4 dashes.
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the selected method and opens the pair detail drawer', async () => {
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

    expect(screen.getByRole('heading', { name: 'Similarity by Model' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Weighted Euclidean' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Spearman' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Distance' }).className.includes('bg-teal-600')).toBe(true);
    expect(screen.getAllByText('10.00').length).toBeGreaterThan(0);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Similarity' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('0.90').length).toBeGreaterThan(0);
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

    expect(drawerTable.getAllByText('Weighted Euclidean distance').length).toBeGreaterThan(0);
    expect(drawerTable.getByText('Sum of weighted diff²')).toBeTruthy();
    expect(drawerTable.getAllByText('10.00').length).toBeGreaterThan(0);
  });

  it('renders 1-domain note for kappa method when only one domain is present', () => {
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
    const entry: PairwiseKappaEntry = {
      kappa: 0.60,
      kappaSpread: null,
      kappaByDomain: [{ domainId: 'dom-1', domainName: 'Domain 1', kappa: 0.60, cellCount: 12 }],
    };
    const pairwiseKappa = new Map([
      ['model-a', new Map([['model-b', entry]])],
      ['model-b', new Map([['model-a', entry]])],
    ]);

    render(
      <ModelSimilarityTableSection
        models={[modelA, modelB]}
        method="kappa"
        pairwiseKappa={pairwiseKappa}
      />,
    );

    const domainElements = screen.getAllByText('(1 domain)');
    expect(domainElements.length).toBeGreaterThan(0);
  });

  it('renders spread line for kappa method when multiple domains are present', () => {
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
    const entry: PairwiseKappaEntry = {
      kappa: 0.65,
      kappaSpread: 0.22,
      kappaByDomain: [
        { domainId: 'dom-1', domainName: 'Domain 1', kappa: 0.54, cellCount: 10 },
        { domainId: 'dom-2', domainName: 'Domain 2', kappa: 0.76, cellCount: 10 },
      ],
    };
    const pairwiseKappa = new Map([
      ['model-a', new Map([['model-b', entry]])],
      ['model-b', new Map([['model-a', entry]])],
    ]);

    render(
      <ModelSimilarityTableSection
        models={[modelA, modelB]}
        method="kappa"
        pairwiseKappa={pairwiseKappa}
      />,
    );

    const spreadElements = screen.getAllByText('(spread 0.22)');
    expect(spreadElements.length).toBeGreaterThan(0);
  });

  it('shows wide-spread warning for kappa cells with wide spread', () => {
    const modelA = makeModel('model-a', 'Model A', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const modelB = makeModel('model-b', 'Model B', [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
    const entry: PairwiseKappaEntry = {
      kappa: 0.50,
      kappaSpread: 0.80,
      kappaByDomain: [
        { domainId: 'dom-1', domainName: 'Domain 1', kappa: 0.10, cellCount: 10 },
        { domainId: 'dom-2', domainName: 'Domain 2', kappa: 0.90, cellCount: 10 },
      ],
    };
    const pairwiseKappa = new Map([
      ['model-a', new Map([['model-b', entry]])],
      ['model-b', new Map([['model-a', entry]])],
    ]);

    render(
      <ModelSimilarityTableSection
        models={[modelA, modelB]}
        method="kappa"
        pairwiseKappa={pairwiseKappa}
      />,
    );

    const warnings = screen.getAllByTitle('Kappa varies significantly by domain');
    expect(warnings.length).toBeGreaterThan(0);
  });
});
