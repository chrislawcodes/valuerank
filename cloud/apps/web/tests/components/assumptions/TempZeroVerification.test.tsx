import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'urql';
import { fromValue, delay, pipe, makeSubject } from 'wonka';
import { TempZeroVerification } from '../../../src/components/assumptions/TempZeroVerification';
import type { TempZeroVerificationReportQueryResult } from '../../../src/api/operations/temp-zero-verification';

type MockQueryResult = {
  data?: TempZeroVerificationReportQueryResult;
  fetching: boolean;
  error?: { message: string } | null;
};

function createMockClient(result: MockQueryResult) {
  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue(result as never),
        delay(0)
      )
    ),
    executeMutation: vi.fn(() => makeSubject<never>().source),
    executeSubscription: vi.fn(() => makeSubject<never>().source),
  };
}

function renderComponent(result: MockQueryResult) {
  const client = createMockClient(result);
  const user = userEvent.setup();

  render(
    <Provider value={client as never}>
      <MemoryRouter>
        <TempZeroVerification />
      </MemoryRouter>
    </Provider>
  );

  return { client, user };
}

const mockReport: TempZeroVerificationReportQueryResult = {
  tempZeroVerificationReport: {
    generatedAt: '2026-03-02T18:00:00Z',
    transcriptCount: 8,
    batchTimestamp: '2026-03-02T18:00:00Z',
    models: [
      {
        modelId: 'openai:gpt-4o',
        transcriptCount: 5,
        adapterModes: ['chat', 'responses'],
        promptHashStabilityPct: 88.84,
        fingerprintDriftPct: 12.35,
        decisionMatchRatePct: 99.94,
      },
    ],
  },
};

describe('TempZeroVerification', () => {
  it('automatically fetches and renders the report on mount', async () => {
    const { client } = renderComponent({
      data: mockReport,
      fetching: false,
      error: null,
    });

    expect(screen.getByRole('heading', { name: 'Temp=0 Verification Report' })).toBeInTheDocument();

    await waitFor(() => {
      expect(client.executeQuery).toHaveBeenCalledTimes(1);
    });

    // Verify no arguments are passed to the query
    const operation = client.executeQuery.mock.calls[0]?.[0] as unknown as { variables: Record<string, never> };
    expect(operation.variables).toEqual({});
  });

  it('renders the loading state while the report is fetching', async () => {
    const { source } = makeSubject<never>();
    const neverResolvingClient = {
      executeQuery: vi.fn(() => source),
      executeMutation: vi.fn(),
      executeSubscription: vi.fn(),
    };
    const user = userEvent.setup();

    render(
      <Provider value={neverResolvingClient as never}>
        <MemoryRouter>
          <TempZeroVerification />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
  });

  it('renders an error message when the query fails', async () => {
    renderComponent({
      fetching: false,
      error: { message: 'Failed to load verification report' },
    });

    expect(await screen.findByText('Failed to load verification report')).toBeInTheDocument();
  });

  it('renders only complete model rows and inverts fingerprint stability immediately', async () => {
    renderComponent({
      data: mockReport,
      fetching: false,
      error: null,
    });

    expect(await screen.findByText('openai:gpt-4o')).toBeInTheDocument();
    expect(
      screen.getByText('Per-model stability metrics from the most recent temp=0 execution batch. 8 transcripts analyzed.')
    ).toBeInTheDocument();
    expect(screen.getByText('chat, responses')).toBeInTheDocument();
    expect(screen.getByText('88.8%')).toBeInTheDocument();
    expect(screen.getByText('87.7%')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
    expect(screen.queryByText('anthropic:claude-sonnet-4')).not.toBeInTheDocument();
    expect(screen.queryByText('n/a')).not.toBeInTheDocument();
  });
});
