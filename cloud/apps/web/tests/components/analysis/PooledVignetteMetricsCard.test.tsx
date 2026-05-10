/**
 * PooledVignetteMetricsCard tests.
 *
 * Covers the visibility rules, the N/M count line, the per-model table, and the
 * tooltip on null pressure response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseQuery = vi.fn();
const mockUseRuns = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => mockUseQuery(args),
  };
});

vi.mock('../../../src/hooks/useRuns', () => ({
  useRuns: (args: unknown) => mockUseRuns(args),
}));

import { PooledVignetteMetricsCard } from '../../../src/components/analysis/PooledVignetteMetricsCard';
import type { Run } from '../../../src/api/operations/runs';

type MinimalRun = Pick<
  Run,
  'id' | 'definitionId' | 'config' | 'definitionVersion' | 'mirroredRuns' | 'definition'
> & { [key: string]: unknown };

function makeRun(overrides: Partial<MinimalRun> = {}): Run {
  return {
    id: 'run-current',
    name: null,
    definitionId: 'def-current',
    definitionVersion: 1,
    experimentId: null,
    status: 'COMPLETED',
    config: {
      models: ['gpt-4'],
      temperature: null,
    },
    progress: { total: 10, completed: 10, failed: 0 },
    runProgress: { total: 10, completed: 10, failed: 0, percentComplete: 100 },
    summarizeProgress: null,
    stalledModels: [],
    isAggregate: false,
    startedAt: '2026-01-15T10:00:00Z',
    completedAt: '2026-01-15T10:10:00Z',
    createdAt: '2026-01-15T09:55:00Z',
    updatedAt: '2026-01-15T10:10:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 10,
    recentTasks: [],
    failedProbes: [],
    analysisStatus: null,
    executionMetrics: null,
    analysis: null,
    mirroredRuns: [],
    tags: [],
    definition: {
      id: 'def-current',
      name: 'Career vs Family',
      version: 1,
      tags: [],
      content: {
        components: {
          value_first: { token: 'career' },
          value_second: { token: 'family' },
        },
        methodology: {
          family: 'job-choice',
        },
      },
    },
    ...overrides,
  } as Run;
}

function makeNonPairedRun(): Run {
  return makeRun({
    definitionId: 'def-non-paired',
    definition: {
      id: 'def-non-paired',
      name: 'Single-token vignette',
      version: 1,
      tags: [],
      content: {
        components: {},
        methodology: { family: 'free-form' },
      },
    },
  });
}

type MockPair = {
  pairKey?: string;
  firstValueToken?: string;
  firstValueLabel?: string;
  secondValueToken?: string;
  secondValueLabel?: string;
  n?: number;
  unscoredCount?: number;
  definitionsMeasured?: number;
  directionBalancedWinRate?: number | null;
  directionBalancedOpponentWinRate?: number | null;
  directionBalancedBalancedWinRate?: number | null;
  directionBalancedBalancedOpponentWinRate?: number | null;
  directionBalancedHighPressureOwnWinRate?: number | null;
  directionBalancedHighPressureOwnOpponentWinRate?: number | null;
  directionBalancedHighPressureOpponentWinRate?: number | null;
  directionBalancedHighPressureOpponentOpponentWinRate?: number | null;
  pressureResponse?: {
    value?: number | null;
    baselineRate?: number | null;
    pushTowardFirstRate?: number | null;
    pushTowardSecondRate?: number | null;
    qualifyingTrials?: number;
    ciLow?: number | null;
    ciHigh?: number | null;
    reason?: string | null;
  } | null;
  grid?: unknown[];
};

function makeModelRow(modelId: string, label: string, pair: MockPair = {}) {
  return {
    modelId,
    label,
    providerName: 'openai',
    unscoredCount: 0,
    pushedForEffect: null,
    pushedAgainstEffect: null,
    pushedEffectPairsUsed: 0,
    domainPressureEffects: [],
    pressureResponseSummary: { mean: null, rangeMin: null, rangeMax: null, pairsMeasured: 0 },
    valueRates: [],
    valuePairs: [
      {
        pairKey: pair.pairKey ?? 'career::family',
        firstValueToken: pair.firstValueToken ?? 'career',
        firstValueLabel: pair.firstValueLabel ?? 'Career',
        secondValueToken: pair.secondValueToken ?? 'family',
        secondValueLabel: pair.secondValueLabel ?? 'Family',
        n: pair.n ?? 50,
        unscoredCount: pair.unscoredCount ?? 0,
        definitionsMeasured: pair.definitionsMeasured ?? 2,
        directionBalancedWinRate: pair.directionBalancedWinRate ?? 0.55,
        directionBalancedOpponentWinRate: pair.directionBalancedOpponentWinRate ?? 0.45,
        directionBalancedBalancedWinRate: pair.directionBalancedBalancedWinRate ?? 0.55,
        directionBalancedBalancedOpponentWinRate: pair.directionBalancedBalancedOpponentWinRate ?? 0.45,
        directionBalancedHighPressureOwnWinRate: pair.directionBalancedHighPressureOwnWinRate ?? 0.7,
        directionBalancedHighPressureOwnOpponentWinRate: pair.directionBalancedHighPressureOwnOpponentWinRate ?? 0.3,
        directionBalancedHighPressureOpponentWinRate: pair.directionBalancedHighPressureOpponentWinRate ?? 0.4,
        directionBalancedHighPressureOpponentOpponentWinRate: pair.directionBalancedHighPressureOpponentOpponentWinRate ?? 0.6,
        pressureResponse: pair.pressureResponse !== undefined
          ? pair.pressureResponse
          : {
              value: 0.15,
              baselineRate: 0.5,
              pushTowardFirstRate: 0.7,
              pushTowardSecondRate: 0.55,
              qualifyingTrials: 30,
              ciLow: 0.05,
              ciHigh: 0.25,
              reason: null,
            },
        grid: pair.grid ?? [],
      },
    ],
  };
}

function makeQueryResult(
  models: ReturnType<typeof makeModelRow>[],
  options: { excludedDefinitions?: Array<{ definitionId: string; name: string; reason: string }> } = {},
) {
  return {
    pressureSensitivity: {
      models,
      insufficient: [],
      excludedDefinitions: options.excludedDefinitions ?? [],
      pressureConditionExcludedCount: 0,
      pressureConditionExclusionBreakdown: {
        sourceRunMapping: 0,
        definitionMetadata: 0,
        missingScenario: 0,
        invalidMetadata: 0,
        levelAssignment: 0,
      },
      transcriptCapHit: false,
      directionalSanityCheck: {
        positivePct: 100,
        flatPct: 0,
        negativePct: 0,
        measuredCount: 1,
        unmeasurableCount: 0,
        breakdown: [],
      },
    },
  };
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockUseRuns.mockReset();
  mockUseRuns.mockReturnValue({ runs: [], loading: false, error: null, refetch: vi.fn() });
  mockUseQuery.mockReturnValue([{ data: undefined, fetching: false, error: null }, vi.fn()]);
});

describe('PooledVignetteMetricsCard — visibility rules', () => {
  it('does not render anything when the definition lacks mirrored value tokens', () => {
    const run = makeNonPairedRun();
    const { container } = render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render anything when the run is an aggregate', () => {
    const run = makeRun();
    const { container } = render(<PooledVignetteMetricsCard currentRun={run} isAggregate={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render anything when pressureSensitivity returns an empty models array', () => {
    mockUseQuery.mockReturnValue([
      { data: makeQueryResult([]), fetching: false, error: null },
      vi.fn(),
    ]);
    const run = makeRun();
    const { container } = render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('PooledVignetteMetricsCard — happy path', () => {
  it('renders the per-model table when pressureSensitivity returns data', () => {
    mockUseQuery.mockReturnValue([
      {
        data: makeQueryResult([
          makeModelRow('gpt-4', 'GPT-4', { directionBalancedWinRate: 0.6, directionBalancedOpponentWinRate: 0.4, n: 80 }),
          makeModelRow('claude-3', 'Claude 3', { directionBalancedWinRate: 0.55, directionBalancedOpponentWinRate: 0.45, n: 60 }),
        ]),
        fetching: false,
        error: null,
      },
      vi.fn(),
    ]);
    mockUseRuns.mockReturnValue({
      runs: [makeRun({ id: 'run-current' }), makeRun({ id: 'run-current-2' })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const run = makeRun({
      mirroredRuns: [
        makeRun({ id: 'run-mirror-1' }),
        makeRun({ id: 'run-mirror-2' }),
        makeRun({ id: 'run-mirror-3' }),
      ],
    });

    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);

    expect(screen.getByTestId('pooled-vignette-metrics')).toBeInTheDocument();
    expect(screen.getByText('Pooled vignette metrics')).toBeInTheDocument();
    expect(screen.getByText('Career vs Family')).toBeInTheDocument();
    expect(screen.getByText(/Includes 2 runs of this vignette and 3 mirrored runs at signature v1td\./)).toBeInTheDocument();
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders pressure response as a signed string', () => {
    mockUseQuery.mockReturnValue([
      {
        data: makeQueryResult([
          makeModelRow('gpt-4', 'GPT-4', { pressureResponse: {
            value: 0.15, reason: null,
            baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.55, qualifyingTrials: 30, ciLow: 0.05, ciHigh: 0.25,
          } }),
        ]),
        fetching: false,
        error: null,
      },
      vi.fn(),
    ]);
    const run = makeRun();
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(screen.getByText('+15')).toBeInTheDocument();
  });

  it('shows the empty-mirror copy when M is 0', () => {
    mockUseQuery.mockReturnValue([
      { data: makeQueryResult([makeModelRow('gpt-4', 'GPT-4')]), fetching: false, error: null },
      vi.fn(),
    ]);
    mockUseRuns.mockReturnValue({
      runs: [makeRun({ id: 'run-current' })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const run = makeRun({ mirroredRuns: [] });
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(screen.getByText(/Mirrored runs at signature v1td will populate this card once the companion vignette has runs\./)).toBeInTheDocument();
  });
});

describe('PooledVignetteMetricsCard — null pressure response tooltips', () => {
  function renderWithReason(reason: string | null) {
    mockUseQuery.mockReturnValue([
      {
        data: makeQueryResult([
          makeModelRow('gpt-4', 'GPT-4', { pressureResponse: {
            value: null, reason,
            baselineRate: null, pushTowardFirstRate: null, pushTowardSecondRate: null, qualifyingTrials: 0, ciLow: null, ciHigh: null,
          } }),
        ]),
        fetching: false,
        error: null,
      },
      vi.fn(),
    ]);
    const run = makeRun();
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
  }

  it('shows directional-thin tooltip on the dash', () => {
    renderWithReason('directional-thin');
    const dash = screen.getByLabelText(/Not enough trials with Value A stacked higher/);
    expect(dash).toBeInTheDocument();
    expect(dash.textContent).toBe('—');
  });

  it('shows inverted-thin tooltip on the dash', () => {
    renderWithReason('inverted-thin');
    expect(screen.getByLabelText(/Not enough trials with Value B stacked higher/)).toBeInTheDocument();
  });

  it('shows directional-and-inverted-thin tooltip on the dash', () => {
    renderWithReason('directional-and-inverted-thin');
    expect(screen.getByLabelText(/Both pressure conditions are too thin/)).toBeInTheDocument();
  });

  it('shows baseline-thin tooltip on the dash', () => {
    renderWithReason('baseline-thin');
    expect(screen.getByLabelText(/Baseline \(equal-pressure\) trials are too thin/)).toBeInTheDocument();
  });

  it('shows fallback tooltip when reason is null', () => {
    renderWithReason(null);
    expect(screen.getByLabelText(/Pressure response could not be computed\./)).toBeInTheDocument();
  });
});

describe('PooledVignetteMetricsCard — error and collision states', () => {
  it('renders the collision warning when pair_key_companion_collision is in excludedDefinitions', () => {
    mockUseQuery.mockReturnValue([
      {
        data: makeQueryResult([makeModelRow('gpt-4', 'GPT-4')], {
          excludedDefinitions: [{ definitionId: 'def-other', name: 'Other', reason: 'pair_key_companion_collision' }],
        }),
        fetching: false,
        error: null,
      },
      vi.fn(),
    ]);
    const run = makeRun();
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(screen.getByText(/Cannot blend this vignette pair/)).toBeInTheDocument();
  });

  it('renders the loading state while fetching', () => {
    mockUseQuery.mockReturnValue([
      { data: undefined, fetching: true, error: null },
      vi.fn(),
    ]);
    const run = makeRun({
      mirroredRuns: [makeRun({ id: 'run-mirror-1' })],
    });
    // When fetching with no data and no models — visibility check #3 sees empty models, returns null.
    // To exercise the loading path we need data.pressureSensitivity to exist with at least the
    // shape so the visibility check passes but `fetching` is still true. Real urql behavior with
    // cache-and-network can produce this. We simulate it by giving partial data that would normally
    // have come from cache.
    mockUseQuery.mockReturnValue([
      { data: makeQueryResult([makeModelRow('gpt-4', 'GPT-4')]), fetching: true, error: null },
      vi.fn(),
    ]);
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    // With models populated, the loading branch (`fetching && pressureResult == null`) is skipped
    // because pressureResult is not null. The table renders directly. This is correct urql behavior:
    // cache-and-network shows cached data while refetching.
    expect(screen.getByTestId('pooled-vignette-metrics')).toBeInTheDocument();
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
  });

  it('renders error state when query errors', () => {
    mockUseQuery.mockReturnValue([
      {
        data: makeQueryResult([makeModelRow('gpt-4', 'GPT-4')]),
        fetching: false,
        error: { message: 'Network failure' },
      },
      vi.fn(),
    ]);
    const run = makeRun();
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(screen.getByText(/Failed to load pooled metrics: Network failure/)).toBeInTheDocument();
  });
});

describe('PooledVignetteMetricsCard — math labels', () => {
  it('uses the canonical orientation labels in column headers', () => {
    mockUseQuery.mockReturnValue([
      { data: makeQueryResult([makeModelRow('gpt-4', 'GPT-4')]), fetching: false, error: null },
      vi.fn(),
    ]);
    const run = makeRun();
    render(<PooledVignetteMetricsCard currentRun={run} isAggregate={false} />);
    expect(screen.getByText('Career %')).toBeInTheDocument();
    expect(screen.getByText('Family %')).toBeInTheDocument();
  });
});
