import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Domains } from '../../src/pages/Domains';

const navigateMock = vi.fn();

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => ({
    domains: [
      { id: 'domain-a', name: 'Domain A', definitionCount: 2 },
      { id: 'domain-b', name: 'Domain B', definitionCount: 5 },
    ],
    error: null,
  }),
}));

vi.mock('../../src/components/domains/CoverageMatrix', () => ({
  CoverageMatrix: ({ domainId }: { domainId: string }) => (
    <div data-testid="coverage-matrix">Coverage Matrix for {domainId}</div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderDomainsPage(initialEntry = '/domains') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Domains />
    </MemoryRouter>,
  );
}

describe('Domains page', () => {
  it('renders domain selector with all domains', () => {
    renderDomainsPage();

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Domain A \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Domain B \(5\)/i })).toBeInTheDocument();
  });

  it('auto-selects first domain and shows coverage matrix', () => {
    renderDomainsPage();

    expect(screen.getByText('Domain A')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-matrix')).toBeInTheDocument();
    expect(screen.getByText(/Coverage Matrix for domain-a/i)).toBeInTheDocument();
  });

  it('restores selected domain from URL query string', () => {
    renderDomainsPage('/domains?domainId=domain-b');

    expect(screen.getByText('Domain B')).toBeInTheDocument();
    expect(screen.getByText(/Coverage Matrix for domain-b/i)).toBeInTheDocument();
  });

  it('switches domain when selector changes', async () => {
    const user = userEvent.setup();
    renderDomainsPage();

    await user.selectOptions(screen.getByRole('combobox'), 'domain-b');

    expect(screen.getByText('Domain B')).toBeInTheDocument();
    expect(screen.getByText(/Coverage Matrix for domain-b/i)).toBeInTheDocument();
  });

  it('navigates to manage domains page', async () => {
    const user = userEvent.setup();
    renderDomainsPage();

    await user.click(screen.getByRole('button', { name: /manage domains/i }));

    expect(navigateMock).toHaveBeenCalledWith('/domains/manage');
  });
});
