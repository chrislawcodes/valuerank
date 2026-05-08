import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { PairwiseDivergenceDrilldownReport } from './PairwiseDivergenceDrilldownReport';
import { useModelPairDivergenceBreakdownQuery } from '../../generated/graphql';

vi.mock('../../generated/graphql', () => ({
  useModelPairDivergenceBreakdownQuery: vi.fn(),
}));

const mockedUseModelPairDivergenceBreakdownQuery = vi.mocked(useModelPairDivergenceBreakdownQuery);

describe('PairwiseDivergenceDrilldownReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedUseModelPairDivergenceBreakdownQuery.mockReturnValue([
      {
        data: undefined,
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ] as unknown as ReturnType<typeof useModelPairDivergenceBreakdownQuery>);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls again while the divergence breakdown is pending', () => {
    const reexecuteQuery = vi.fn();
    mockedUseModelPairDivergenceBreakdownQuery.mockReturnValue([
      {
        data: {
          modelPairDivergenceBreakdown: {
            __typename: 'PairDivergenceBreakdown',
            pending: true,
            buildProgress: {
              __typename: 'ModelAgreementBuildProgress',
              completedRuns: 3,
              totalRuns: 8,
              currentRunId: 'run-3',
              updatedAt: '2026-05-08T15:00:00.000Z',
            },
            modelAId: 'alpha',
            modelALabel: 'Alpha',
            modelBId: 'beta',
            modelBLabel: 'Beta',
            perValuePair: [],
          },
        },
        fetching: false,
        error: undefined,
      },
      reexecuteQuery,
    ] as unknown as ReturnType<typeof useModelPairDivergenceBreakdownQuery>);

    render(
      <PairwiseDivergenceDrilldownReport
        selectedPair={{ modelAId: 'alpha', modelBId: 'beta' }}
        scope="ALL_DOMAINS"
        domainId={null}
        signature="vnewtd"
      />,
    );

    expect(screen.getByText('3 of 8 source runs processed. Currently on run-3.')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(reexecuteQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
  });
});
