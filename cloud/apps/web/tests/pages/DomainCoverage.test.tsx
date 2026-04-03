import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DomainCoverage } from '../../src/pages/DomainCoverage';

const useQueryMock = vi.fn();
const setSearchParamsMock = vi.fn();
let initialSearchParams = 'domainId=domain-a&modelIds=model-a';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [
      new URLSearchParams(initialSearchParams),
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
        valueA: 'Achievement',
        valueB: 'Self_Direction_Action',
        batchCount: 3,
        pairedBatchCount: 2,
        definitionId: 'def-1',
        definitionName: 'A vs B',
        aggregateRunId: 'run-1',
      },
    ],
    availableModels: [
      { modelId: 'model-a', label: 'Model A' },
      { modelId: 'model-b', label: 'Model B' },
    ],
  },
  'domain-b': {
    domainId: 'domain-b',
    values: ['Self_Direction_Action', 'Achievement'],
    cells: [
      {
        valueA: 'Achievement',
        valueB: 'Self_Direction_Action',
        batchCount: 4,
        pairedBatchCount: 3,
        definitionId: 'def-2',
        definitionName: 'B vs A',
        aggregateRunId: 'run-2',
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
    initialSearchParams = 'domainId=domain-a&modelIds=model-a';
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

  it('shows the coverage copy control for the active domain', async () => {
    await act(async () => {
      renderCoveragePage();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy coverage table as image/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Model A' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Model B' })).not.toBeInTheDocument();
    });
  });

  it('passes the selected signature to the coverage query', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderCoveragePage();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Batch Signature' }), 'vnewt0.7');
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

    expect(screen.getAllByRole('button', { name: /copy coverage table as image/i }).length).toBeGreaterThan(0);
  });

  it('defaults signature to temp 0 when no signature query param is provided', async () => {
    initialSearchParams = 'domainId=domain-a';
    await act(async () => {
      renderCoveragePage();
    });

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            domainId: 'domain-a',
            signature: 'vnewt0',
          }),
        }),
      );
    });
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
      await user.selectOptions(screen.getByRole('combobox', { name: 'Batch Signature' }), 'vnewt0.7');
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

  it('opens vignette analysis for the selected value-pair cell', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderCoveragePage();
    });

    await act(async () => {
      await user.click(
        screen.getByRole('button', { name: /self-direction versus achievement.*2 paired batch/i })
      );
    });

    const pairedBatchLink = await screen.findByRole('link', { name: /start paired batch/i });
    expect(pairedBatchLink).toHaveAttribute('href', '/definitions/def-1/start-paired-batch');

    const vignetteAnalysisLink = await screen.findByRole('link', { name: /view vignette analysis/i });
    const href = vignetteAnalysisLink.getAttribute('href');
    expect(href).toContain('/analysis/run-1');
    const url = new URL(href ?? '', 'http://example.com');
    expect(url.pathname).toBe('/analysis/run-1');
    expect(url.searchParams.get('tab')).toBe('overview');
    expect(url.searchParams.get('mode')).toBe('single');
    expect(url.searchParams.get('coverageBatchCount')).toBe('3');
    expect(url.searchParams.get('coveragePairedBatchCount')).toBe('2');
    expect(screen.queryByRole('link', { name: /view domain analysis/i })).not.toBeInTheDocument();
  });
});
