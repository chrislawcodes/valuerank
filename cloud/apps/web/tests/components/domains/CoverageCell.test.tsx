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
                batchCount={4}
                pairedBatchCount={2}
                orphanedBatchCount={0}
                aFirstBatchCount={2}
                bFirstBatchCount={2}
                pairedConditionCount={8}
                orphanedConditionCount={0}
                directionalCoverage={[
                  {
                    direction: 'Achievement',
                    completeBatches: 2,
                    filledSlots: 8,
                    leftoverConditions: 1,
                    definitionIds: ['def-a'],
                  },
                  {
                    direction: 'Power_Dominance',
                    completeBatches: 2,
                    filledSlots: 10,
                    leftoverConditions: 2,
                    definitionIds: ['def-b'],
                  },
                ]}
                contributingDefinitionIds={['def-a', 'def-b']}
                incompleteBatchCount={1}
                definitionId="def-1"
                aggregateRunId={null}
                modelBreakdown={[
                  { modelId: 'gpt-4', label: 'GPT-4', trialCount: 3 },
                ]}
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
  it('shows the direction table, transcripts header, and top-up action for imbalanced cells', async () => {
    const user = userEvent.setup();
    renderCell();

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByText('Direction imbalance')).toBeInTheDocument();
    expect(screen.getByText('Batches')).toBeInTheDocument();
    expect(screen.getByText('Conditions')).toBeInTheDocument();
    expect(screen.getByText('Achievement-first')).toBeInTheDocument();
    expect(screen.getByText('Power-first')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getByText('Transcripts')).toBeInTheDocument();
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('1 incomplete batch — not all transcripts generated')).toBeInTheDocument();

    const matchPairCountsLink = screen.getByRole('link', { name: /match pair counts/i });
    expect(matchPairCountsLink).toHaveAttribute('href', '/definitions/def-a/start-paired-batch');

    await user.click(matchPairCountsLink);

    const state = JSON.parse(screen.getByTestId('location-state').textContent ?? '{}') as {
      matchPairCounts?: {
        pairKey: string;
        valueA: string;
        valueB: string;
        launchDefinitionId: string;
        laggingDirection: string;
        contributingDefinitionIds: string[];
      };
    };
    expect(state.matchPairCounts).toEqual(expect.objectContaining({
      pairKey: 'achievement::power_dominance',
      valueA: 'Achievement',
      valueB: 'Power_Dominance',
      launchDefinitionId: 'def-a',
      laggingDirection: 'Achievement',
      contributingDefinitionIds: ['def-a', 'def-b'],
    }));
  });

  it('hides Match Pair Counts on cells with no imbalance signal, even when aggregateRunId is set', async () => {
    // Regression for diff-review HIGH (2026-04-27): an earlier draft gated the
    // Match Pair Counts CTA on `aggregateRunId === null`. The resolver sets
    // `aggregateRunId` from `latestAggregateRunIdByDefinitionId ?? latestMatchingRunIdByDefinitionId`,
    // so it is non-null on every cell with any completed run — the gate was
    // hiding the CTA on virtually every cell with real data. The correct gate
    // is `hasImbalance` only; cells with purely aggregate data already report
    // `orphanedBatchCount = 0` and `orphanedConditionCount = 0` because the
    // resolver excludes aggregate runs from those counts. So setting
    // aggregateRunId without any imbalance signal must hide the CTA.
    const user = userEvent.setup();
    renderCell({
      aggregateRunId: 'run-1',
      orphanedBatchCount: 0,
      orphanedConditionCount: 0,
      aFirstBatchCount: 2,
      bFirstBatchCount: 2,
      directionalCoverage: [
        { direction: 'Achievement', completeBatches: 2, filledSlots: 8, leftoverConditions: 0, definitionIds: ['def-a'] },
        { direction: 'Power_Dominance', completeBatches: 2, filledSlots: 8, leftoverConditions: 0, definitionIds: ['def-b'] },
      ],
      incompleteBatchCount: 0,
    });

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByRole('link', { name: /start paired batch/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /match pair counts/i })).not.toBeInTheDocument();
  });

  it('shows Match Pair Counts on imbalanced cells regardless of aggregateRunId', async () => {
    // Companion to the test above: when the cell has an imbalance signal
    // (orphanedBatchCount, orphanedConditionCount, mismatched filledSlots, or
    // mismatched a/b-first batch counts), the CTA must show even when
    // aggregateRunId is non-null.
    const user = userEvent.setup();
    renderCell({
      aggregateRunId: 'run-1',
    });

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByRole('link', { name: /match pair counts/i })).toBeInTheDocument();
  });
});
