import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'urql';
import { delay, fromValue, makeSubject, pipe } from 'wonka';
import { AnalysisPanel } from '../../../src/components/assumptions/AnalysisPanel';
import type { OrderInvarianceAnalysisQueryResult } from '../../../src/api/operations/order-invariance';

function createMockClient(result: { data?: OrderInvarianceAnalysisQueryResult; fetching: boolean; error?: { message: string } | null }) {
  return {
    executeQuery: vi.fn(() => pipe(fromValue(result as never), delay(0))),
    executeMutation: vi.fn(() => makeSubject<never>().source),
    executeSubscription: vi.fn(() => makeSubject<never>().source),
  };
}

const mockResult: OrderInvarianceAnalysisQueryResult = {
  assumptionsOrderInvariance: {
    generatedAt: '2026-03-09T08:00:00Z',
    modelMetrics: [
      {
        modelId: 'model-a',
        modelLabel: 'Model A',
        matchRate: 1,
        matchCount: 1,
        matchEligibleCount: 1,
        valueOrderReversalRate: 1,
        valueOrderEligibleCount: 1,
        valueOrderExcludedCount: 0,
        valueOrderPull: 'toward first-listed',
        scaleOrderReversalRate: 0,
        scaleOrderEligibleCount: 1,
        scaleOrderExcludedCount: 0,
        scaleOrderPull: 'no clear pull',
        withinCellDisagreementRate: 0,
        pairLevelMarginSummary: {
          mean: 1,
          median: 1,
          p25: 1,
          p75: 1,
        },
      },
    ],
    rows: [
      {
        modelId: 'model-a',
        modelLabel: 'Model A',
        vignetteId: 'v1',
        vignetteTitle: 'Jobs',
        conditionKey: '4x2',
        majorityVoteBaseline: 4,
        majorityVoteFlipped: 2,
        mismatchType: 'direction_flip',
        ordinalDistance: 2,
        isMatch: false,
        variantType: 'presentation_flipped',
      },
    ],
  },
};

describe('AnalysisPanel', () => {
  it('renders backend modelMetrics directly', async () => {
    const client = createMockClient({
      data: mockResult,
      fetching: false,
      error: null,
    });

    render(
      <Provider value={client as never}>
        <MemoryRouter>
          <AnalysisPanel />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByRole('heading', { name: 'Backend Analysis' })).toBeInTheDocument();

    await waitFor(() => {
      expect(client.executeQuery).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findAllByText('Model A')).toHaveLength(3);
    expect(screen.getByText('toward first-listed')).toBeInTheDocument();
    expect(screen.getByText('Supporting Rows')).toBeInTheDocument();
    expect(screen.getByText('Legacy Match')).toBeInTheDocument();
    expect(screen.getByText('legacy non-match')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });
});
