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

  it('should create API key and show success banner', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: { apiKeys: [] },
        error: undefined,
        stale: false,
        hasNext: false,
      })
    );
    const mockExecuteMutation = vi.fn(() =>
      fromValue({
        data: { createApiKey: { key: 'vr_test_secret_key_12345' } },
        error: undefined,
      })
    );
    const mockClient = {
      executeQuery: mockExecuteQuery,
      executeMutation: mockExecuteMutation,
      executeSubscription: vi.fn(() => never),
    };

    localStorage.setItem('valuerank_token', 'test-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null }),
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <Provider value={mockClient as never}>
            <Settings />
          </Provider>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No API keys')).toBeInTheDocument();
    });

    // Open create modal
    const createButtons = screen.getAllByText('Create Key');
    await userEvent.click(createButtons[0]);

    // Fill in the name
    const nameInput = screen.getByPlaceholderText('e.g., MCP Server Production');
    await userEvent.type(nameInput, 'Test API Key');

    // Submit the form - find the submit button (type="submit")
    const submitButtons = screen.getAllByRole('button', { name: 'Create Key' });
    const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
    await userEvent.click(submitButton!);

    // Should show the new key banner
    await waitFor(() => {
      expect(screen.getByText('API Key Created')).toBeInTheDocument();
    });
    expect(screen.getByText('vr_test_secret_key_12345')).toBeInTheDocument();
  });

  it('should show revoke confirmation dialog', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          apiKeys: [
            {
              id: '1',
              name: 'Production Key',
              keyPrefix: 'vr_prod',
              lastUsedAt: null,
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

    // Click the revoke button (trash icon button)
    const revokeButton = screen.getByRole('button', { name: '' }); // Icon button has no text
    await userEvent.click(revokeButton);

    // Should show confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Revoke API Key')).toBeInTheDocument();
    });
    expect(screen.getByText(/Are you sure you want to revoke/)).toBeInTheDocument();
    expect(screen.getByText(/"Production Key"/)).toBeInTheDocument();
  });

  it('should close revoke dialog on cancel', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          apiKeys: [
            {
              id: '1',
              name: 'Production Key',
              keyPrefix: 'vr_prod',
              lastUsedAt: null,
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

    // Open revoke dialog
    const revokeButton = screen.getByRole('button', { name: '' });
    await userEvent.click(revokeButton);

    await waitFor(() => {
      expect(screen.getByText('Revoke API Key')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByText('Revoke API Key')).not.toBeInTheDocument();
    });
  });

  it('should display lastUsedAt when available', async () => {
    const mockExecuteQuery = vi.fn(() =>
      fromValue({
        data: {
          apiKeys: [
            {
              id: '1',
              name: 'Used Key',
              keyPrefix: 'vr_used',
              lastUsedAt: new Date().toISOString(),
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
      expect(screen.getByText('Used Key')).toBeInTheDocument();
    });
    expect(screen.getByText(/Last used/)).toBeInTheDocument();
  });

  it('should close create modal on cancel', async () => {
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

    // Open create modal
    const createButtons = screen.getAllByText('Create Key');
    await userEvent.click(createButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create API Key' })).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create API Key' })).not.toBeInTheDocument();
    });
  });
});
