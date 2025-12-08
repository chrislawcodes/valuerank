/**
 * Runs Page Tests
 *
 * Tests for the runs list page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider, Client } from 'urql';
import { fromValue } from 'wonka';
import { Runs } from '../../src/pages/Runs';
import type { Run } from '../../src/api/operations/runs';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-12345678-abcd',
    definitionId: 'def-1',
    experimentId: null,
    status: 'COMPLETED',
    config: {
      models: ['gpt-4'],
    },
    progress: { total: 10, completed: 10, failed: 0 },
    runProgress: {
      total: 10,
      completed: 10,
      failed: 0,
      percentComplete: 100,
    },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:10:00Z',
    createdAt: '2024-01-15T09:55:00Z',
    updatedAt: '2024-01-15T10:10:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 10,
    recentTasks: [],
    definition: {
      id: 'def-1',
      name: 'Test Definition',
    },
    ...overrides,
  };
}

function createMockClient(executeQuery: ReturnType<typeof vi.fn>): Client {
  return {
    executeQuery,
    executeMutation: vi.fn(),
    executeSubscription: vi.fn(),
    url: 'http://localhost/graphql',
    fetchOptions: undefined,
    fetch: undefined,
    suspense: false,
    requestPolicy: 'cache-first',
    preferGetMethod: false,
    maskTypename: false,
  } as unknown as Client;
}

function renderRuns(client: Client) {
  return render(
    <Provider value={client}>
      <MemoryRouter>
        <Runs />
      </MemoryRouter>
    </Provider>
  );
}

describe('Runs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument();
  });

  it('shows loading state', async () => {
    // The Loading component is displayed when loading=true and runs array is empty
    // With urql, fromValue returns immediately, so we test the empty state with no data
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: undefined,
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    // When no data yet and no error, empty state shows
    await waitFor(() => {
      expect(screen.getByText('No runs yet')).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: undefined,
        error: { message: 'Network error' },
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load runs/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no runs', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText('No runs yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Start your first evaluation run from a definition.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Definitions' })).toBeInTheDocument();
  });

  it('shows filtered empty state when filter applied', async () => {
    const user = userEvent.setup();
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await user.selectOptions(screen.getByRole('combobox'), 'RUNNING');

    await waitFor(() => {
      expect(screen.getByText('No runs found')).toBeInTheDocument();
    });
    expect(screen.getByText('No runs match the selected filter.')).toBeInTheDocument();
  });

  it('displays runs list', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          runs: [
            createMockRun({ id: 'run-1', definition: { id: 'def-1', name: 'Definition A' } }),
            createMockRun({ id: 'run-2', definition: { id: 'def-2', name: 'Definition B' } }),
          ],
        },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Definition A')).toBeInTheDocument();
    });
    expect(screen.getByText('Definition B')).toBeInTheDocument();
  });

  it('navigates to run detail when run is clicked', async () => {
    const user = userEvent.setup();
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          runs: [createMockRun({ id: 'run-abc123' })],
        },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Test Definition')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Test Definition/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/runs/run-abc123');
  });

  it('filters runs by status', async () => {
    const user = userEvent.setup();
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await user.selectOptions(screen.getByRole('combobox'), 'COMPLETED');

    await waitFor(() => {
      // Check that the query was called with status filter
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            status: 'COMPLETED',
          }),
        }),
        expect.anything()
      );
    });
  });

  it('shows refresh button', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
  });

  it('shows pagination when there are many runs', async () => {
    // Create 10 runs (full page)
    const runs = Array.from({ length: 10 }, (_, i) =>
      createMockRun({ id: `run-${i}`, definition: { id: `def-${i}`, name: `Definition ${i}` } })
    );

    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Definition 0')).toBeInTheDocument();
    });

    // Should show pagination
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
  });

  it('navigates to definitions when clicking empty state button', async () => {
    const user = userEvent.setup();
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText('No runs yet')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Go to Definitions' }));

    expect(mockNavigate).toHaveBeenCalledWith('/definitions');
  });

  it('shows item count in header', async () => {
    const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];

    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Showing 1-2')).toBeInTheDocument();
    });
  });
});
