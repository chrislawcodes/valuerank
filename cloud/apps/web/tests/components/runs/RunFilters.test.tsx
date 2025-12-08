/**
 * RunFilters Component Tests
 *
 * Tests for the run filters component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, Client } from 'urql';
import { fromValue } from 'wonka';
import { RunFilters, type RunFilterState } from '../../../src/components/runs/RunFilters';

// Mock tags response
const mockTagsResponse = {
  data: {
    tags: [
      { id: 'tag-1', name: 'Production', color: '#ff0000' },
      { id: 'tag-2', name: 'Testing', color: '#00ff00' },
    ],
  },
};

function createMockClient(): Client {
  return {
    executeQuery: vi.fn(() => fromValue(mockTagsResponse)),
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

function createDefaultFilters(overrides: Partial<RunFilterState> = {}): RunFilterState {
  return {
    status: '',
    tagIds: [],
    viewMode: 'flat',
    ...overrides,
  };
}

function renderRunFilters(
  filters: RunFilterState = createDefaultFilters(),
  onFiltersChange = vi.fn()
) {
  const mockClient = createMockClient();
  return {
    ...render(
      <Provider value={mockClient}>
        <RunFilters filters={filters} onFiltersChange={onFiltersChange} />
      </Provider>
    ),
    mockClient,
    onFiltersChange,
  };
}

describe('RunFilters', () => {
  it('renders status filter dropdown', async () => {
    renderRunFilters();

    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    });
  });

  it('shows all status options', async () => {
    renderRunFilters();

    await waitFor(() => {
      const select = screen.getByLabelText('Status:');
      expect(select).toHaveValue('');
    });

    // Check all options exist (8 options: All + 7 statuses including SUMMARIZING)
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(8);
    expect(options[0]).toHaveTextContent('All Statuses');
    expect(options[1]).toHaveTextContent('Running');
    expect(options[2]).toHaveTextContent('Pending');
    expect(options[3]).toHaveTextContent('Paused');
    expect(options[4]).toHaveTextContent('Summarizing');
    expect(options[5]).toHaveTextContent('Completed');
    expect(options[6]).toHaveTextContent('Failed');
    expect(options[7]).toHaveTextContent('Cancelled');
  });

  it('calls onFiltersChange when status selection changes', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const filters = createDefaultFilters();
    renderRunFilters(filters, onFiltersChange);

    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Status:'), 'RUNNING');

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      status: 'RUNNING',
    });
  });

  it('reflects current status value', async () => {
    const filters = createDefaultFilters({ status: 'COMPLETED' });
    renderRunFilters(filters);

    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toHaveValue('COMPLETED');
    });
  });

  it('allows clearing filter back to all', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const filters = createDefaultFilters({ status: 'COMPLETED' });
    renderRunFilters(filters, onFiltersChange);

    await waitFor(() => {
      expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Status:'), '');

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      status: '',
    });
  });

  it('renders view mode toggle buttons', async () => {
    renderRunFilters();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /folder view/i })).toBeInTheDocument();
    });
  });

  it('calls onFiltersChange when view mode changes', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const filters = createDefaultFilters({ viewMode: 'flat' });
    renderRunFilters(filters, onFiltersChange);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /folder view/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /folder view/i }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      viewMode: 'folder',
    });
  });
});
