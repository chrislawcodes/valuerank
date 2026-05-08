import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ModelsGroups } from '../../src/pages/ModelsGroups';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
} from '../../src/api/operations/domainAnalysis';
import { LLM_MODELS_QUERY } from '../../src/api/operations/llm';
import { MODELS_ANALYSIS_QUERY } from '../../src/api/operations/modelsAnalysis';

const useQueryMock = vi.fn();
const defaultSignatureData = {
  domainAvailableSignatures: [
    { signature: 'vnewtd', label: 'Latest @ default', isVirtual: true, temperature: null },
    { signature: 'v1td', label: 'v1 default', isVirtual: false, temperature: null },
  ],
};

const defaultClusterAnalysis = {
  skipped: false,
  skipReason: null,
  defaultPair: null,
  clusters: [
    {
      id: 'cluster-a',
      name: 'Cluster A',
      definingValues: ['Achievement'],
      centroid: { Achievement: 1 },
      members: [
        {
          model: 'model-a',
          label: 'Model A',
          silhouetteScore: 0.5,
          isOutlier: false,
          nearestClusterIds: null,
          distancesToNearestClusters: null,
        },
      ],
    },
    {
      id: 'cluster-b',
      name: 'Cluster B',
      definingValues: ['Hedonism'],
      centroid: { Hedonism: -1 },
      members: [
        {
          model: 'model-b',
          label: 'Model B',
          silhouetteScore: 0.5,
          isOutlier: false,
          nearestClusterIds: null,
          distancesToNearestClusters: null,
        },
      ],
    },
  ],
  faultLinesByPair: {},
};

const defaultAnalysis = {
  domainAnalysis: {
    domainId: 'domain-a',
    domainName: 'Domain A',
    contributionSummary: [],
    excludedDataSummary: [],
    totalDefinitions: 2,
    targetedDefinitions: 2,
    coveredDefinitions: 2,
    missingDefinitionIds: [],
    missingDefinitions: [],
    definitionsWithAnalysis: 2,
    cacheStatus: 'FRESH',
    generatedAt: '2026-03-15T12:00:00.000Z',
    models: [
      {
        model: 'model-a',
        label: 'Model A',
        values: [
          { valueKey: 'Achievement', score: 1 },
          { valueKey: 'Hedonism', score: -1 },
        ],
      },
      {
        model: 'model-b',
        label: 'Model B',
        values: [
          { valueKey: 'Achievement', score: 0.5 },
          { valueKey: 'Hedonism', score: -0.5 },
        ],
      },
    ],
    unavailableModels: [],
    clusterAnalysis: defaultClusterAnalysis,
    clusterAnalysisByMethod: {
      'log-odds-euclidean-upgma': defaultClusterAnalysis,
      'log-odds-euclidean-ward': defaultClusterAnalysis,
    },
  },
};

const defaultModelsAnalysis = {
  modelsAnalysis: {
    models: [
      {
        modelId: 'model-a',
        label: 'Model A',
        values: [
          { valueKey: 'Achievement', pooledWinRate: 72.5, stabilityScore: 91.2, eligibleDomainCount: 2, domains: [] },
        ],
      },
      {
        modelId: 'model-b',
        label: 'Model B',
        values: [
          { valueKey: 'Achievement', pooledWinRate: 62.5, stabilityScore: 88.1, eligibleDomainCount: 2, domains: [] },
        ],
      },
    ],
  },
};

const defaultLlmModels = {
  llmModels: [
    {
      id: 'llm-model-a',
      providerId: 'provider-a',
      modelId: 'model-a',
      displayName: 'Model A',
      costInputPerMillion: 0,
      costOutputPerMillion: 0,
      status: 'ACTIVE',
      isDefault: true,
      isAvailable: true,
      apiConfig: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    },
    {
      id: 'llm-model-b',
      providerId: 'provider-a',
      modelId: 'model-b',
      displayName: 'Model B',
      costInputPerMillion: 0,
      costOutputPerMillion: 0,
      status: 'ACTIVE',
      isDefault: true,
      isAvailable: true,
      apiConfig: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    },
  ],
};

function installQueryResponses() {
  useQueryMock.mockImplementation((args: { query: unknown }) => {
    if (args.query === DOMAIN_AVAILABLE_SIGNATURES_QUERY) {
      return [{
        data: defaultSignatureData,
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === DOMAIN_ANALYSIS_QUERY || args.query === DOMAIN_ANALYSIS_QUERY_LEGACY) {
      return [{
        data: defaultAnalysis,
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === MODELS_ANALYSIS_QUERY) {
      return [{
        data: defaultModelsAnalysis,
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === LLM_MODELS_QUERY) {
      return [{
        data: defaultLlmModels,
        fetching: false,
        error: undefined,
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

describe('ModelsGroups', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    installQueryResponses();
  });

  it('renders the domain selection bar and model groups visualization', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/models?domainId=domain-a&signature=vnewtd']}>
        <ModelsGroups />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: /domain:/i })).toBeInTheDocument();
    expect(screen.getByText('Analysis settings')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Model Clusters', level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Model Clusters', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Similarity by Model' })).toBeInTheDocument();
    expect(screen.getAllByText('10.00').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Spearman' }));
    await user.click(screen.getByRole('button', { name: 'Similarity' }));

    expect(screen.queryByText('10.00')).not.toBeInTheDocument();
  });

  it('shows the transcript count in the freshness line', async () => {
    render(
      <MemoryRouter initialEntries={['/models?domainId=domain-a&signature=vnewtd']}>
        <ModelsGroups />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/^Fresh$/)).toBeInTheDocument();
    expect(screen.getByText(/0 transcripts analyzed/i)).toBeInTheDocument();
  });

  it('shows a full-page error when one query fails', async () => {
    useQueryMock.mockImplementation((args: { query: unknown }) => {
      if (args.query === DOMAIN_AVAILABLE_SIGNATURES_QUERY) {
        return [{
          data: defaultSignatureData,
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === DOMAIN_ANALYSIS_QUERY || args.query === DOMAIN_ANALYSIS_QUERY_LEGACY) {
        return [{
          data: defaultAnalysis,
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === MODELS_ANALYSIS_QUERY) {
        return [{
          data: defaultModelsAnalysis,
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === LLM_MODELS_QUERY) {
        return [{
          data: defaultLlmModels,
          fetching: false,
          error: {
            message: '[GraphQL] Unexpected error occurred.',
            graphQLErrors: [
              {
                message: 'Active models resolver failed.',
                path: ['llmModels'],
                extensions: {
                  code: 'INTERNAL_SERVER_ERROR',
                  errorId: 'vr-1234abcd',
                },
              },
            ],
          },
        }];
      }
      return [{ data: undefined, fetching: false, error: undefined }];
    });

    render(
      <MemoryRouter initialEntries={['/models?domainId=domain-a&signature=vnewtd']}>
        <ModelsGroups />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Model Groups active LLM models query failed/i)).toBeInTheDocument();
    expect(screen.getByText(/errorId=vr-1234abcd/i)).toBeInTheDocument();
    expect(screen.getByText(/path=llmModels/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Model Clusters', level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Similarity by Model' })).not.toBeInTheDocument();
    expect(screen.queryByText('Model Agreement on Value Tradeoffs')).not.toBeInTheDocument();
  });
});
