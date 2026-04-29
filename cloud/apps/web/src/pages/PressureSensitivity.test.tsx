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

function createPressureData(transcriptCapHit: boolean): PressureSensitivityQueryResult {
  return {
    pressureSensitivity: {
      excludedScenariosCount: 0,
      transcriptCapHit,
      models: [
        {
          modelId: 'model-a',
          label: 'Model A',
          providerName: 'Provider',
          unscoredCount: 0,
          winRateDeltaSummary: {
            mean: 0.1,
            ciLow: 0.05,
            ciHigh: 0.15,
            lowBandMean: 0.52,
            highBandMean: 0.62,
            pairsMeasured: 1,
            pairsPositive: 1,
          },
          valuePairs: [
            {
              pairKey: 'alpha::beta',
              ownToken: 'Alpha',
              opponentToken: 'Beta',
              n: 12,
              unscoredCount: 0,
              definitionsMeasured: 1,
              definitionsExcluded: 0,
              qualifyingTrials: 12,
              winRateDelta: {
                value: 0.4,
                lowBandMean: 0.45,
                highBandMean: 0.85,
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
    mockQuery(createPressureData(true));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Coverage warning: this report scanned the maximum 500,000 transcripts/)).toBeDefined();
  });

  it('hides the transcript cap banner when the backend does not flag it', () => {
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
    mockQuery(createPressureData(false));

    render(
      <MemoryRouter initialEntries={['/models/pressure-sensitivity?domainId=domain-a&signature=vnewtd']}>
        <PressureSensitivity />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Coverage warning: this report scanned the maximum 500,000 transcripts/)).toBeNull();
  });
});
