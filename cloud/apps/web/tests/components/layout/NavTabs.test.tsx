import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NavTabs } from '../../../src/components/layout/NavTabs';

function renderNavTabs(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <NavTabs />
    </MemoryRouter>
  );
}

async function openMenu(label: string) {
  await userEvent.click(screen.getByRole('button', { name: `Toggle ${label} menu` }));
}

describe('NavTabs Component', () => {
  it('renders the new top-level navigation tabs', () => {
    renderNavTabs();

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Vignettes' })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: 'Domains' })).toHaveAttribute('href', '/domains');
    expect(screen.getByRole('link', { name: 'Validation' })).toHaveAttribute('href', '/validation');
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
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
    expect(screen.getByRole('link', { name: 'Domain Analysis' })).toHaveAttribute('href', '/domains/analysis');
    expect(screen.getByRole('link', { name: 'Coverage' })).toHaveAttribute('href', '/domains/coverage');
    expect(screen.queryByRole('link', { name: 'New Vignette' })).not.toBeInTheDocument();

    // Domain Setup is a hover flyout — children are always in the DOM
    expect(screen.getByRole('link', { name: 'Preamble', hidden: true })).toHaveAttribute('href', '/preambles');
    expect(screen.getByRole('link', { name: 'Context', hidden: true })).toHaveAttribute('href', '/domain-contexts');
    expect(screen.getByRole('link', { name: 'Value Statements', hidden: true })).toHaveAttribute('href', '/value-statements');
    expect(screen.getByRole('link', { name: 'Level Presets', hidden: true })).toHaveAttribute('href', '/level-presets');
  });

  it('keeps the validation compatibility links available from the validation menu', async () => {
    renderNavTabs('/assumptions/analysis');
    await openMenu('Validation');

    expect(screen.getByRole('link', { name: 'Temp=0 Effect' })).toHaveAttribute('href', '/assumptions/temp-zero-effect');
    expect(
      screen.getAllByRole('link', { name: 'Legacy Analysis' }).some((link) => link.getAttribute('href') === '/assumptions/analysis')
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Legacy Analysis' })).toHaveAttribute('href', '/assumptions/analysis');
    expect(screen.getByRole('link', { name: 'Analysis (old v1)' })).toHaveAttribute('href', '/assumptions/analysis-v1');
  });

  it('keeps the archive compatibility links available from the archive menu', async () => {
    renderNavTabs('/archive');
    await openMenu('Archive');

    expect(screen.getByRole('link', { name: 'Legacy Survey Work' })).toHaveAttribute('href', '/archive/surveys');
    expect(screen.getByRole('link', { name: 'Legacy Survey Results' })).toHaveAttribute('href', '/archive/survey-results');
  });

  it('highlights Validation on validation compatibility routes', async () => {
    renderNavTabs('/assumptions/analysis');
    await openMenu('Validation');

    expect(screen.getByRole('link', { name: 'Validation' }).parentElement?.className).toContain('border-teal-500');
    expect(
      screen.getAllByRole('link', { name: 'Legacy Analysis' }).some(
        (link) => link.getAttribute('href') === '/assumptions/analysis' && link.className.includes('bg-teal-600/20')
      )
    ).toBe(true);
  });

  it('highlights Archive on archive compatibility routes', async () => {
    renderNavTabs('/archive/surveys');
    await openMenu('Archive');

    expect(screen.getByRole('link', { name: 'Archive' }).parentElement?.className).toContain('border-teal-500');
    expect(screen.getByRole('link', { name: 'Legacy Survey Work' }).className).toContain('bg-teal-600/20');
  });

  it('renders Vignettes before Domains before Validation and Archive in the top-level order', () => {
    renderNavTabs();

    const vignettesLink = screen.getByRole('link', { name: 'Vignettes' });
    const domainsLink = screen.getByRole('link', { name: 'Domains' });
    const validationLink = screen.getByRole('link', { name: 'Validation' });
    const archiveLink = screen.getByRole('link', { name: 'Archive' });

    expect(vignettesLink.compareDocumentPosition(domainsLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(domainsLink.compareDocumentPosition(validationLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(validationLink.compareDocumentPosition(archiveLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
