import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DomainAnalysis } from '../../src/pages/DomainAnalysis';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  DOMAIN_FINDINGS_ELIGIBILITY_QUERY,
} from '../../src/api/operations/domainAnalysis';

const useQueryMock = vi.fn();

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
    totalDefinitions: 2,
    targetedDefinitions: 2,
    coveredDefinitions: 2,
    missingDefinitionIds: [],
    missingDefinitions: [],
    definitionsWithAnalysis: 2,
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
    installQueryResponses();
  });

  it('shows the compact scope chip and expands the details panel', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    const disclosure = await screen.findByRole('button', { name: /show evidence scope details/i });
    expect(screen.getByText(/current evidence scope: diagnostic evidence only/i)).toBeInTheDocument();

    await user.click(disclosure);

    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/this domain can show diagnostic signals/i)).toBeInTheDocument();
    expect(screen.getByText(/launch snapshot boundary is not complete/i)).toBeInTheDocument();

    disclosure.focus();
    await user.keyboard('{Enter}');

    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a loading chip while the eligibility query is unresolved', async () => {
    installQueryResponses({
      findingsData: undefined,
      findingsFetching: true,
      findingsError: undefined,
    });

    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    await screen.findByText(/loading scope/i);
    expect(screen.queryByRole('button', { name: /show evidence scope details/i })).not.toBeInTheDocument();
  });

  it('keeps the report visible when the eligibility query fails', async () => {
    installQueryResponses({
      findingsData: undefined,
      findingsFetching: false,
      findingsError: new Error('Eligibility data could not load'),
    });

    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show evidence scope details/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/scope unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/eligibility data could not load/i)).toBeInTheDocument();
    expect(screen.getByText(/Mock model groups section/i)).toBeInTheDocument();
    expect(screen.getByText(/Mock value priorities section/i)).toBeInTheDocument();
    expect(screen.getByText(/Mock dominance section/i)).toBeInTheDocument();
    expect(screen.getByText(/Mock similarity section/i)).toBeInTheDocument();
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
});
