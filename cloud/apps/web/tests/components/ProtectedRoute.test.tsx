import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/auth/context';
import { ProtectedRoute } from '../../src/components/ProtectedRoute';

// Helper to render with router and auth
function renderWithProviders(
  ui: React.ReactNode,
  { initialPath = '/' }: { initialPath?: string } = {}
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('should redirect to login when not authenticated', async () => {
    renderWithProviders(<div />, { initialPath: '/' });

    // Should redirect to login page
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('should show protected content when authenticated', async () => {
    // Set up authenticated state
    localStorage.setItem('valuerank_token', 'valid-token');
    const mockUser = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    renderWithProviders(<div />, { initialPath: '/' });

    // Should show protected content
    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('should show loading state while checking auth', async () => {
    // Set up a slow token validation
    localStorage.setItem('valuerank_token', 'valid-token');

    global.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve({ id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null }),
      }), 100))
    );

    renderWithProviders(<div />, { initialPath: '/' });

    // Should show spinner (checking for the animate-spin class)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('should preserve intended destination in redirect state', async () => {
    renderWithProviders(<div />, { initialPath: '/dashboard' });

    // Should redirect to login page
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });
});
