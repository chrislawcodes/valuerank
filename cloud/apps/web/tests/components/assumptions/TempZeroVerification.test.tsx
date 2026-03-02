import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    daysLookedBack: 30,
    models: [
      {
        modelId: 'openai:gpt-4o',
        transcriptCount: 5,
        adapterModes: ['chat', 'responses'],
        promptHashStabilityPct: 88.84,
        fingerprintDriftPct: 12.35,
        decisionMatchRatePct: 99.94,
      },
      {
        modelId: 'anthropic:claude-sonnet-4',
        transcriptCount: 3,
        adapterModes: [],
        promptHashStabilityPct: null,
        fingerprintDriftPct: null,
        decisionMatchRatePct: null,
      },
    ],
  },
};

describe('TempZeroVerification', () => {
  it('renders the initial paused state without fetching data', () => {
    const { client } = renderComponent({
      data: mockReport,
      fetching: false,
      error: null,
    });

    expect(screen.getByRole('heading', { name: 'Temp=0 Verification Report' })).toBeInTheDocument();
    expect(screen.getByText('Generate a per-model stability report from recent temp=0 transcripts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Verification Report' })).toBeInTheDocument();
    expect(screen.queryByText('openai:gpt-4o')).not.toBeInTheDocument();
    expect(client.executeQuery).not.toHaveBeenCalled();
  });

  it('fetches when the button is clicked and switches to refresh mode', async () => {
    const { client, user } = renderComponent({
      data: mockReport,
      fetching: false,
      error: null,
    });

    await user.click(screen.getByRole('button', { name: 'Generate Verification Report' }));

    await waitFor(() => {
      expect(client.executeQuery).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();

    const operation = client.executeQuery.mock.calls[0]?.[0] as {
      variables: { days: number };
    };

    expect(operation.variables).toEqual({ days: 30 });
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

    await user.click(screen.getByRole('button', { name: 'Generate Verification Report' }));

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
  });

  it('renders an error message when the query fails', async () => {
    const { user } = renderComponent({
      fetching: false,
      error: { message: 'Failed to load verification report' },
    });

    await user.click(screen.getByRole('button', { name: 'Generate Verification Report' }));

    expect(await screen.findByText('Failed to load verification report')).toBeInTheDocument();
  });

  it('renders rounded percentages, n/a fallbacks, and inverted fingerprint stability', async () => {
    const { user } = renderComponent({
      data: mockReport,
      fetching: false,
      error: null,
    });

    await user.click(screen.getByRole('button', { name: 'Generate Verification Report' }));

    expect(await screen.findByText('openai:gpt-4o')).toBeInTheDocument();
    expect(
      screen.getByText('Per-model stability metrics from the last 30 days of temp=0 transcripts. 8 transcripts analyzed.')
    ).toBeInTheDocument();
    expect(screen.getByText('chat, responses')).toBeInTheDocument();
    expect(screen.getByText('88.8%')).toBeInTheDocument();
    expect(screen.getByText('87.7%')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
    expect(screen.getByText('anthropic:claude-sonnet-4')).toBeInTheDocument();
    expect(screen.getAllByText('n/a')).toHaveLength(4);
  });
});
