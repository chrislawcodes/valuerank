import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileNav } from '../../../src/components/layout/MobileNav';

function renderMobileNav(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <MobileNav />
    </MemoryRouter>
  );
}

describe('MobileNav Component', () => {
  it('highlights only the nested coverage item for the coverage route', () => {
    renderMobileNav('/domains/coverage');

    const domainsLink = screen.getByRole('link', { name: 'Domains' });
    const coverageLink = screen.getByRole('link', { name: 'Coverage' });

    expect(domainsLink.className).not.toContain('border-teal-500');
    expect(coverageLink.className).toContain('border-teal-500');
  });

  it('keeps the top-level domains item active on the domains list route', () => {
    renderMobileNav('/domains');

    const domainsLink = screen.getByRole('link', { name: 'Domains' });
    const coverageLink = screen.getByRole('link', { name: 'Coverage' });

    expect(domainsLink.className).toContain('border-teal-500');
    expect(coverageLink.className).not.toContain('border-teal-500');
  });
});
