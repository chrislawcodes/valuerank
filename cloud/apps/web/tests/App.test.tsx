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

vi.mock('../src/pages/DomainAnalysis', () => ({
  DomainAnalysis: () => <div>Win rate route smoke</div>,
}));

vi.mock('../src/pages/ModelsGroups', () => ({
  ModelsGroups: () => <div>Model groups route smoke</div>,
}));

// Mock localStorage
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn());
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

  it('should render the protected win rate route when authenticated', async () => {
    localStorage.setItem('valuerank_token', 'test-token');
    window.history.pushState({}, '', '/models/win-rate');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-1', email: 'researcher@example.com', name: 'Researcher' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Win rate route smoke')).toBeInTheDocument();
    });
  });

  it('should 404 the old domain analysis route when authenticated', async () => {
    localStorage.setItem('valuerank_token', 'test-token');
    window.history.pushState({}, '', '/domains/analysis');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-1', email: 'researcher@example.com', name: 'Researcher' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    });
  });

  it('should 404 the old domain shifts route when authenticated', async () => {
    localStorage.setItem('valuerank_token', 'test-token');
    window.history.pushState({}, '', '/models/domain-shifts');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-1', email: 'researcher@example.com', name: 'Researcher' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    });
  });

  it('should render the protected models route when authenticated', async () => {
    localStorage.setItem('valuerank_token', 'test-token');
    window.history.pushState({}, '', '/models');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-1', email: 'researcher@example.com', name: 'Researcher' }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Model groups route smoke')).toBeInTheDocument();
    });
  });
});
