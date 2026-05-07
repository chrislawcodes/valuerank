import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('urql', () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from 'urql';
import type { DomainAnalysisPairDetailQueryResult } from '../../../api/operations/domainAnalysis';
import { PairwiseCellDrawer } from '../PairwiseCellDrawer';

const mockedUseQuery = vi.mocked(useQuery);

function createResult(): DomainAnalysisPairDetailQueryResult {
  return {
    domainAnalysisPairDetail: {
      __typename: 'DomainAnalysisPairDetailResult',
      rowValueKey: 'Achievement',
      columnValueKey: 'Security_Personal',
      modelId: 'model-a',
      modelLabel: 'Model A',
      domainId: 'domain-a',
      domainName: 'Domain A',
      pooledMin: 0.4,
      pooledMean: 0.55,
      pooledMax: 0.7,
      iSquared: 73,
      vignetteCount: 2,
      validEstimateCount: 2,
      vignettes: [
        {
          __typename: 'DomainAnalysisPairVignetteDetail',
          definitionId: 'def-a',
          definitionName: 'Achievement first',
          prioritized: 14,
          deprioritized: 6,
          neutral: 0,
          totalTrials: 20,
          selectedValueWinRate: 0.7,
          winRateCI95Low: 0.48,
          winRateCI95High: 0.85,
          refusalRate: 0,
          framingDirection: 'A_TO_B',
        },
        {
          __typename: 'DomainAnalysisPairVignetteDetail',
          definitionId: 'def-b',
          definitionName: 'Security first',
          prioritized: 8,
          deprioritized: 12,
          neutral: 0,
          totalTrials: 20,
          selectedValueWinRate: 0.4,
          winRateCI95Low: 0.22,
          winRateCI95High: 0.61,
          refusalRate: 0,
          framingDirection: 'B_TO_A',
        },
      ],
    },
  };
}

function renderDrawer() {
  render(
    <MemoryRouter>
      <PairwiseCellDrawer
        open
        rowValueKey="Achievement"
        columnValueKey="Security_Personal"
        modelId="model-a"
        domainId="domain-a"
        signature="vnewtd"
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('PairwiseCellDrawer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens with a forest plot for a valid pair', () => {
    mockedUseQuery.mockReturnValue([
      { data: createResult(), fetching: false, error: undefined, stale: false, operation: undefined, extensions: undefined, hasNext: false },
      vi.fn(),
    ]);

    renderDrawer();

    expect(screen.getByRole('heading', { name: 'Achievement vs Security' })).toBeTruthy();
    expect(screen.getByLabelText('Forest plot with 1 row')).toBeTruthy();
  });

  it('shows the pooled mean from the query result', () => {
    mockedUseQuery.mockReturnValue([
      { data: createResult(), fetching: false, error: undefined, stale: false, operation: undefined, extensions: undefined, hasNext: false },
      vi.fn(),
    ]);

    renderDrawer();

    expect(screen.getByText('55.0%')).toBeTruthy();
    expect(screen.getByText('Mean 55.0%')).toBeTruthy();
  });

  it('changes the displayed row count when split view is toggled', async () => {
    const user = userEvent.setup();
    mockedUseQuery.mockReturnValue([
      { data: createResult(), fetching: false, error: undefined, stale: false, operation: undefined, extensions: undefined, hasNext: false },
      vi.fn(),
    ]);

    renderDrawer();

    expect(screen.getByLabelText('Forest plot with 1 row')).toBeTruthy();

    await user.click(screen.getByLabelText(/split by direction/i));

    expect(screen.getByLabelText('Forest plot with 2 rows')).toBeTruthy();
  });
});
