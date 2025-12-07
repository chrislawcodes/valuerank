import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'urql';
import { never, fromValue } from 'wonka';
import { Settings } from '../../src/pages/Settings';
import { AuthProvider } from '../../src/auth/context';

// Mock client factory
function createMockClient(executeQuery: ReturnType<typeof vi.fn>) {
  return {
    executeQuery,
    executeMutation: vi.fn(() => never),
    executeSubscription: vi.fn(() => never),
  };
}

function renderSettings(mockClient: ReturnType<typeof createMockClient>) {
  // Set up auth token to avoid immediate redirect
  localStorage.setItem('valuerank_token', 'test-token');

  // Mock the /api/auth/me endpoint
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2024-01-01',
        lastLoginAt: null,
      }),
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <Provider value={mockClient as never}>
          <Settings />
        </Provider>
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('Settings Page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('should render settings header', async () => {
    const mockClient = createMockClient(vi.fn(() => never));
    renderSettings(mockClient);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
  });

  it('should show loading state while fetching API keys', async () => {
    const mockClient = createMockClient(vi.fn(() => never));
    renderSettings(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Loading API keys...')).toBeInTheDocument();
    });
  });

  it('should show empty state when no API keys exist', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { apiKeys: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderSettings(mockClient);

    await waitFor(() => {
      expect(screen.getByText('No API keys')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Create an API key to authenticate with the MCP server')
    ).toBeInTheDocument();
  });

  it('should show API keys list when keys exist', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          apiKeys: [
            {
              id: '1',
              name: 'Production Key',
              keyPrefix: 'vr_prod',
              lastUsed: null,
              expiresAt: null,
              createdAt: '2024-01-01T00:00:00Z',
            },
          ],
        },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderSettings(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Production Key')).toBeInTheDocument();
    });
    expect(screen.getByText(/vr_prod/)).toBeInTheDocument();
  });

  it('should open create key modal when clicking create button', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { apiKeys: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderSettings(mockClient);

    await waitFor(() => {
      expect(screen.getByText('No API keys')).toBeInTheDocument();
    });

    // Click the "Create Key" button in the header
    const createButtons = screen.getAllByText('Create Key');
    await userEvent.click(createButtons[0]);

    // Modal should appear - use heading role to avoid matching the button
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create API Key' })).toBeInTheDocument();
    });
    // Use placeholder text since the label may not have proper for/id association
    expect(screen.getByPlaceholderText('e.g., MCP Server Production')).toBeInTheDocument();
  });

  it('should show error message when query fails', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: undefined,
        error: { message: 'Failed to fetch API keys' },
        stale: false,
        hasNext: false,
      })
    );
    const mockClient = createMockClient(mockExecuteQuery);
    renderSettings(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch API keys')).toBeInTheDocument();
    });
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });
});
