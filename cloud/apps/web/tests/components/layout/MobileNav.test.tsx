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
    expect(screen.getByRole('link', { name: 'Validation' })).toHaveAttribute('href', '/validation');
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('keeps the domain compatibility links nested under Domains', async () => {
    await renderMobileNav('/domains');

    expect(screen.getByRole('link', { name: 'Vignettes' })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: 'Domain Contexts' })).toHaveAttribute('href', '/domain-contexts');
    expect(screen.getByRole('link', { name: 'Value Statements' })).toHaveAttribute('href', '/value-statements');
    expect(screen.getByRole('link', { name: 'Domain Analysis' })).toHaveAttribute('href', '/domains/analysis');
    expect(screen.getByRole('link', { name: 'Coverage' })).toHaveAttribute('href', '/domains/coverage');
  });

  it('keeps the validation compatibility links nested under Validation', async () => {
    await renderMobileNav('/assumptions/analysis');

    expect(screen.getByRole('link', { name: 'Validation' })).toHaveAttribute('href', '/validation');
    expect(screen.getByRole('link', { name: 'Temp=0 Effect' })).toHaveAttribute('href', '/assumptions/temp-zero-effect');
    expect(screen.getByRole('link', { name: 'Validation Analysis' })).toHaveAttribute('href', '/assumptions/analysis');
    expect(screen.getByRole('link', { name: 'Validation (old v1)' })).toHaveAttribute('href', '/assumptions/analysis-v1');
  });

  it('keeps the archive compatibility links nested under Archive', async () => {
    await renderMobileNav('/archive/surveys');

    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Legacy Survey Work' })).toHaveAttribute('href', '/archive/surveys');
    expect(screen.getByRole('link', { name: 'Legacy Survey Results' })).toHaveAttribute('href', '/archive/survey-results');
  });

  it('highlights the validation item on validation compatibility routes', async () => {
    await renderMobileNav('/assumptions/analysis');

    expect(screen.getByRole('link', { name: 'Validation' }).className).not.toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Validation Analysis' }).className).toContain('border-teal-500');
  });

  it('highlights the archive item on archive compatibility routes', async () => {
    await renderMobileNav('/archive/surveys');

    expect(screen.getByRole('link', { name: 'Archive' }).className).not.toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Legacy Survey Work' }).className).toContain('border-teal-500');
  });
});
