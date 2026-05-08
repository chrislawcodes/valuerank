import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PairwiseDivergenceDrilldownReport } from './PairwiseDivergenceDrilldownReport';
import { useModelPairDivergenceBreakdownQuery } from '../../generated/graphql';

vi.mock('../../generated/graphql', () => ({
  useModelPairDivergenceBreakdownQuery: vi.fn(),
}));

const mockedUseModelPairDivergenceBreakdownQuery = vi.mocked(useModelPairDivergenceBreakdownQuery);

describe('PairwiseDivergenceDrilldownReport', () => {
  mockedUseModelPairDivergenceBreakdownQuery.mockReturnValue([
    {
      data: undefined,
      fetching: false,
      error: undefined,
    },
    vi.fn(),
  ] as unknown as ReturnType<typeof useModelPairDivergenceBreakdownQuery>);

  it('renders a placeholder when no pair is selected', () => {
    render(
      <PairwiseDivergenceDrilldownReport
        selectedPair={null}
        scope="ALL_DOMAINS"
        domainId={null}
        signature="sig"
      />,
    );

    expect(
      screen.getByText('Select a model pair from the matrix above to see per-value-pair divergence.'),
    ).toBeDefined();
  });

  it('renders the divergence table sorted by mean absolute divergence descending', () => {
    mockedUseModelPairDivergenceBreakdownQuery.mockReturnValue([
      {
        data: {
          modelPairDivergenceBreakdown: {
            __typename: 'PairDivergenceBreakdown',
            pending: false,
            modelAId: 'alpha',
            modelALabel: 'Alpha',
            modelBId: 'beta',
            modelBLabel: 'Beta',
            perValuePair: [
              {
                __typename: 'ValuePairDivergence',
                valueA: 'Tradition',
                valueB: 'Security',
                cellsCompared: 12,
                meanAbsoluteDivergence: 0.2,
                modelAProportionA: 0.6,
                modelBProportionA: 0.4,
              },
              {
                __typename: 'ValuePairDivergence',
                valueA: 'Achievement',
                valueB: 'Tradition',
                cellsCompared: 8,
                meanAbsoluteDivergence: 0.9,
                modelAProportionA: 0.1,
                modelBProportionA: 1,
              },
              {
                __typename: 'ValuePairDivergence',
                valueA: 'Security',
                valueB: 'Universalism',
                cellsCompared: 4,
                meanAbsoluteDivergence: 0.3,
                modelAProportionA: 0.7,
                modelBProportionA: 0.4,
              },
            ],
          },
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ] as unknown as ReturnType<typeof useModelPairDivergenceBreakdownQuery>);

    render(
      <PairwiseDivergenceDrilldownReport
        selectedPair={{ modelAId: 'alpha', modelBId: 'beta' }}
        scope="ALL_DOMAINS"
        domainId={null}
        signature="sig"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Alpha vs Beta' })).toBeDefined();

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Achievement vs Tradition');
    expect(rows[1]?.textContent ?? '').toContain('90.0%');
  });
});
