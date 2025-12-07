import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, getStoredToken } from '../../src/auth/context';
import { useAuth } from '../../src/auth/hooks';

// Test component that uses auth
function TestAuthConsumer() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.email || 'none'}</span>
      <button onClick={() => login('test@example.com', 'password')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('should start with no user when no token exists', async () => {
    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    // When no token exists, loading completes quickly
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('should handle successful login', async () => {
    const mockUser = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null };
    const mockToken = 'test-jwt-token';

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: mockToken, user: mockUser }),
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Click login
    await userEvent.click(screen.getByText('Login'));

    // Wait for login to complete
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
    expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    expect(getStoredToken()).toBe(mockToken);
  });

  it('should handle logout', async () => {
    // Set up authenticated state
    localStorage.setItem('valuerank_token', 'existing-token');
    const mockUser = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    // Wait for token validation
    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    // Click logout
    await userEvent.click(screen.getByText('Logout'));

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(getStoredToken()).toBeNull();
  });

  it('should restore token from localStorage on mount', async () => {
    localStorage.setItem('valuerank_token', 'stored-token');
    const mockUser = { id: '1', email: 'restored@example.com', name: 'Restored', createdAt: '2024-01-01', lastLoginAt: null };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
    expect(screen.getByTestId('user').textContent).toBe('restored@example.com');
  });

  it('should clear invalid token on mount', async () => {
    localStorage.setItem('valuerank_token', 'invalid-token');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
    expect(getStoredToken()).toBeNull();
  });
});
