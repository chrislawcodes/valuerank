import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return { ...actual, useQuery: vi.fn() };
});

import { useQuery } from 'urql';
import { PairedRunComparisonCard } from '../../../src/components/analysis/PairedRunComparisonCard';
import type { Run } from '../../../src/api/operations/runs';

const mockedUseQuery = vi.mocked(useQuery) as unknown as Mock;

function createRun(id: string, presentationOrder: 'A_first' | 'B_first', overrides: Partial<Run> = {}): Run {
  return {
    id,
    name: `Run ${id}`,
    definitionId: `definition-${id}`,
    definitionVersion: 1,
    experimentId: null,
    status: 'COMPLETED',
    runCategory: 'PRODUCTION',
    config: {
      models: ['gpt-4'],
      jobChoiceLaunchMode: 'PAIRED_BATCH',
      jobChoiceBatchGroupId: 'batch-1',
      jobChoicePresentationOrder: presentationOrder,
      definitionSnapshot: { version: 1 },
      temperature: null,
    },
    stalledModels: [],
    progress: null,
    runProgress: null,
    summarizeProgress: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 0,
    recentTasks: [],
    analysisStatus: 'completed',
    executionMetrics: null,
    analysis: { actualCost: null },
    definition: {
      id: `definition-${id}`,
      name: `Run ${id}`,
      version: 1,
      tags: [],
      content: {
        methodology: {
          family: 'job-choice',
          presentation_order: presentationOrder,
          pair_key: 'pair-1',
        },
        components: {
          value_first: { token: presentationOrder === 'A_first' ? 'achievement' : 'hedonism' },
          value_second: { token: presentationOrder === 'A_first' ? 'hedonism' : 'achievement' },
        },
        dimensions: [
          { name: 'achievement', levels: [{ score: 1, label: 'Weak' }] },
          { name: 'hedonism', levels: [{ score: 1, label: 'Weak' }] },
        ],
      },
      domain: { name: 'Domain' },
    },
    tags: [],
    ...overrides,
  } as Run;
}

function setQueryResult(overrides: {
  models?: Array<{
    modelId: string;
    label: string;
    valuePairs: Array<{
      pairKey: string;
      n: number;
      definitionsMeasured: number;
      directionBalancedWinRate: number | null;
      directionBalancedOpponentWinRate: number | null;
      pressureResponse: { value: number | null };
    }>;
  }>;
  excludedDefinitions?: Array<{ definitionId: string; name: string; reason: string }>;
  fetching?: boolean;
  error?: Error | null;
} = {}) {
  const data = overrides.fetching && overrides.models == null
    ? undefined
    : {
      pressureSensitivity: {
        models: overrides.models ?? [],
        excludedDefinitions: overrides.excludedDefinitions ?? [],
      },
    };
  mockedUseQuery.mockReturnValue([
    { data, fetching: overrides.fetching ?? false, error: overrides.error ?? null },
    vi.fn(),
  ]);
}

describe('PairedRunComparisonCard', () => {
  beforeEach(() => {
    mockedUseQuery.mockReset();
  });

  it('renders blended per-model rows from the server-aggregated query', () => {
    setQueryResult({
      models: [
        {
          modelId: 'gpt-4',
          label: 'GPT-4',
          valuePairs: [{
            pairKey: 'achievement::hedonism',
            n: 50,
            definitionsMeasured: 2,
            directionBalancedWinRate: 0.65,
            directionBalancedOpponentWinRate: 0.35,
            pressureResponse: { value: 0.2 },
          }],
        },
      ],
    });
    const currentRun = createRun('run-a', 'A_first');
    const companionRun = createRun('run-b', 'B_first');

    render(
      <MemoryRouter>
        <PairedRunComparisonCard
          currentRun={currentRun}
          currentAnalysis={null}
          companionRun={companionRun}
          companionAnalysis={null}
          analysisBasePath="/analysis"
          analysisSearch=""
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('+20 pp')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('renders the collision alert when excludedDefinitions reports a pair_key collision', () => {
    setQueryResult({
      models: [],
      excludedDefinitions: [{ definitionId: 'def-self', name: 'Self', reason: 'pair_key_companion_collision' }],
    });
    const currentRun = createRun('run-a', 'A_first');

    render(
      <MemoryRouter>
        <PairedRunComparisonCard
          currentRun={currentRun}
          currentAnalysis={null}
          companionRun={null}
          companionAnalysis={null}
          analysisBasePath="/analysis"
          analysisSearch=""
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/multiple companion vignettes share its pair_key/i)).toBeInTheDocument();
  });

  it('renders an empty-state message when no completed runs exist for the pair', () => {
    setQueryResult({ models: [] });
    const currentRun = createRun('run-a', 'A_first');

    render(
      <MemoryRouter>
        <PairedRunComparisonCard
          currentRun={currentRun}
          currentAnalysis={null}
          companionRun={null}
          companionAnalysis={null}
          analysisBasePath="/analysis"
          analysisSearch=""
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/no completed runs at this signature/i)).toBeInTheDocument();
  });

  it('renders the loading state while the query is fetching', () => {
    setQueryResult({ fetching: true });
    const currentRun = createRun('run-a', 'A_first');

    render(
      <MemoryRouter>
        <PairedRunComparisonCard
          currentRun={currentRun}
          currentAnalysis={null}
          companionRun={null}
          companionAnalysis={null}
          analysisBasePath="/analysis"
          analysisSearch=""
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading blended summary/i)).toBeInTheDocument();
  });
});
