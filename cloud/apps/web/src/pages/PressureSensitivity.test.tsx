import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { PressureSensitivity } from './PressureSensitivity';
import { DOMAIN_AVAILABLE_SIGNATURES_QUERY } from '../api/operations/domainAnalysis';
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
          pressureResponseSummary: {
            mean: 0.1,
            rangeMin: 0.05,
            rangeMax: 0.15,
            pairsMeasured: 1,
          },
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
  mockedUseQuery.mockImplementation(({ query }: { query: unknown }) => {
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
    if (query === PRESSURE_SENSITIVITY_QUERY) {
      return [
        {
          data,
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

    expect(screen.getByText('Pressure Response by Value')).toBeDefined();
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
});
