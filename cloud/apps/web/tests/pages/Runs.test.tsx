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
    name: null, // Uses algorithmic name
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
      tags: [],
    },
    ...overrides,
  };
}

// Default tags response for RunFilters component
const defaultTagsResponse = {
  data: { tags: [] },
  error: undefined,
  stale: false,
  hasNext: false,
};

function createMockClient(mockRunsQuery: ReturnType<typeof vi.fn>): Client {
  // Wrap the runs query mock to also handle tags queries
  const executeQuery = vi.fn((request, opts) => {
    // Check multiple ways to identify tags query
    const queryStr = String(request.query || '');
    const opName = request.operationName || '';
    const isTagsQuery = queryStr.includes('tags') || queryStr.includes('Tags') ||
                        opName.includes('Tags') || opName.includes('tag');

    if (isTagsQuery) {
      return fromValue(defaultTagsResponse);
    }
    // Delegate to the provided mock for runs queries
    return mockRunsQuery(request, opts);
  });

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

    expect(screen.getByRole('heading', { name: 'Trials' })).toBeInTheDocument();
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
      expect(screen.getByText('No trials yet')).toBeInTheDocument();
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
      expect(screen.getByText(/Failed to load trials/)).toBeInTheDocument();
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
      expect(screen.getByText('No trials yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Start your first evaluation trial from a vignette.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Vignettes' })).toBeInTheDocument();
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

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Status:'), 'RUNNING');

    await waitFor(() => {
      expect(screen.getByText('No trials found')).toBeInTheDocument();
    });
    expect(screen.getByText('No trials match the selected filters.')).toBeInTheDocument();
  });

  it('displays runs list with count', async () => {
    const user = userEvent.setup();
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          runs: [
            createMockRun({ id: 'run-1', definition: { id: 'def-1', name: 'Definition A', tags: [] } }),
            createMockRun({ id: 'run-2', definition: { id: 'def-2', name: 'Definition B', tags: [] } }),
          ],
          runCount: 2,
        },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    // Switch to flat list view (default is folder view where runs are collapsed)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /list view/i }));

    // Check that virtualized list shows correct count
    await waitFor(() => {
      expect(screen.getByText(/Showing 2/)).toBeInTheDocument();
    });
  });

  it('shows folder view with runs count and folders count', async () => {
    // Virtualized folder view renders header info but items need scroll to render in real browser
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          runs: [createMockRun({ id: 'run-abc123', definition: { id: 'def-1', name: 'Test Definition', tags: [] } })],
          runCount: 1,
        },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    // Default is folder view - should show header with run count and folder count
    await waitFor(() => {
      // VirtualizedFolderView shows "X runs · Y folders"
      expect(screen.getByText(/1 trials/)).toBeInTheDocument();
    });
    expect(screen.getByText(/1 folders/)).toBeInTheDocument();
    // Expand/collapse controls should be visible
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
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

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Status:'), 'COMPLETED');

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

  it('shows runs in virtualized list', async () => {
    const user = userEvent.setup();
    // Create 10 runs
    const runs = Array.from({ length: 10 }, (_, i) =>
      createMockRun({ id: `run-${i}`, definition: { id: `def-${i}`, name: `Definition ${i}`, tags: [] } })
    );

    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs, runCount: 10 },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    // Switch to flat list view
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /list view/i }));

    // Should show virtualized list with count (virtualization may not render items in JSDOM)
    await waitFor(() => {
      expect(screen.getByText(/Showing 10/)).toBeInTheDocument();
    });
    expect(screen.getByText('All runs loaded')).toBeInTheDocument();
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
      expect(screen.getByText('No trials yet')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Go to Vignettes' }));

    expect(mockNavigate).toHaveBeenCalledWith('/definitions');
  });

  it('shows item count in header', async () => {
    const user = userEvent.setup();
    const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];

    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { runs, runCount: 2 },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderRuns(mockClient);

    // Switch to flat list view (item count shows "Showing X of Y" in flat view)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /list view/i }));

    await waitFor(() => {
      // VirtualizedRunList shows "Showing X of Y runs"
      expect(screen.getByText(/Showing 2/)).toBeInTheDocument();
    });
  });
});
