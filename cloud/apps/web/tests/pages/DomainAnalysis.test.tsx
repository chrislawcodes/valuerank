import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DomainAnalysis } from '../../src/pages/DomainAnalysis';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  DOMAIN_FINDINGS_ELIGIBILITY_QUERY,
  REFRESH_DOMAIN_ANALYSIS_MUTATION,
} from '../../src/api/operations/domainAnalysis';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const refreshMutationExecuteMock = vi.fn();

const defaultSignatureData = {
  domainAvailableSignatures: [
    { signature: 'vnewt0', label: 'Latest @ t=0', isVirtual: true, temperature: 0 },
    { signature: 'vnewtd', label: 'Latest @ default', isVirtual: true, temperature: null },
    { signature: 'v1td', label: 'v1 default', isVirtual: false, temperature: null },
  ],
};

const defaultFindingsEligibility = {
  domainFindingsEligibility: {
    domainId: 'domain-a',
    eligible: false,
    status: 'DIAGNOSTIC_ONLY',
    summary: 'This domain can show diagnostic signals, but findings are not yet auditable.',
    reasons: ['Launch snapshot boundary is not complete for auditable findings yet, so this domain remains diagnostic-only.'],
    recommendedActions: ['Treat current charts as diagnostics until resolved launch snapshots are captured for findings.'],
    consideredScopeCategories: ['PRODUCTION', 'REPLICATION'],
    completedEligibleEvaluationCount: 1,
    latestEligibleEvaluationId: 'eval-1',
    latestEligibleScopeCategory: 'PRODUCTION',
    latestEligibleCompletedAt: '2026-03-15T12:00:00.000Z',
  },
};

const defaultDomainAnalysis = {
  domainAnalysis: {
    domainId: 'domain-a',
    domainName: 'Domain A',
    contributionSummary: [
      { domainId: 'domain-a', domainName: 'Domain A', rawTrialCount: 12, share: 1 },
    ],
    excludedDataSummary: [],
    totalDefinitions: 2,
    targetedDefinitions: 2,
    coveredDefinitions: 2,
    missingDefinitionIds: [],
    missingDefinitions: [],
    definitionsWithAnalysis: 2,
    cacheStatus: 'FRESH',
    generatedAt: '2026-03-15T12:00:00.000Z',
    models: [],
    unavailableModels: [],
    rankingShapeBenchmarks: {
      domainMeanTopGap: 0,
      domainStdTopGap: null,
      medianSpread: 0,
    },
    clusterAnalysis: {
      skipped: true,
      skipReason: 'Not enough models',
      defaultPair: null,
      clusters: [],
      faultLinesByPair: {},
    },
  },
};

function installQueryResponses(options?: {
  findingsData?: typeof defaultFindingsEligibility | undefined;
  findingsFetching?: boolean;
  findingsError?: Error | undefined;
  signaturesData?: typeof defaultSignatureData | undefined;
  signaturesFetching?: boolean;
  signaturesError?: Error | undefined;
  analysisData?: typeof defaultDomainAnalysis | undefined;
  analysisFetching?: boolean;
  analysisError?: Error | undefined;
}) {
  const findingsData = options && 'findingsData' in options ? options.findingsData : defaultFindingsEligibility;
  const findingsFetching = options?.findingsFetching ?? false;
  const findingsError = options?.findingsError;
  const signaturesData = options && 'signaturesData' in options ? options.signaturesData : defaultSignatureData;
  const signaturesFetching = options?.signaturesFetching ?? false;
  const signaturesError = options?.signaturesError;
  const analysisData = options && 'analysisData' in options ? options.analysisData : defaultDomainAnalysis;
  const analysisFetching = options?.analysisFetching ?? false;
  const analysisError = options?.analysisError;

  useQueryMock.mockImplementation((args: { query: unknown }) => {
    if (args.query === DOMAIN_AVAILABLE_SIGNATURES_QUERY) {
      return [{
        data: signaturesData,
        fetching: signaturesFetching,
        error: signaturesError,
      }];
    }
    if (args.query === DOMAIN_FINDINGS_ELIGIBILITY_QUERY) {
      return [{
        data: findingsData,
        fetching: findingsFetching,
        error: findingsError,
      }];
    }
    if (args.query === DOMAIN_ANALYSIS_QUERY) {
      return [{
        data: analysisData,
        fetching: analysisFetching,
        error: analysisError,
      }];
    }
    return [{ data: undefined, fetching: false, error: undefined }];
  });
}

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
    useMutation: (query: unknown) => useMutationMock(query),
  };
});

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => ({
    domains: [{ id: 'domain-a', name: 'Domain A', definitionCount: 2 }],
    queryLoading: false,
    error: null,
  }),
}));

vi.mock('../../src/components/domains/DominanceSection', () => ({
  DominanceSection: () => <div>Mock dominance section</div>,
}));

vi.mock('../../src/components/domains/ModelGroupsSection', () => ({
  ModelGroupsSection: () => <div>Mock model groups section</div>,
}));

vi.mock('../../src/components/domains/SimilaritySection', () => ({
  SimilaritySection: () => <div>Mock similarity section</div>,
}));

vi.mock('../../src/components/domains/ValuePrioritiesSection', () => ({
  ValuePrioritiesSection: () => <div>Mock value priorities section</div>,
}));

describe('DomainAnalysis', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    refreshMutationExecuteMock.mockReset();
    useMutationMock.mockImplementation((query: unknown) => {
      if (query === REFRESH_DOMAIN_ANALYSIS_MUTATION) {
        return [{ fetching: false }, refreshMutationExecuteMock];
      }
      return [{ fetching: false }, vi.fn()];
    });
    installQueryResponses();
  });

  it('shows the freshness badge for saved analysis', async () => {
    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/^Fresh$/)).toBeInTheDocument();
    expect(screen.getByText(/updated 3\/15\/2026/i)).toBeInTheDocument();
  });

  it('renders the report sections in the requested order', async () => {
    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    const modelGroups = await screen.findByText(/mock model groups section/i);
    const valuePriorities = screen.getByText(/mock value priorities section/i);
    const dominance = screen.getByText(/mock dominance section/i);
    const similarity = screen.getByText(/mock similarity section/i);

    expect(modelGroups.compareDocumentPosition(valuePriorities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(valuePriorities.compareDocumentPosition(dominance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dominance.compareDocumentPosition(similarity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('defaults the signature dropdown to latest default when available', async () => {
    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            domainId: 'domain-a',
            scoreMethod: 'FULL_BT',
            signature: 'vnewtd',
          }),
        }),
      );
    });

    const comboboxes = screen.getAllByRole('combobox');
    const signatureSelect = comboboxes[1];
    expect(signatureSelect).toHaveValue('vnewtd');

    const optionLabels = within(signatureSelect).getAllByRole('option').map((option) => option.textContent);
    expect(optionLabels.slice(0, 3)).toEqual(['Latest @ default', 'v1 @ default', 'Latest @ t=0']);
  });

  it('does not wait for signatures before starting the analysis query', async () => {
    installQueryResponses({
      signaturesData: undefined,
      signaturesFetching: true,
      signaturesError: undefined,
    });

    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: DOMAIN_ANALYSIS_QUERY,
          pause: false,
        }),
      );
    });
  });

  it('preserves the all-domains scope and disables domain-only actions', async () => {
    render(
      <MemoryRouter initialEntries={['/domains/analysis?scope=all-domains&signature=vnewtd']}>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            scope: 'all-domains',
          }),
        }),
      );
    });

    expect(await screen.findByText(/cross-domain summary/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /run missing vignettes/i })).not.toBeInTheDocument();
  });
});
