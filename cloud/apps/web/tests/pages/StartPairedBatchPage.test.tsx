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
  }: {
    copyMode?: string;
    onSubmit: (input: Record<string, unknown>) => Promise<void>;
    onCancel?: () => void;
  }) => (
    <div>
      <div>RunForm Stub: {copyMode}</div>
      <button
        type="button"
        onClick={() =>
          void onSubmit({
            definitionId: 'def-1',
            models: ['gpt-4'],
            samplePercentage: 100,
            samplesPerScenario: 1,
            finalTrial: false,
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
    },
    resolvedContent: {
      schema_version: 1,
      template: 'Test template',
      dimensions: [],
      methodology: {
        family: 'job-choice',
      },
    },
    scenarioCount: 8,
    ...overrides,
  };
}

function renderPage(initialEntry = '/definitions/def-1/start-paired-batch') {
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

  it('renders the paired batch copy and passes the paired-batch form mode', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Start Paired Batch' })).toBeInTheDocument();
    expect(
      screen.getByText('Configure and start a paired batch for "Test Definition"')
    ).toBeInTheDocument();
    expect(screen.getByText('RunForm Stub: paired-batch')).toBeInTheDocument();
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
    expect(screen.getByText('RunForm Stub: paired-batch')).toBeInTheDocument();
  });

  it('returns to the vignette on cancel', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cancel Launch' }));

    expect(mockNavigate).toHaveBeenCalledWith('/definitions/def-1');
  });
});
