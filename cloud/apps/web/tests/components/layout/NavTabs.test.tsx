import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavTabs } from '../../../src/components/layout/NavTabs';

function renderNavTabs(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <NavTabs />
    </MemoryRouter>
  );
}

describe('NavTabs Component', () => {
  it('should render all navigation tabs', () => {
    renderNavTabs();
    expect(screen.getByRole('link', { name: /vignettes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /trials/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^survey$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /survey results/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('should link to correct paths', () => {
    renderNavTabs();
    expect(screen.getByRole('link', { name: /vignettes/i })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: /trials/i })).toHaveAttribute('href', '/runs');
    expect(
      screen.getAllByRole('link', { name: /^survey$/i }).every((link) => link.getAttribute('href') === '/survey')
    ).toBe(true);
    expect(screen.getByRole('link', { name: /survey results/i })).toHaveAttribute('href', '/survey-results');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('shows only the unified vignette analysis route in the menu', () => {
    renderNavTabs('/analysis');

    expect(
      screen.getAllByRole('link', { name: 'Analysis' }).some((link) => link.getAttribute('href') === '/analysis')
    ).toBe(true);
    expect(screen.queryByRole('link', { name: 'Analysis (Old V1)' })).not.toBeInTheDocument();
  });

  it('shows the new assumptions analysis routes in the menu', () => {
    renderNavTabs('/assumptions/analysis');

    expect(
      screen.getAllByRole('link', { name: 'Analysis' }).some((link) => link.getAttribute('href') === '/assumptions/analysis')
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Analysis (old v1)' })).toHaveAttribute('href', '/assumptions/analysis-v1');
    expect(screen.getByRole('link', { name: /assumptions/i })).toHaveAttribute('href', '/assumptions');
  });

  it('keeps the unified analysis menu item active on transcript routes', () => {
    renderNavTabs('/analysis/run-1/transcripts');

    const vignettesLink = screen.getByRole('link', { name: /vignettes/i });
    const currentAnalysisLink = screen
      .getAllByRole('link', { name: 'Analysis' })
      .find((link) => link.getAttribute('href') === '/analysis');

    expect(currentAnalysisLink?.className).toContain('bg-teal-600/20');
    expect(vignettesLink.parentElement?.className).toContain('border-teal-500');
  });

  it('should highlight active tab', () => {
    renderNavTabs('/definitions');
    const vignettesLink = screen.getByRole('link', { name: /vignettes/i });
    const vignettesTrigger = vignettesLink.parentElement;
    expect(vignettesTrigger).not.toBeNull();
    expect(vignettesTrigger?.className).toContain('text-white');
    expect(vignettesTrigger?.className).toContain('border-teal-500');
  });

  it('renders Domains before Vignettes in the top-level tab order', () => {
    renderNavTabs();
    const domainsLink = screen.getByRole('link', { name: /domains/i });
    const vignettesLink = screen.getByRole('link', { name: /vignettes/i });
    // Domains must precede Vignettes in the DOM (no longer uses CSS flex order tricks)
    const position = domainsLink.compareDocumentPosition(vignettesLink);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
