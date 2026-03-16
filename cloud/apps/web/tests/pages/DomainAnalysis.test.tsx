import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DomainAnalysis } from '../../src/pages/DomainAnalysis';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  DOMAIN_FINDINGS_ELIGIBILITY_QUERY,
} from '../../src/api/operations/domainAnalysis';

const useQueryMock = vi.fn();

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

vi.mock('../../src/components/domains/SimilaritySection', () => ({
  SimilaritySection: () => <div>Mock similarity section</div>,
}));

vi.mock('../../src/components/domains/ValuePrioritiesSection', () => ({
  ValuePrioritiesSection: () => <div>Mock value priorities section</div>,
}));

describe('DomainAnalysis', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: unknown }) => {
      if (args.query === DOMAIN_AVAILABLE_SIGNATURES_QUERY) {
        return [{
          data: {
            domainAvailableSignatures: [
              { signature: 'v1td', label: 'v1 default', isVirtual: false, temperature: null },
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === DOMAIN_FINDINGS_ELIGIBILITY_QUERY) {
        return [{
          data: {
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
          },
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === DOMAIN_ANALYSIS_QUERY) {
        return [{
          data: {
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
          },
          fetching: false,
          error: undefined,
        }];
      }
      return [{ data: undefined, fetching: false, error: undefined }];
    });
  });

  it('shows an explicit diagnostics-only state when findings are not auditable', async () => {
    render(
      <MemoryRouter>
        <DomainAnalysis />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/diagnostics only for now/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /^findings$/i })).toBeInTheDocument();
    expect(screen.getByText(/current evidence scope: diagnostic evidence only/i)).toBeInTheDocument();
    expect(screen.getByText(/findings are not yet auditable/i)).toBeInTheDocument();
    expect(screen.getByText(/launch snapshot boundary is not complete/i)).toBeInTheDocument();
    expect(screen.getByText(/what you are seeing on this page right now is domain-level diagnostic evidence/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open domain evaluation and start a production run/i })).toBeInTheDocument();
  });
});
