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

  it('keeps Match Pair Counts hidden on aggregate cells', async () => {
    const user = userEvent.setup();
    renderCell({
      aggregateRunId: 'run-1',
    });

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByRole('link', { name: /start paired batch/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /match pair counts/i })).not.toBeInTheDocument();
  });
});
