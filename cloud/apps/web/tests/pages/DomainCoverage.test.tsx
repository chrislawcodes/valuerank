import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DomainCoverage } from '../../src/pages/DomainCoverage';

const useQueryMock = vi.fn();
const setSearchParamsMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [
      new URLSearchParams('domainId=domain-a&modelIds=model-a'),
      setSearchParamsMock,
    ],
  };
});

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => ({
    domains: [
      { id: 'domain-a', name: 'Domain A' },
      { id: 'domain-b', name: 'Domain B' },
    ],
    queryLoading: false,
    error: null,
  }),
}));

const coverageByDomain = {
  'domain-a': {
    domainId: 'domain-a',
    values: ['Self_Direction_Action', 'Achievement'],
    cells: [
      {
        valueA: 'Self_Direction_Action',
        valueB: 'Self_Direction_Action',
        batchCount: 0,
        definitionId: null,
        definitionName: null,
      },
      {
        valueA: 'Self_Direction_Action',
        valueB: 'Achievement',
        batchCount: 3,
        definitionId: 'def-1',
        definitionName: 'A vs B',
      },
      {
        valueA: 'Achievement',
        valueB: 'Self_Direction_Action',
        batchCount: 3,
        definitionId: 'def-1',
        definitionName: 'A vs B',
      },
      {
        valueA: 'Achievement',
        valueB: 'Achievement',
        batchCount: 0,
        definitionId: null,
        definitionName: null,
      },
    ],
    availableModels: [
      { modelId: 'model-a', label: 'Model A' },
    ],
  },
  'domain-b': {
    domainId: 'domain-b',
    values: ['Self_Direction_Action', 'Achievement'],
    cells: [
      {
        valueA: 'Self_Direction_Action',
        valueB: 'Self_Direction_Action',
        batchCount: 0,
        definitionId: null,
        definitionName: null,
      },
      {
        valueA: 'Self_Direction_Action',
        valueB: 'Achievement',
        batchCount: 4,
        definitionId: 'def-2',
        definitionName: 'B vs A',
      },
      {
        valueA: 'Achievement',
        valueB: 'Self_Direction_Action',
        batchCount: 4,
        definitionId: 'def-2',
        definitionName: 'B vs A',
      },
      {
        valueA: 'Achievement',
        valueB: 'Achievement',
        batchCount: 0,
        definitionId: null,
        definitionName: null,
      },
    ],
    availableModels: [
      { modelId: 'model-b', label: 'Model B' },
    ],
  },
} as const;

type UseQueryArgs = {
  variables: {
    domainId: 'domain-a' | 'domain-b';
    modelIds?: string[];
  };
};

function renderCoveragePage() {
  return render(
    <MemoryRouter initialEntries={['/domains/coverage?domainId=domain-a&modelIds=model-a']}>
      <DomainCoverage />
    </MemoryRouter>
  );
}

describe('DomainCoverage Page', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    setSearchParamsMock.mockReset();
    useQueryMock.mockImplementation((args: UseQueryArgs) => {
      const coverage = coverageByDomain[args.variables.domainId];
      return [{ data: { domainValueCoverage: coverage }, fetching: false, error: undefined }];
    });
  });

  it('clears stale model filters after switching to a domain with different available models', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderCoveragePage();
    });

    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox'), 'domain-b');
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            domainId: 'domain-b',
            modelIds: undefined,
          }),
        }),
      );
    });
  });
});
