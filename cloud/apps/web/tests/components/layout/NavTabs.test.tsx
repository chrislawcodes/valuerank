import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
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
    expect(screen.getByRole('link', { name: /definitions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /runs/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /experiments/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('should link to correct paths', () => {
    renderNavTabs();
    expect(screen.getByRole('link', { name: /definitions/i })).toHaveAttribute('href', '/definitions');
    expect(screen.getByRole('link', { name: /runs/i })).toHaveAttribute('href', '/runs');
    expect(screen.getByRole('link', { name: /experiments/i })).toHaveAttribute('href', '/experiments');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('should highlight active tab', () => {
    renderNavTabs('/definitions');
    const definitionsLink = screen.getByRole('link', { name: /definitions/i });
    expect(definitionsLink.className).toContain('text-white');
    expect(definitionsLink.className).toContain('border-teal-500');
  });
});
