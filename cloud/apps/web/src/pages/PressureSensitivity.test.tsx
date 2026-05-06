import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureSensitivity } from './PressureSensitivity';
import { AVAILABLE_SIGNATURES_QUERY } from '../api/operations/available-signatures';
import { DOMAIN_AVAILABLE_SIGNATURES_QUERY } from '../api/operations/domainAnalysis';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { PRESSURE_SENSITIVITY_QUERY } from '../api/operations/pressureSensitivity';
import type { PressureSensitivityQueryResult } from '../api/operations/pressureSensitivity';

vi.mock('urql', () => ({
  useQuery: vi.fn(),
}));

vi.mock('../hooks/useDomains', () => ({
  useDomains: vi.fn(),
}));

import { useQuery } from 'urql';
import { useDomains } from '../hooks/useDomains';

const mockedUseQuery = vi.mocked(useQuery);
const mockedUseDomains = vi.mocked(useDomains);

function createPressureData(
  transcriptCapHit: boolean,
  pressureConditionExcludedCount = 0,
): PressureSensitivityQueryResult {
  return {
    pressureSensitivity: {
      pressureConditionExcludedCount,
      transcriptCapHit,
      models: [
        {
          modelId: 'model-a',
          label: 'Model A',
          providerName: 'Provider',
          unscoredCount: 0,
          pushedEffectPairsUsed: 0,
          domainPressureEffects: [],
          pressureResponseSummary: {
            mean: 0.1,
            rangeMin: 0.05,
            rangeMax: 0.15,
            pairsMeasured: 1,
          },
          valueRates: [
            {
              valueToken: 'alpha',
              valueLabel: 'Alpha',
              averageWinRate: 0.4,
              balancedWinRate: 0.3,
              highPressureOnThisValueWinRate: 0.6,
              highPressureOnOpposingValueWinRate: 0.3,
              pairsMeasured: 1,
            },
          ],
          valuePairs: [
            {
              pairKey: 'alpha::beta',
              firstValueToken: 'alpha',
              firstValueLabel: 'Alpha',
              secondValueToken: 'beta',
              secondValueLabel: 'Beta',
              n: 12,
              unscoredCount: 0,
              definitionsMeasured: 1,
              pressureResponse: {
                value: 0.4,
                baselineRate: 0.5,
                pushTowardFirstRate: 0.7,
                pushTowardSecondRate: 0.3,
                qualifyingTrials: 12,
                ciLow: 0.1,
                ciHigh: 0.7,
                reason: null,
              },
              grid: [],
            },
          ],
        },
        {
          modelId: 'model-b',
          label: 'Model B',
          providerName: 'Provider',
          unscoredCount: 0,
          pushedEffectPairsUsed: 0,
          domainPressureEffects: [],
          pressureResponseSummary: {
            mean: 0.2,
            rangeMin: 0.1,
            rangeMax: 0.3,
            pairsMeasured: 1,
          },
          valueRates: [
            {
              valueToken: 'alpha',
              valueLabel: 'Alpha',
              averageWinRate: 0.8,
              balancedWinRate: 0.5,
              highPressureOnThisValueWinRate: 0.9,
              highPressureOnOpposingValueWinRate: 0.2,
              pairsMeasured: 1,
            },
          ],
          valuePairs: [
            {
              pairKey: 'gamma::delta',
              firstValueToken: 'gamma',
              firstValueLabel: 'Gamma',
              secondValueToken: 'delta',
              secondValueLabel: 'Delta',
              n: 8,
              unscoredCount: 0,
              definitionsMeasured: 1,
              pressureResponse: {
                value: -0.2,
                baselineRate: 0.4,
                pushTowardFirstRate: 0.3,
                pushTowardSecondRate: 0.5,
                qualifyingTrials: 8,
                ciLow: -0.4,
                ciHigh: 0,
                reason: null,
              },
              grid: [],
            },
          ],
        },
      ],
      insufficient: [],
      excludedDefinitions: [],
      pressureConditionExclusionBreakdown: {
        sourceRunMapping: 0,
        definitionMetadata: 0,
        missingScenario: 0,
        invalidMetadata: 0,
        levelAssignment: 0,
      },
      directionalSanityCheck: {
        positivePct: 80,
        flatPct: 10,
        negativePct: 10,
        measuredCount: 1,
        unmeasurableCount: 0,
        breakdown: [],
      },
    },
  };
}

function createModelsData(): LlmModelsQueryResult {
  return {
    llmModels: [
      {
        id: 'model-a-id',
        providerId: 'provider-a',
        modelId: 'model-a',
        displayName: 'Model A',
        costInputPerMillion: 1,
        costOutputPerMillion: 2,
        status: 'ACTIVE',
        isDefault: true,
        isAvailable: true,
        apiConfig: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        provider: {
          id: 'provider-a',
          name: 'provider-a',
          displayName: 'Provider A',
          maxParallelRequests: 10,
          requestsPerMinute: 60,
          isEnabled: true,
          balance: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          models: [],
        },
      },
      {
        id: 'model-b-id',
        providerId: 'provider-b',
        modelId: 'model-b',
        displayName: 'Model B',
        costInputPerMillion: 1,
        costOutputPerMillion: 2,
        status: 'ACTIVE',
        isDefault: true,
        isAvailable: true,
        apiConfig: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        provider: {
          id: 'provider-b',
          name: 'provider-b',
          displayName: 'Provider B',
          maxParallelRequests: 10,
          requestsPerMinute: 60,
          isEnabled: true,
          balance: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          models: [],
        },
      },
    ],
  };
}

function mockDomainsOnce() {
  mockedUseDomains.mockReturnValue({
    domains: [{ id: 'domain-a', name: 'Domain A' }],
    loading: false,
    queryLoading: false,
    creating: false,
    renaming: false,
    deleting: false,
    assigningByIds: false,
    assigningByFilter: false,
    runningDomainTrials: false,
    error: null,
    refetch: vi.fn(),
    createDomain: vi.fn(),
    renameDomain: vi.fn(),
    deleteDomain: vi.fn(),
    assignDomainToDefinitions: vi.fn(),
    assignDomainToDefinitionsByFilter: vi.fn(),
    runTrialsForDomain: vi.fn(),
  } as unknown as ReturnType<typeof useDomains>);
}

function mockQuery(data: PressureSensitivityQueryResult) {
  mockedUseQuery.mockImplementation((args: Parameters<typeof useQuery>[0]) => {
    const { query } = args;
    const variables = args.variables as { modelIds?: string[] | string | null } | undefined;
    if (query === DOMAIN_AVAILABLE_SIGNATURES_QUERY) {
      return [
        {
          data: {
            domainAvailableSignatures: [{ signature: 'vnewtd' }],
          },
          fetching: false,
          error: undefined,
        } as unknown,
        vi.fn(),
      ] as unknown as ReturnType<typeof useQuery>;
    }
    if (query === AVAILABLE_SIGNATURES_QUERY) {
      return [
        {
          data: {
            availableSignatures: [{ signature: 'vnewtd', mostRecentRunAt: '2025-01-01T00:00:00.000Z' }],
          },
          fetching: false,
          error: undefined,
        } as unknown,
        vi.fn(),
      ] as unknown as ReturnType<typeof useQuery>;
    }
    if (query === LLM_MODELS_QUERY) {
      return [
        {
          data: createModelsData(),
          fetching: false,
          error: undefined,
        } as unknown,
        vi.fn(),
      ] as unknown as ReturnType<typeof useQuery>;
    }
    if (query === PRESSURE_SENSITIVITY_QUERY) {
      const modelIds = variables?.modelIds;
      const selectedModelIds = modelIds == null ? null : (Array.isArray(modelIds) ? modelIds : [modelIds]);
      const filteredModels = selectedModelIds == null
        ? data.pressureSensitivity.models
        : data.pressureSensitivity.models.filter((model) => selectedModelIds.includes(model.modelId));
      return [
        {
          data: {
            ...data,
            pressureSensitivity: {
              ...data.pressureSensitivity,
              models: filteredModels,
            },
          },
          fetching: false,
          error: undefined,
        } as unknown,
        vi.fn(),
      ] as unknown as ReturnType<typeof useQuery>;
    }
    return [
      {
        data: undefined,
        fetching: false,
        error: undefined,
      } as unknown,
      vi.fn(),
    ] as unknown as ReturnType<typeof useQuery>;
  });
}

afterEach(() => {
  mockedUseQuery.mockReset();
  mockedUseDomains.mockReset();
});

describe('PressureSensitivity page', () => {
  it('renders the transcript cap banner when the backend flags it', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(true));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Coverage warning: this report scanned the maximum 500,000 transcripts/)).toBeDefined();
  });

  it('hides the transcript cap banner when the backend does not flag it', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(false));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Coverage warning: this report scanned the maximum 500,000 transcripts/)).toBeNull();
  });

  it('renders the exclusion warning when pressureConditionExcludedCount is nonzero', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(false, 42));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.getByText(/42 pressure conditions were excluded/)).toBeDefined();
  });

  it('renders the by-value section for the selected model', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(false));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.getByText('Win Rate by Pressure Conditions by Value')).toBeDefined();
    expect(screen.getByText('High Pressure on Value Win Rate by Domain by Value')).toBeDefined();
  });

  it('defaults to the shared bar and removes the provider filter copy', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(false));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    const pressureQueryCalls = mockedUseQuery.mock.calls.filter(
      (call) => (call[0] as { query?: unknown }).query === PRESSURE_SENSITIVITY_QUERY,
    );
    const pressureQueryCall = pressureQueryCalls[pressureQueryCalls.length - 1];
    if (pressureQueryCall == null) {
      throw new Error('Missing pressure sensitivity query call');
    }
    const pressureQueryArgs = pressureQueryCall[0] as { variables?: Record<string, unknown> };
    expect(pressureQueryArgs.variables).not.toHaveProperty('domainId');
    expect(screen.getByRole('button', { name: /^Domain: All domains$/i })).toBeDefined();
    expect(screen.getByText(/^Models$/i)).toBeDefined();
    expect(screen.getByText(/^Default — 2 models$/i)).toBeDefined();
    expect(screen.queryByText('Provider')).toBeNull();
    expect(
      screen.queryByText(
        /This report shows each model's pressure response — how much added pressure moves the model toward its own value over the other\./,
      ),
    ).toBeNull();
  });

  it('appends lower-bound sentence when both transcript cap and exclusions are present', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(true, 10));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.getByText(/lower bound on pressure sensitivity/)).toBeDefined();
  });

  it('switches the grid model picker without changing the averaged by-value table', () => {
    mockDomainsOnce();
    mockQuery(createPressureData(false));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    const byValueSection = screen.getByRole('heading', { name: 'Win Rate by Pressure Conditions by Value' }).closest('section');
    if (byValueSection == null) {
      throw new Error('Missing by-value section');
    }

    const valueRow = within(byValueSection).getByText('Alpha').closest('tr');
    if (valueRow == null) {
      throw new Error('Missing Alpha row');
    }

    let valueCells = within(valueRow).getAllByRole('cell');
    expect(valueCells[1]?.textContent ?? '').toBe('60.0%');
    expect(screen.getByText(/Pick a single model in the bar above to view the pair-by-pair grid\./)).toBeDefined();
    expect(screen.queryByText('Alpha ↔ Beta')).toBeNull();
    expect(screen.queryByText('Gamma ↔ Delta')).toBeNull();

    fireEvent.click(screen.getByText(/^Default — 2 models$/i));
    fireEvent.click(screen.getByRole('button', { name: /^Model A$/i }));

    expect(screen.queryByText(/Pick a single model in the bar above to view the pair-by-pair grid\./)).toBeNull();
    expect(screen.getByText('Gamma ↔ Delta')).toBeDefined();
    expect(screen.queryByText('Alpha ↔ Beta')).toBeNull();

    valueCells = within(valueRow).getAllByRole('cell');
    expect(valueCells[1]?.textContent ?? '').toBe('80.0%');
  });
});
