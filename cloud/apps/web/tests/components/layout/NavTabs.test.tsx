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
    expect(screen.getByRole('link', { name: /^survey$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /survey results/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('should link to correct paths', () => {
    renderNavTabs();
    expect(screen.getByRole('link', { name: /vignettes/i })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: /trials/i })).toHaveAttribute('href', '/runs');
    expect(screen.getByRole('link', { name: /^survey$/i })).toHaveAttribute('href', '/survey');
    expect(screen.getByRole('link', { name: /survey results/i })).toHaveAttribute('href', '/survey-results');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('should highlight active tab', () => {
    renderNavTabs('/definitions');
    const vignettesLink = screen.getByRole('link', { name: /vignettes/i });
    const vignettesTrigger = vignettesLink.parentElement;
    expect(vignettesTrigger).not.toBeNull();
    expect(vignettesTrigger?.className).toContain('text-white');
    expect(vignettesTrigger?.className).toContain('border-teal-500');
  });
});
