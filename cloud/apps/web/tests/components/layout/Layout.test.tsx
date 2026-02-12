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
    // Logo appears in both Header and MobileNav, so we check at least one exists
    const logos = screen.getAllByText('ValueRank');
    expect(logos.length).toBeGreaterThan(0);
  });

  it('should render navigation tabs', () => {
    renderLayout();
    // Navigation items appear in both NavTabs (desktop) and MobileNav (mobile)
    // so we check at least one of each exists
    expect(screen.getAllByText('Vignettes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trials').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Survey').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Survey Results').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });

  it('should render children content', () => {
    renderLayout(<div>Custom Content</div>);
    expect(screen.getByText('Custom Content')).toBeInTheDocument();
  });
});
