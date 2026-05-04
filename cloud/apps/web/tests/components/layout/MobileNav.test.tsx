import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MobileNav } from '../../../src/components/layout/MobileNav';

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

async function renderMobileNav(initialRoute: string) {
  const result = render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <MobileNav />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
  return result;
}

describe('MobileNav Component', () => {
  it('renders the new top-level navigation items', async () => {
    await renderMobileNav('/domains');

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Domains' })).toHaveAttribute('href', '/domains');
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Model Groups' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Domain Shifts' })).toHaveAttribute('href', '/models/domain-shifts');
    expect(screen.getByRole('link', { name: 'Consistency' })).toHaveAttribute('href', '/archive/consistency');
    expect(screen.getByRole('link', { name: 'Circumplex' })).toHaveAttribute('href', '/archive/circumplex');
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/account');
  });

  it('highlights Models and Domain Shifts on the domain shifts route', async () => {
    await renderMobileNav('/models/domain-shifts');

    expect(screen.getByRole('link', { name: 'Models' }).className).toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Model Groups' }).className).not.toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Domain Shifts' }).className).toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Consistency' }).className).not.toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Circumplex' }).className).not.toContain('border-teal-500');
  });

  it('keeps the model and domain compatibility links available in the mobile menu', async () => {
    await renderMobileNav('/domains');

    expect(screen.getByRole('link', { name: 'Vignettes' })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: 'Model Groups' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Domain Analysis' })).toHaveAttribute('href', '/domains/analysis');
    expect(screen.getByRole('link', { name: 'Manage Domains' })).toHaveAttribute('href', '/domains/manage');
    expect(screen.queryByRole('link', { name: 'Coverage' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/runs');
    expect(screen.queryByRole('link', { name: 'New Vignette' })).not.toBeInTheDocument();
    expect(screen.queryByText('Domain Setup')).not.toBeInTheDocument();
  });

  it('keeps the archive compatibility links nested under Archive', async () => {
    await renderMobileNav('/archive/surveys');

    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Legacy Survey Work' })).toHaveAttribute('href', '/archive/surveys');
    expect(screen.getByRole('link', { name: 'Legacy Survey Results' })).toHaveAttribute('href', '/archive/survey-results');
  });

  it('highlights the archive item on archive compatibility routes', async () => {
    await renderMobileNav('/archive/surveys');

    expect(screen.getByRole('link', { name: 'Archive' }).className).not.toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Legacy Survey Work' }).className).toContain('border-teal-500');
  });

  it('highlights the nested settings route on settings sub-routes', async () => {
    await renderMobileNav('/settings/models');

    expect(screen.getByRole('link', { name: 'Settings' }).className).not.toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'LLM Models' }).className).toContain('border-teal-500');
  });

  it('keeps the mobile menu escape behavior after Models gains children', async () => {
    await renderMobileNav('/models/domain-shifts');

    expect(screen.getByRole('link', { name: 'Domain Shifts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
