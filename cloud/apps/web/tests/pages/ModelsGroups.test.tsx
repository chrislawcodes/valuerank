import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelsGroups } from '../../src/pages/ModelsGroups';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
} from '../../src/api/operations/domainAnalysis';
import { MODELS_ANALYSIS_QUERY } from '../../src/api/operations/modelsAnalysis';

const useQueryMock = vi.fn();
const modelGroupsSectionMock = vi.fn(() => <div>Mock model groups section</div>);
const modelSimilarityTableSectionMock = vi.fn(() => <div>Mock model similarity table section</div>);

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
    ],
    unavailableModels: [],
    clusterAnalysis: defaultClusterAnalysis,
    clusterAnalysisByMethod: { 'log-odds-euclidean-upgma': defaultClusterAnalysis },
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
    ],
  },
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

vi.mock('../../src/components/domains/ModelGroupsSection', () => ({
  ModelGroupsSection: (props: unknown) => modelGroupsSectionMock(props),
}));

vi.mock('../../src/components/models/ModelSimilarityTableSection', () => ({
  ModelSimilarityTableSection: (props: unknown) => modelSimilarityTableSectionMock(props),
}));

describe('ModelsGroups', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    modelGroupsSectionMock.mockClear();
    modelSimilarityTableSectionMock.mockClear();
    installQueryResponses();
  });

  it('renders the domain selection bar and model groups visualization', async () => {
    render(
      <MemoryRouter initialEntries={['/models?domainId=domain-a&signature=vnewtd']}>
        <ModelsGroups />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: /domain:/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Model Groups' })).toBeInTheDocument();
    expect(screen.getByText(/mock model groups section/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(modelGroupsSectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterAnalysisByMethod: defaultAnalysis.domainAnalysis.clusterAnalysisByMethod,
          models: expect.arrayContaining([
            expect.objectContaining({
              model: 'model-a',
              label: 'Model A',
              values: {
                Self_Direction_Action: 0,
                Universalism_Nature: 0,
                Benevolence_Dependability: 0,
                Security_Personal: 0,
                Power_Dominance: 0,
                Achievement: 1,
                Tradition: 0,
                Stimulation: 0,
                Hedonism: -1,
                Conformity_Interpersonal: 0,
              },
            }),
          ]),
        }),
      );
      expect(modelSimilarityTableSectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          models: expect.arrayContaining([
            expect.objectContaining({
              model: 'model-a',
              label: 'Model A',
              winRates: {
                Self_Direction_Action: null,
                Universalism_Nature: null,
                Benevolence_Dependability: null,
                Security_Personal: null,
                Power_Dominance: null,
                Achievement: 72.5,
                Tradition: null,
                Stimulation: null,
                Hedonism: null,
                Conformity_Interpersonal: null,
              },
            }),
          ]),
        }),
      );
    });
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
});
