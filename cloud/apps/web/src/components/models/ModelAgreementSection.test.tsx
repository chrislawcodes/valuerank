import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ModelAgreementSection } from './ModelAgreementSection';
import { useModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

vi.mock('../../generated/graphql', () => ({
  useModelAgreementOnTradeoffsQuery: vi.fn(),
}));

const mockedUseModelAgreementOnTradeoffsQuery = vi.mocked(useModelAgreementOnTradeoffsQuery);

describe('ModelAgreementSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedUseModelAgreementOnTradeoffsQuery.mockReturnValue([
      {
        data: undefined,
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ] as unknown as ReturnType<typeof useModelAgreementOnTradeoffsQuery>);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls again while the agreement report is pending', () => {
    const reexecuteQuery = vi.fn();
    mockedUseModelAgreementOnTradeoffsQuery.mockReturnValue([
      {
        data: {
          modelAgreementOnTradeoffs: {
            __typename: 'ModelAgreementResult',
            pending: true,
            buildProgress: {
              __typename: 'ModelAgreementBuildProgress',
              completedRuns: 4,
              totalRuns: 10,
              currentRunId: 'run-4',
              updatedAt: '2026-05-08T15:00:00.000Z',
            },
            excludedNonBinaryCells: 0,
            excludedTiedCells: 0,
            models: [],
            unavailableModels: [],
            pairwiseAgreementMatrix: [],
            trialConsistency: [],
          },
        },
        fetching: false,
        error: undefined,
      },
      reexecuteQuery,
    ] as unknown as ReturnType<typeof useModelAgreementOnTradeoffsQuery>);

    render(
      <ModelAgreementSection
        modelIds={['model-a', 'model-b']}
        scope="ALL_DOMAINS"
        domainId={null}
        signature="vnewtd"
      />,
    );

    expect(screen.getByText('4 of 10 source runs processed. Currently on run-4.')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(reexecuteQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
  });
});
