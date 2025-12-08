import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Layout } from '../../../src/components/layout/Layout';
import { AuthProvider } from '../../../src/auth/context';

// Mock useAuth to provide a user
vi.mock('../../../src/auth/hooks', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'test@example.com', name: 'Test User' },
    logout: vi.fn(),
  }),
}));

function renderLayout(children: React.ReactNode = <div>Test Content</div>) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Layout>{children}</Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('Layout Component', () => {
  it('should render header', () => {
    renderLayout();
    expect(screen.getByText('ValueRank')).toBeInTheDocument();
  });

  it('should render navigation tabs', () => {
    renderLayout();
    expect(screen.getByText('Definitions')).toBeInTheDocument();
    expect(screen.getByText('Runs')).toBeInTheDocument();
    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render children content', () => {
    renderLayout(<div>Custom Content</div>);
    expect(screen.getByText('Custom Content')).toBeInTheDocument();
  });
});
