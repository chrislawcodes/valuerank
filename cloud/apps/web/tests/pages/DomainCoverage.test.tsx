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

const signaturesByDomain = {
  'domain-a': [
    { signature: 'vnewt0', label: 'Temp 0', isVirtual: true, temperature: 0 },
    { signature: 'vnewt0.7', label: 'Temp 0.7', isVirtual: true, temperature: 0.7 },
  ],
  'domain-b': [
    { signature: 'vnewt0.7', label: 'Temp 0.7', isVirtual: true, temperature: 0.7 },
  ],
} as const;

type UseQueryArgs = {
  query: {
    definitions: Array<{
      kind: string;
      name?: { value: string };
    }>;
  };
  variables: {
    domainId: 'domain-a' | 'domain-b';
    modelIds?: string[];
    signature?: string;
  };
};

function getOperationName(args: UseQueryArgs): string | undefined {
  return args.query.definitions.find((definition) => definition.kind === 'OperationDefinition')?.name?.value;
}

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
      const operationName = getOperationName(args);
      if (operationName === 'DomainAvailableSignatures') {
        return [{
          data: { domainAvailableSignatures: signaturesByDomain[args.variables.domainId] },
          fetching: false,
          error: undefined,
        }];
      }
      if (operationName === 'DomainValueCoverageLegacy') {
        const legacyCoverage = coverageByDomain[args.variables.domainId];
        return [{ data: { domainValueCoverage: legacyCoverage }, fetching: false, error: undefined }];
      }

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
      await user.selectOptions(screen.getByRole('combobox', { name: 'Domain Selection' }), 'domain-b');
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

  it('passes the selected signature to the coverage query', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderCoveragePage();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Trial Signature' }), 'vnewt0.7');
    });

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            domainId: 'domain-a',
            signature: 'vnewt0.7',
          }),
        }),
      );
    });

    expect(screen.getByRole('button', { name: /copy coverage table as image/i })).toBeInTheDocument();
  });

  it('falls back to legacy query when API rejects signature argument', async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((args: UseQueryArgs) => {
      const operationName = getOperationName(args);
      if (operationName === 'DomainAvailableSignatures') {
        return [{
          data: { domainAvailableSignatures: signaturesByDomain[args.variables.domainId] },
          fetching: false,
          error: undefined,
        }];
      }
      if (operationName === 'DomainValueCoverage') {
        return [{ data: undefined, fetching: false, error: new Error('Unknown argument "signature"') }];
      }
      if (operationName === 'DomainValueCoverageLegacy') {
        const legacyCoverage = coverageByDomain[args.variables.domainId];
        return [{ data: { domainValueCoverage: legacyCoverage }, fetching: false, error: undefined }];
      }
      return [{ data: undefined, fetching: false, error: undefined }];
    });

    await act(async () => {
      renderCoveragePage();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Trial Signature' }), 'vnewt0.7');
    });

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            definitions: expect.arrayContaining([
              expect.objectContaining({
                kind: 'OperationDefinition',
                name: expect.objectContaining({ value: 'DomainValueCoverageLegacy' }),
              }),
            ]),
          }),
        }),
      );
    });

    expect(screen.getByText(/does not yet support signature filtering/i)).toBeInTheDocument();
  });
});
