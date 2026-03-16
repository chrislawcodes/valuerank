import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Domains } from '../../src/pages/Domains';
import { DOMAIN_CONTEXTS_QUERY } from '../../src/api/operations/domain-contexts';
import { VALUE_STATEMENTS_QUERY } from '../../src/api/operations/value-statements';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const navigateMock = vi.fn();
const domainDefinitions = [
  {
    id: 'def-1',
    name: 'Vignette One',
    domainId: 'domain-a',
    domain: { id: 'domain-a', name: 'Domain A' },
    trialCount: 0,
    runCount: 0,
    version: 1,
    trialConfig: null,
  },
  {
    id: 'def-2',
    name: 'Vignette Two',
    domainId: 'domain-a',
    domain: { id: 'domain-a', name: 'Domain A' },
    trialCount: 12,
    runCount: 2,
    version: 3,
    trialConfig: null,
  },
];
const domainsData = [
  {
    id: 'domain-a',
    name: 'Domain A',
    definitionCount: 2,
  },
];

const useDomainsResult = {
  domains: domainsData,
  queryLoading: false,
  creating: false,
  renaming: false,
  deleting: false,
  assigningByIds: false,
  assigningByFilter: false,
  error: null,
  refetch: vi.fn(),
  createDomain: vi.fn(),
  renameDomain: vi.fn(),
  deleteDomain: vi.fn(),
  assignDomainToDefinitions: vi.fn(),
  assignDomainToDefinitionsByFilter: vi.fn(),
};

const useDefinitionsResult = {
  definitions: domainDefinitions,
  loading: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
    useMutation: () => useMutationMock(),
  };
});

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => useDomainsResult,
}));

vi.mock('../../src/hooks/useDefinitions', () => ({
  useDefinitions: () => useDefinitionsResult,
}));

vi.mock('../../src/pages/DomainContexts', () => ({
  DomainContexts: () => <div>Mock contexts panel</div>,
}));

vi.mock('../../src/pages/ValueStatements', () => ({
  ValueStatements: () => <div>Mock value statements panel</div>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function createUseQueryImplementation({
  contexts = [],
  valueStatements = [],
}: {
  contexts?: Array<{ id: string; domainId: string; text: string }>;
  valueStatements?: Array<{ id: string; domainId: string; token: string; body: string }>;
}) {
  return (args: { query: unknown; variables?: Record<string, unknown> }) => {
    if (args.query === DOMAIN_CONTEXTS_QUERY) {
      return [{ data: { domainContexts: contexts }, fetching: false, error: undefined }];
    }
    if (args.query === VALUE_STATEMENTS_QUERY) {
      return [{ data: { valueStatements }, fetching: false, error: undefined }];
    }
    if (args.variables?.withoutDomain === true) {
      return [{ data: { definitionCount: 0 }, fetching: false, error: undefined }];
    }
    if (args.variables?.domainId === 'domain-a') {
      return [{ data: { definitionCount: 2 }, fetching: false, error: undefined }];
    }
    return [{ data: { definitionCount: 2 }, fetching: false, error: undefined }];
  };
}

function renderDomainsPage(initialEntry = '/domains') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Domains />
    </MemoryRouter>,
  );
}

describe('Domains workspace', () => {
  beforeEach(() => {
    useMutationMock.mockReset();
    useMutationMock.mockReturnValue([{}, vi.fn()]);
    navigateMock.mockReset();
  });

  it('guides vignette creation into setup when required assets are missing', async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation(createUseQueryImplementation({
      contexts: [],
      valueStatements: [{ id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' }],
    }));

    renderDomainsPage();

    await user.click(screen.getByRole('button', { name: /domain a/i }));
    await user.click(screen.getAllByRole('button', { name: /create vignette/i })[0]!);

    expect(screen.getByRole('tab', { name: /setup/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /setup coverage/i })).toBeInTheDocument();
    expect(screen.getByText(/mock contexts panel/i)).toBeInTheDocument();
  });

  it('exposes runs and findings workspace tabs for a selected domain', async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation(createUseQueryImplementation({
      contexts: [{ id: 'context-1', domainId: 'domain-a', text: 'Context text' }],
      valueStatements: [
        { id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' },
        { id: 'value-2', domainId: 'domain-a', token: 'freedom', body: 'Preserve freedom' },
      ],
    }));

    renderDomainsPage();

    await user.click(screen.getByRole('button', { name: /domain a/i }));
    await user.click(screen.getByRole('tab', { name: /runs/i }));

    expect(screen.getByRole('heading', { name: /^runs$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open all runs/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /findings/i }));

    expect(screen.getByRole('heading', { name: /^findings$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open domain findings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open coverage/i })).toBeInTheDocument();
  });

  it('restores a deep-linked setup surface from the query string', () => {
    useQueryMock.mockImplementation(createUseQueryImplementation({
      contexts: [{ id: 'context-1', domainId: 'domain-a', text: 'Context text' }],
      valueStatements: [
        { id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' },
        { id: 'value-2', domainId: 'domain-a', token: 'freedom', body: 'Preserve freedom' },
      ],
    }));

    renderDomainsPage('/domains?domainId=domain-a&tab=setup&setupTab=contexts');

    expect(screen.getByRole('tab', { name: /setup/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/mock contexts panel/i)).toBeInTheDocument();
  });

  it('does not expose domain defaults in setup', async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation(createUseQueryImplementation({
      contexts: [{ id: 'context-1', domainId: 'domain-a', text: 'Context text' }],
      valueStatements: [
        { id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' },
        { id: 'value-2', domainId: 'domain-a', token: 'freedom', body: 'Preserve freedom' },
      ],
    }));

    renderDomainsPage();

    await user.click(screen.getByRole('button', { name: /domain a/i }));
    await user.click(screen.getByRole('tab', { name: /overview/i }));

    expect(screen.getByText(/no domain defaults\. each vignette must explicitly choose its own setup\./i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /setup/i }));

    expect(screen.queryByRole('button', { name: /defaults/i })).not.toBeInTheDocument();
  });

  it('simplifies the vignette inventory table and opens details from the vignette name', async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation(createUseQueryImplementation({
      contexts: [{ id: 'context-1', domainId: 'domain-a', text: 'Context text' }],
      valueStatements: [
        { id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' },
        { id: 'value-2', domainId: 'domain-a', token: 'freedom', body: 'Preserve freedom' },
      ],
    }));

    renderDomainsPage();

    await user.click(screen.getByRole('button', { name: /domain a/i }));

    expect(screen.getByRole('columnheader', { name: /vignette/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /version/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /temperature/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /batches/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /signature/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^domain$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /trials/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^open$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /re-run/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /vignette one/i }));

    expect(navigateMock).toHaveBeenCalledWith('/definitions/def-1');
  });

  it('uses run domain trials consistently across the domain workspace', async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation(createUseQueryImplementation({
      contexts: [{ id: 'context-1', domainId: 'domain-a', text: 'Context text' }],
      valueStatements: [
        { id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' },
        { id: 'value-2', domainId: 'domain-a', token: 'freedom', body: 'Preserve freedom' },
      ],
    }));

    renderDomainsPage();

    await user.click(screen.getByRole('button', { name: /domain a/i }));

    expect(screen.queryByRole('button', { name: /open domain evaluation/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /run domain trials/i }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: /runs/i }));

    expect(screen.queryByRole('button', { name: /open domain evaluation/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /run domain trials/i }).length).toBeGreaterThan(0);
  });
});
