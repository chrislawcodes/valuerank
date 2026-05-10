import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
        <Route path="/definitions/:id" element={<div>Definition Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CoverageCell', () => {
  it('shows the direction breakdown, weakest condition, and a Start Trial action', async () => {
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

    const startTrialLink = screen.getByRole('link', { name: /start trial/i });
    expect(startTrialLink).toHaveAttribute('href', '/definitions/def-1');
  });

  it('still renders the Start Trial action when there is no imbalance', async () => {
    const user = userEvent.setup();
    renderCell({
      aggregateRunId: 'run-1',
      aFirstBatchEquivalent: 2,
      bFirstBatchEquivalent: 2,
      weakestCondition: null,
    });

    await user.click(screen.getByRole('button', { name: /power versus achievement/i }));

    expect(screen.getByRole('link', { name: /start trial/i })).toBeInTheDocument();
  });
});
