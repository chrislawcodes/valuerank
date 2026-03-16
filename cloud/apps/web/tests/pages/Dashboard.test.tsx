import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../src/pages/Dashboard';

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => ({
    domains: [{ id: 'domain-a', name: 'Domain A', definitionCount: 2 }],
  }),
}));

describe('Dashboard', () => {
  it('renders the home framing, primary quick links, and exact resume links', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /domain-first workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /domains/i })).toHaveAttribute('href', '/domains');
    expect(screen.getByRole('link', { name: /validation/i })).toHaveAttribute('href', '/validation');
    expect(screen.getByRole('link', { name: /archive/i })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('heading', { name: /resume active domain work/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open domain evaluation launcher/i })).toHaveAttribute('href', '/domains/domain-a/run-trials?scopeCategory=PILOT');
    expect(screen.getByRole('link', { name: /open findings for this domain/i })).toHaveAttribute('href', '/domains/analysis?domainId=domain-a');
    expect(screen.getByRole('link', { name: /review setup coverage/i })).toHaveAttribute('href', '/domains?domainId=domain-a&tab=setup&setupTab=contexts');
  });
});
