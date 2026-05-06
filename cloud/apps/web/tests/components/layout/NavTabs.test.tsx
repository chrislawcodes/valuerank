import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NavTabs } from '../../../src/components/layout/NavTabs';

// Mock useAuth to provide an admin user so all nav items are visible
vi.mock('../../../src/auth/hooks', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'ADMIN', mustChangePassword: false },
    token: 'mock-token',
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const user = userEvent.setup({ delay: null });

function renderNavTabs(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <NavTabs />
    </MemoryRouter>
  );
}

async function openMenu(label: string) {
  await user.click(screen.getByRole('button', { name: `Toggle ${label} menu` }));
}

describe('NavTabs Component', () => {
  it('renders the top-level navigation tabs', () => {
    renderNavTabs();

    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Domains' })).toHaveAttribute('href', '/domains');
    expect(screen.getByRole('link', { name: 'Vignettes' })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/account');
    expect(screen.getByRole('link', { name: 'Status' })).toHaveAttribute('href', '/status');
    // Validation is now under Archive, not top-level
    expect(screen.queryByRole('button', { name: 'Toggle Validation menu' })).not.toBeInTheDocument();
    // Compare was removed
    expect(screen.queryByRole('link', { name: 'Compare' })).not.toBeInTheDocument();
  });

  it('keeps the model report links available from the models menu', async () => {
    renderNavTabs('/models/win-rate');
    const toggle = screen.getByRole('button', { name: 'Toggle Models menu' });
    const menuRoot = toggle.closest('.relative');
    if (menuRoot === null) {
      throw new Error('Missing Models menu root');
    }
    fireEvent.mouseEnter(menuRoot);

    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Model Groups' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Win Rate' })).toHaveAttribute('href', '/models/win-rate');
  });

  it('highlights only Win Rate inside the models menu on the win rate route', async () => {
    renderNavTabs('/models/win-rate');
    await openMenu('Models');

    expect(screen.getByRole('link', { name: 'Models' }).parentElement?.className).toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Model Groups' }).className).not.toContain('bg-teal-600/20');
    expect(screen.getByRole('link', { name: 'Win Rate' }).className).toContain('bg-teal-600/20');
    expect(screen.getByRole('link', { name: 'Consistency' }).className).not.toContain('bg-teal-600/20');
    expect(screen.getByRole('link', { name: 'Circumplex' }).className).not.toContain('bg-teal-600/20');
  });

  it('keeps the vignettes menu links available from the vignettes menu', async () => {
    renderNavTabs('/definitions');
    await openMenu('Vignettes');

    expect(screen.getByRole('link', { name: 'Vignette Library' })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/runs');
    expect(screen.getByRole('link', { name: 'Analysis' })).toHaveAttribute('href', '/analysis');
  });

  it('keeps the domain compatibility links available from the domains menu', async () => {
    renderNavTabs('/domains');
    await openMenu('Domains');

    // Multiple menus have 'Overview' items in the DOM — filter by href
    expect(
      screen.getAllByRole('link', { name: 'Overview' }).some((link) => link.getAttribute('href') === '/domains')
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Manage Domains' })).toHaveAttribute('href', '/domains/manage');
    expect(screen.queryByRole('link', { name: 'Coverage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New Vignette' })).not.toBeInTheDocument();
    expect(screen.queryByText('Domain Setup')).not.toBeInTheDocument();
  });

  it('keeps the archive links available from the archive menu', async () => {
    renderNavTabs('/archive');
    await openMenu('Archive');

    expect(screen.getByRole('link', { name: 'Legacy Survey Work' })).toHaveAttribute('href', '/archive/surveys');
    expect(screen.getByRole('link', { name: 'Legacy Survey Results' })).toHaveAttribute('href', '/archive/survey-results');
    expect(screen.getByRole('link', { name: 'Circumplex' })).toHaveAttribute('href', '/archive/circumplex');
    expect(screen.getByRole('link', { name: 'Consistency' })).toHaveAttribute('href', '/archive/consistency');
  });

  it('highlights Archive on archive compatibility routes', async () => {
    renderNavTabs('/archive/surveys');
    await openMenu('Archive');

    expect(screen.getByRole('link', { name: 'Archive' }).parentElement?.className).toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Legacy Survey Work' }).className).toContain('bg-teal-600/20');
  });

  it('renders Domains before Vignettes before Archive in the top-level order', () => {
    renderNavTabs();

    const domainsLink = screen.getByRole('link', { name: 'Domains' });
    const vignettesLink = screen.getByRole('link', { name: 'Vignettes' });
    const archiveLink = screen.getByRole('link', { name: 'Archive' });

    expect(domainsLink.compareDocumentPosition(vignettesLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vignettesLink.compareDocumentPosition(archiveLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
