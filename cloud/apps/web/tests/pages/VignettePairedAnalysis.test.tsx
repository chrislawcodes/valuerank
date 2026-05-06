/**
 * Tests for the vignette-paired analysis page.
 *
 * The page composes four queries (`useDefinition`, `definitions`, `runs` for self,
 * `runs` for companion, `pressureSensitivity`). These tests mock all of them at
 * the urql / hook level and verify the page's rendering branches.
 *
 * Companion to docs/workflow/feature-runs/vignette-paired-analysis/spec.md SC-002.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock('../../src/hooks/useDefinition', () => ({
  useDefinition: vi.fn(),
}));

vi.mock('../../src/components/models/PressureSensitivityDetail', () => ({
  PressureSensitivityDetail: ({ model }: { model: { modelId: string; label?: string } }) => (
    <div data-testid="pressure-detail">{model.label ?? model.modelId}</div>
  ),
}));

vi.mock('../../src/components/models/PressureSensitivityLimitations', () => ({
  PressureSensitivityLimitations: () => <div data-testid="limitations-panel">Limitations</div>,
}));

vi.mock('../../src/components/models/PressureSensitivitySanityCheck', () => ({
  PressureSensitivitySanityCheck: () => <div data-testid="sanity-check">Sanity Check</div>,
}));

import { useQuery } from 'urql';
import { useDefinition } from '../../src/hooks/useDefinition';
import { VignettePairedAnalysis } from '../../src/pages/VignettePairedAnalysis';
import { DEFINITIONS_QUERY } from '../../src/api/operations/definitions';
import { RUNS_QUERY } from '../../src/api/operations/runs';
import { PRESSURE_SENSITIVITY_QUERY } from '../../src/api/operations/pressureSensitivity';

const mockedUseQuery = vi.mocked(useQuery) as unknown as Mock;
const mockedUseDefinition = vi.mocked(useDefinition);

const SELF_DEFINITION = {
  id: 'def-self',
  name: 'Achievement -> Hedonism',
  domainId: 'domain-1',
  content: {
    methodology: { family: 'job-choice', pair_key: 'achievement-hedonism' },
    components: {
      value_first: { token: 'achievement' },
      value_second: { token: 'hedonism' },
    },
    dimensions: [{ name: 'achievement' }, { name: 'hedonism' }],
  },
};

function buildPressureResult(overrides: Partial<{
  models: Array<{ modelId: string; label: string }>;
  excludedDefinitions: Array<{ definitionId: string; name: string; reason: string }>;
}> = {}) {
  return {
    pressureSensitivity: {
      models: overrides.models ?? [{ modelId: 'model-a', label: 'Model A' }],
      insufficient: [],
      excludedDefinitions: overrides.excludedDefinitions ?? [],
      pressureConditionExcludedCount: 0,
      transcriptCapHit: false,
      directionalSanityCheck: {
        positivePct: 0,
        flatPct: 0,
        negativePct: 0,
        measuredCount: 0,
        unmeasurableCount: 0,
        breakdown: [],
      },
    },
  };
}

function buildEmptyResult() {
  return {
    pressureSensitivity: {
      models: [],
      insufficient: [],
      excludedDefinitions: [],
      pressureConditionExcludedCount: 0,
      transcriptCapHit: false,
      directionalSanityCheck: {
        positivePct: 0,
        flatPct: 0,
        negativePct: 0,
        measuredCount: 0,
        unmeasurableCount: 0,
        breakdown: [],
      },
    },
  };
}

type QueryStateFn = (args: { query: unknown }) => unknown[];

function setupQueries(stateFn: QueryStateFn) {
  mockedUseQuery.mockImplementation((args: { query: unknown }) => stateFn(args));
}

function defaultStateFn(overrides: {
  pressure?: unknown;
  pressureFetching?: boolean;
  pressureError?: unknown;
} = {}): QueryStateFn {
  return ({ query }) => {
    if (query === PRESSURE_SENSITIVITY_QUERY) {
      return [
        {
          data: overrides.pressure ?? buildPressureResult(),
          fetching: overrides.pressureFetching ?? false,
          error: overrides.pressureError ?? null,
        },
        vi.fn(),
      ];
    }
    if (query === DEFINITIONS_QUERY) {
      return [{ data: { definitions: [] }, fetching: false, error: null }, vi.fn()];
    }
    if (query === RUNS_QUERY) {
      return [{ data: { runs: [{ id: 'run-1', status: 'COMPLETED', completedAt: '2026-04-01', createdAt: '2026-04-01', config: { definitionSnapshot: { version: 1 }, temperature: null } }] }, fetching: false, error: null }, vi.fn()];
    }
    return [{ data: undefined, fetching: false, error: null }, vi.fn()];
  };
}

function renderPage(initialEntry = '/vignette/def-self/paired?signature=v1td') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/vignette/:definitionId/paired" element={<VignettePairedAnalysis />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VignettePairedAnalysis', () => {
  beforeEach(() => {
    mockedUseQuery.mockReset();
    mockedUseDefinition.mockReset();
  });

  it('renders the loading state while the definition query is in flight', () => {
    mockedUseDefinition.mockReturnValue({ definition: null, loading: true, error: null });
    setupQueries(defaultStateFn());

    renderPage();

    expect(screen.getByText(/loading paired analysis/i)).toBeInTheDocument();
  });

  it('renders the error state when a query fails', () => {
    mockedUseDefinition.mockReturnValue({ definition: null, loading: false, error: new Error('boom') });
    setupQueries(defaultStateFn());

    renderPage();

    expect(screen.getByText(/failed to load paired analysis/i)).toBeInTheDocument();
  });

  it('renders the not-paired banner when the vignette has no pair_key methodology', () => {
    mockedUseDefinition.mockReturnValue({
      definition: {
        ...SELF_DEFINITION,
        content: { methodology: { family: 'survey' }, components: {}, dimensions: [] },
      },
      loading: false,
      error: null,
    });
    setupQueries(defaultStateFn());

    renderPage();

    expect(screen.getByText(/not part of a paired analysis/i)).toBeInTheDocument();
  });

  it('renders the empty banner when no completed runs are scored for the pair', () => {
    mockedUseDefinition.mockReturnValue({ definition: SELF_DEFINITION, loading: false, error: null });
    setupQueries(defaultStateFn({ pressure: buildEmptyResult() }));

    renderPage();

    expect(screen.getByText(/no completed runs yet for this vignette pair/i)).toBeInTheDocument();
  });

  it('renders the collision alert when excludedDefinitions reports pair_key_companion_collision', () => {
    mockedUseDefinition.mockReturnValue({ definition: SELF_DEFINITION, loading: false, error: null });
    setupQueries(defaultStateFn({
      pressure: buildPressureResult({
        models: [],
        excludedDefinitions: [{ definitionId: 'def-self', name: 'Self', reason: 'pair_key_companion_collision' }],
      }),
    }));

    renderPage();

    expect(screen.getByText(/multiple companion vignettes share its pair_key/i)).toBeInTheDocument();
    // collision suppresses the model list and the empty-data banner
    expect(screen.queryByTestId('pressure-detail')).not.toBeInTheDocument();
  });

  it('renders the per-model details on the success path', () => {
    mockedUseDefinition.mockReturnValue({ definition: SELF_DEFINITION, loading: false, error: null });
    setupQueries(defaultStateFn());

    renderPage();

    expect(screen.getByTestId('pressure-detail')).toHaveTextContent('Model A');
    expect(screen.getByText(/paired analysis/i)).toBeInTheDocument();
  });
});
