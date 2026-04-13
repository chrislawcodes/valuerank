import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Domains } from '../../src/pages/Domains';

const navigateMock = vi.fn();
const useQueryMock = vi.fn();

const domainsData = [
  {
    id: 'domain-a',
    name: 'Domain A',
    definitionCount: 2,
  },
  {
    id: 'domain-b',
    name: 'Domain B',
    definitionCount: 5,
  },
];

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => ({
    domains: domainsData,
    error: null,
  }),
}));

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

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
  beforeEach(() => {
    navigateMock.mockReset();
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: { definitions: Array<{ kind: string; name?: { value: string } }> }; variables?: Record<string, unknown> }) => {
      const operationName = args.query.definitions.find((definition) => definition.kind === 'OperationDefinition')?.name?.value;
      if (operationName === 'DomainAvailableSignatures') {
        return [{
          data: {
            domainAvailableSignatures: [
              { signature: 'vnewt0', label: 'Temp 0', isVirtual: true, temperature: 0 },
              { signature: 'vnewt0.7', label: 'Temp 0.7', isVirtual: true, temperature: 0.7 },
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }
      if (operationName === 'DomainValueCoverageLegacy' || operationName === 'DomainValueCoverage') {
        return [{
          data: {
            domainValueCoverage: {
              domainId: 'domain-a',
              values: ['Self_Direction_Action', 'Achievement'],
              cells: [
                {
                  valueA: 'Achievement',
                  valueB: 'Self_Direction_Action',
                  batchCount: 3,
                  definitionId: 'def-1',
                  definitionName: 'A vs B',
                  aggregateRunId: 'run-1',
                },
              ],
              availableModels: [
                { modelId: 'model-a', label: 'Model A' },
              ],
            },
          },
          fetching: false,
          error: undefined,
        }];
      }
      return [{ data: undefined, fetching: false, error: undefined }];
    });
  });

  it('shows the paired batch launch link for the selected domain', () => {
    renderDomainsPage();

    const launchLink = screen.getByRole('link', { name: /add paired batches for all vignettes/i });
    expect(launchLink).toHaveAttribute('href', '/domains/start/domain-a');
  });

  it('renders the coverage copy control beside the value coverage header', () => {
    renderDomainsPage();

    expect(screen.getByRole('heading', { name: /value coverage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy coverage table as image/i })).toBeInTheDocument();
  });

  it('updates the paired batch launch link when the selected domain changes', async () => {
    const user = userEvent.setup();
    renderDomainsPage();

    await user.selectOptions(screen.getAllByRole('combobox')[0]!, 'domain-b');

    expect(screen.getByRole('link', { name: /add paired batches for all vignettes/i }))
      .toHaveAttribute('href', '/domains/start/domain-b');
  });

  it('does not show a manage domains action', () => {
    renderDomainsPage();

    expect(screen.queryByRole('button', { name: /manage domains/i })).not.toBeInTheDocument();
  });
});
