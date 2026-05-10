import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StartPairedBatchPage } from '../../src/pages/DefinitionDetail/StartPairedBatchPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockUseDefinition = vi.fn();
const mockUseExpandedScenarios = vi.fn();
const mockUseRunMutations = vi.fn();

vi.mock('../../src/hooks/useDefinition', () => ({
  useDefinition: () => mockUseDefinition(),
}));

vi.mock('../../src/hooks/useExpandedScenarios', () => ({
  useExpandedScenarios: () => mockUseExpandedScenarios(),
}));

vi.mock('../../src/hooks/useRunMutations', () => ({
  useRunMutations: () => mockUseRunMutations(),
}));

vi.mock('../../src/components/runs/RunForm', () => ({
  RunForm: ({
    copyMode,
    onSubmit,
    onCancel,
    defaultLaunchMode,
    launchModeLocked,
    onStateChange,
  }: {
    copyMode?: string;
    onSubmit: (input: Record<string, unknown>) => Promise<void>;
    onCancel?: () => void;
    defaultLaunchMode?: string;
    launchModeLocked?: boolean;
    onStateChange?: (state: {
      formState: {
        selectedModels: string[];
        samplePercentage: number;
        samplesPerScenario: number;
        temperatureInput: string;
        launchMode: string;
      };
      isSpecificConditionTrial: boolean;
      selectedConditionScenarioIds: string[];
      estimatedScenarios: number | null;
    }) => void;
  }) => (
    <div data-testid="run-form-stub">
      <div>RunForm Stub: {copyMode} / {defaultLaunchMode} / {launchModeLocked ? 'locked' : 'open'}</div>
      <button
        type="button"
        onClick={() =>
          onStateChange?.({
            formState: {
              selectedModels: ['gpt-4'],
              samplePercentage: 100,
              samplesPerScenario: 1,
              temperatureInput: '',
              launchMode: defaultLaunchMode ?? 'PAIRED_BATCH',
            },
            isSpecificConditionTrial: false,
            selectedConditionScenarioIds: [],
            estimatedScenarios: 8,
          })
        }
      >
        Emit Snapshot
      </button>
      <button
        type="button"
        onClick={() =>
          onStateChange?.({
            formState: {
              selectedModels: ['gpt-4', 'claude-3'],
              samplePercentage: 100,
              samplesPerScenario: 1,
              temperatureInput: '',
              launchMode: defaultLaunchMode ?? 'PAIRED_BATCH',
            },
            isSpecificConditionTrial: false,
            selectedConditionScenarioIds: [],
            estimatedScenarios: 8,
          })
        }
      >
        Emit Snapshot 2
      </button>
      <button
        type="button"
        onClick={() =>
          void onSubmit({
            definitionId: 'def-1',
            models: ['gpt-4'],
            samplePercentage: 100,
            samplesPerScenario: 1,
          }).catch(() => undefined)
        }
      >
        Start Launch
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel Launch
        </button>
      )}
    </div>
  ),
}));

function createDefinition(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'def-1',
    name: 'Test Definition',
    domain: { name: 'Test Domain' },
    content: {
      schema_version: 1,
      template: 'Test template',
      dimensions: [],
      methodology: {
        family: 'job-choice',
      },
      components: {
        value_first: { token: 'achievement', body: '' },
        value_second: { token: 'power_dominance', body: '' },
      },
    },
    resolvedContent: {
      schema_version: 1,
      template: 'Test template',
      dimensions: [],
      methodology: {
        family: 'job-choice',
      },
      components: {
        value_first: { token: 'achievement', body: '' },
        value_second: { token: 'power_dominance', body: '' },
      },
    },
    scenarioCount: 8,
    ...overrides,
  };
}

function renderPage(
  initialEntry:
    | string
    | { pathname: string; state?: { returnLabel?: string; returnTo?: string; matchPairCounts?: Record<string, unknown> } } = '/definitions/def-1/start-paired-batch'
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/definitions/:id/start-paired-batch" element={<StartPairedBatchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('StartPairedBatchPage', () => {
  const mockStartRun = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDefinition.mockReturnValue({
      definition: createDefinition(),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseExpandedScenarios.mockReturnValue({
      totalCount: 8,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseRunMutations.mockReturnValue({
      startRun: mockStartRun,
      loading: false,
      error: null,
    });
    mockStartRun.mockResolvedValue({
      run: { id: 'run-1' },
      jobCount: 1,
    });
  });

  const matchPairCounts = {
    pairKey: 'achievement::power_dominance',
    valueA: 'Achievement',
    valueB: 'Power_Dominance',
    contributingDefinitionIds: ['def-a', 'def-b'],
    launchDefinitionId: 'def-1',
    laggingDirection: 'Achievement',
    before: {
      directionA: { name: 'Achievement', batches: 2, conditions: 8 },
      directionB: { name: 'Power_Dominance', batches: 2, conditions: 10 },
    },
  };

  it('renders the paired batch copy and passes the paired-batch form mode', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Start Paired Batch' })).toBeInTheDocument();
    expect(
      screen.getByText('Configure and start a paired batch for "Test Definition"')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('run-form-stub')
    ).toHaveTextContent('RunForm Stub: paired-batch / PAIRED_BATCH / open');
  });

  it('returns to the source page when launched from coverage', async () => {
    const user = userEvent.setup();

    renderPage({
      pathname: '/definitions/def-1/start-paired-batch',
      state: {
        returnLabel: 'Back to Value coverage',
        returnTo: '/domains?domainId=domain-a',
      },
    });

    expect(screen.getByRole('button', { name: 'Back to Value coverage' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Value coverage' }));

    expect(mockNavigate).toHaveBeenCalledWith('/domains?domainId=domain-a');
  });

  it('shows an invalid vignette state for the bad route', () => {
    renderPage('/definitions/new/start-paired-batch');

    expect(screen.getByText('Invalid vignette: This route needs a valid vignette ID to start a paired batch.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Vignettes' })).toBeInTheDocument();
  });

  it('navigates to the run detail page after a successful launch', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Start Launch' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/runs/run-1');
    });
  });

  it('keeps the form visible and shows an error when launch fails', async () => {
    const user = userEvent.setup();
    mockStartRun.mockRejectedValueOnce(new Error('Launch failed'));

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Start Launch' }));

    await waitFor(() => {
      expect(screen.getByText('Launch failed')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('run-form-stub')
    ).toHaveTextContent('RunForm Stub: paired-batch / PAIRED_BATCH / open');
  });

  it('returns to the vignette on cancel', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cancel Launch' }));

    expect(mockNavigate).toHaveBeenCalledWith('/definitions/def-1');
  });

  it('renders the match pair counts summary card when route state is present', async () => {
    const user = userEvent.setup();

    renderPage({
      pathname: '/definitions/def-1/start-paired-batch',
      state: {
        returnLabel: 'Back to Value coverage',
        returnTo: '/domains?domainId=domain-a',
        matchPairCounts,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Emit Snapshot' }));

    expect(screen.getByText('Match Pair Counts')).toBeInTheDocument();
    expect(screen.getByText('Achievement vs Power')).toBeInTheDocument();
    const achievementRow = screen.getByText('Achievement-first').closest('tr');
    expect(achievementRow).not.toBeNull();
    expect(achievementRow).toHaveTextContent('2 → 3');
    expect(achievementRow).toHaveTextContent('8 → 16');
    expect(screen.getByText('Adds 1 batch and 8 trials.')).toBeInTheDocument();
  });

  it('updates the preview card when the form snapshot changes', async () => {
    const user = userEvent.setup();

    renderPage({
      pathname: '/definitions/def-1/start-paired-batch',
      state: {
        matchPairCounts,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Emit Snapshot' }));
    const achievementRow = screen.getByText('Achievement-first').closest('tr');
    expect(achievementRow).not.toBeNull();
    expect(achievementRow).toHaveTextContent('8 → 16');

    await user.click(screen.getByRole('button', { name: 'Emit Snapshot 2' }));
    expect(achievementRow).toHaveTextContent('8 → 24');
  });

  it('submits top-up launches with the lagging direction pinned', async () => {
    const user = userEvent.setup();

    renderPage({
      pathname: '/definitions/def-1/start-paired-batch',
      state: {
        matchPairCounts,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Emit Snapshot' }));
    await user.click(screen.getByRole('button', { name: 'Start Launch' }));

    await waitFor(() => {
      expect(mockStartRun).toHaveBeenCalled();
    });

    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({
      launchMode: 'PAIRED_BATCH_TOPUP',
      topUpDirection: 'Achievement',
    }));
  });
});
