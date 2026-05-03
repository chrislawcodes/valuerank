import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CoverageCell } from '../../../src/components/domains/CoverageCell';

function renderCell(overrides: Partial<Parameters<typeof CoverageCell>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/coverage']}>
      <Routes>
        <Route
          path="/coverage"
          element={(
            <div>
              <CoverageCell
                valueA="Achievement"
                valueB="Power_Dominance"
                batchEquivalent={2}
                aFirstBatchEquivalent={2}
                bFirstBatchEquivalent={3}
                aFirstDefinitionName="Achievement-first vignette"
                bFirstDefinitionName="Power-first vignette"
                weakestCondition={{
                  conditionLabel: '5×1',
                  modelCounts: [
                    { modelId: 'gpt-4', label: 'GPT-4', trialCount: 3 },
                    { modelId: 'gpt-5', label: 'GPT-5', trialCount: 2 },
                  ],
                  otherConditionsCount: 4,
                }}
                contributingDefinitionIds={['def-a', 'def-b']}
                definitionId="def-1"
                aggregateRunId={null}
                {...overrides}
              />
            </div>
          )}
        />
        <Route path="/definitions/:id/start-paired-batch" element={<LocationStateProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationStateProbe() {
  const location = useLocation();
  return <pre data-testid="location-state">{JSON.stringify(location.state)}</pre>;
}

describe('CoverageCell', () => {
  it('shows the direction breakdown, weakest condition, and top-up action for imbalanced cells', async () => {
    const user = userEvent.setup();
    renderCell();

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByText('2 batch equivalents')).toBeInTheDocument();
    expect(screen.getByText('Achievement-first vignette')).toBeInTheDocument();
    expect(screen.getByText('Power-first vignette')).toBeInTheDocument();
    expect(screen.getByText('Weakest condition')).toBeInTheDocument();
    expect(screen.getByText('(Achievement-first vignette)')).toBeInTheDocument();
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('GPT-5')).toBeInTheDocument();
    expect(screen.getByText('All other conditions: 4 per model')).toBeInTheDocument();

    const matchPairCountsLink = screen.getByRole('link', { name: /match pair counts/i });
    expect(matchPairCountsLink).toHaveAttribute('href', '/definitions/def-1/start-paired-batch');

    await user.click(matchPairCountsLink);

    const state = JSON.parse(screen.getByTestId('location-state').textContent ?? '{}') as {
      matchPairCounts?: {
        pairKey: string;
        valueA: string;
        valueB: string;
        launchDefinitionId: string;
        laggingDirection: string;
        contributingDefinitionIds: string[];
        before: {
          directionA: { name: string; batches: number; conditions: number };
          directionB: { name: string; batches: number; conditions: number };
        };
      };
    };
    expect(state.matchPairCounts).toEqual(expect.objectContaining({
      pairKey: 'achievement::power_dominance',
      valueA: 'Achievement',
      valueB: 'Power_Dominance',
      launchDefinitionId: 'def-1',
      laggingDirection: 'Achievement',
      contributingDefinitionIds: ['def-a', 'def-b'],
      before: expect.objectContaining({
        directionA: expect.objectContaining({ name: 'Achievement', batches: 2, conditions: 2 }),
        directionB: expect.objectContaining({ name: 'Power_Dominance', batches: 3, conditions: 3 }),
      }),
    }));
  });

  it('hides Match Pair Counts on cells with no imbalance signal, even when aggregateRunId is set', async () => {
    // Regression for diff-review HIGH (2026-04-27): an earlier draft gated the
    // Match Pair Counts CTA on `aggregateRunId === null`. The resolver sets
    // `aggregateRunId` from `latestAggregateRunIdByDefinitionId ?? latestMatchingRunIdByDefinitionId`,
    // so it is non-null on every cell with any completed run — the gate was
    // hiding the CTA on virtually every cell with real data. The correct gate
    // is `hasImbalance` only. So setting aggregateRunId without any imbalance
    // signal must hide the CTA.
    const user = userEvent.setup();
    renderCell({
      aggregateRunId: 'run-1',
      aFirstBatchEquivalent: 2,
      bFirstBatchEquivalent: 2,
      weakestCondition: null,
    });

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByRole('link', { name: /start paired batch/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /match pair counts/i })).not.toBeInTheDocument();
  });

  it('shows Match Pair Counts on imbalanced cells regardless of aggregateRunId', async () => {
    // Companion to the test above: when the cell has an imbalance signal
    // (mismatched a/b-first batch equivalents), the CTA must show even when
    // aggregateRunId is non-null.
    const user = userEvent.setup();
    renderCell({
      aggregateRunId: 'run-1',
      aFirstBatchEquivalent: 1,
      bFirstBatchEquivalent: 2,
      weakestCondition: null,
    });

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByRole('link', { name: /match pair counts/i })).toBeInTheDocument();
  });
});
