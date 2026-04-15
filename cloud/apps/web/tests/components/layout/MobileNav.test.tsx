import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MobileNav } from '../../../src/components/layout/MobileNav';

async function renderMobileNav(initialRoute: string) {
  const result = render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <MobileNav />
    </MemoryRouter>
  );

  await userEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
  return result;
}

describe('MobileNav Component', () => {
  it('renders the new top-level navigation items', async () => {
    await renderMobileNav('/domains');

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Domains' })).toHaveAttribute('href', '/domains');
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/account');
  });

  it('keeps the domain compatibility links nested under Domains', async () => {
    await renderMobileNav('/domains');

    expect(screen.getByRole('link', { name: 'Vignettes' })).toHaveAttribute('href', '/definitions');
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
});
