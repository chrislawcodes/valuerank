import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
});
