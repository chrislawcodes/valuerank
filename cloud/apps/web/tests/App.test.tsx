import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

// Mock urql client
vi.mock('../src/api/client', () => ({
  client: {
    url: '/graphql',
    executeQuery: vi.fn(),
    executeMutation: vi.fn(),
  },
}));

// Mock localStorage
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  vi.resetAllMocks();
});

describe('App Component', () => {
  it('should render login page when not authenticated', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /valuerank/i })).toBeInTheDocument();
    });
  });

  it('should show login form on /login route', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });
  });
});

describe('App Routing', () => {
  it('should redirect unauthenticated users to login', async () => {
    // No token in localStorage means unauthenticated
    localStorage.removeItem('token');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it('redirects /assumptions to the Validation landing page for authenticated users', async () => {
    localStorage.setItem('valuerank_token', 'valid-token');
    window.history.pushState({}, '', '/assumptions');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^validation$/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/validation');
  });

  it('redirects /experiments to the Archive landing page for authenticated users', async () => {
    localStorage.setItem('valuerank_token', 'valid-token');
    window.history.pushState({}, '', '/experiments');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^archive$/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/archive');
  });

  it('redirects /survey to the canonical Archive survey route for authenticated users', async () => {
    localStorage.setItem('valuerank_token', 'valid-token');
    window.history.pushState({}, '', '/survey');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Legacy Survey Work' })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/archive/surveys');
  });

  it('redirects /survey-results while preserving search params for authenticated users', async () => {
    localStorage.setItem('valuerank_token', 'valid-token');
    window.history.pushState({}, '', '/survey-results?surveyId=abc123');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01', lastLoginAt: null }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Legacy Survey Results' })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/archive/survey-results');
    expect(window.location.search).toBe('?surveyId=abc123');
  });
});
