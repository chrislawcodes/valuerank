import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisPanelHarness, createMockAnalysis } from './analysisPanel.fixtures';
import { useAnalysis } from '../../../src/hooks/useAnalysis';

vi.mock('../../../src/hooks/useAnalysis', () => ({
  useAnalysis: vi.fn(),
}));

const mockUseAnalysis = vi.mocked(useAnalysis);

describe('AnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading analysis...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: new Error('Failed to load'),
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Failed to load analysis/)).toBeInTheDocument();
  });

  it('renders pending state when analysis is pending', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" analysisStatus="pending" />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis Pending')).toBeInTheDocument();
  });

  it('renders computing state when analysis is computing', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" analysisStatus="computing" />
      </MemoryRouter>
    );

    expect(screen.getByText('Computing Analysis...')).toBeInTheDocument();
  });

  it('renders empty state when no analysis available', () => {
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis Not Available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze Trial/i })).toBeInTheDocument();
  });

  it('calls recompute when Run Analysis button is clicked', () => {
    const recompute = vi.fn().mockResolvedValue(undefined);
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute,
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Analyze Trial/i }));
    expect(recompute).toHaveBeenCalled();
  });

  it('shows computed time in details instead of the header', async () => {
    const analysis = createMockAnalysis();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness runId="run-1" />
      </MemoryRouter>
    );

    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.queryByText(/Computed/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^details$/i }));
    expect(screen.getByText(/Computed/)).toBeInTheDocument();
  });

  it('renders the mode toggle in the header and hides removed export actions', async () => {
    const analysis = createMockAnalysis();
    const onModeChange = vi.fn();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness
          runId="run-1"
          analysisMode="single"
          onAnalysisModeChange={onModeChange}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /single vignette/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /paired vignettes/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /csv feed/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /paired vignettes/i }));
    expect(onModeChange).toHaveBeenCalledWith('paired');

    await userEvent.click(screen.getByRole('button', { name: /single vignette/i }));
    expect(onModeChange).toHaveBeenNthCalledWith(2, 'single');
  });

  it('shows a single-vignette selector when a paired companion run is available', async () => {
    const analysis = createMockAnalysis();
    const onSingleVignetteChange = vi.fn();
    mockUseAnalysis.mockReturnValue({
      analysis,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });

    render(
      <MemoryRouter>
        <AnalysisPanelHarness
          runId="run-1"
          analysisMode="single"
          onAnalysisModeChange={vi.fn()}
          onSingleVignetteChange={onSingleVignetteChange}
          currentRun={{
            id: 'run-1',
            definition: { name: 'Achievement -> Benevolence' },
          } as any}
          companionRun={{
            id: 'run-2',
            definition: { name: 'Benevolence -> Achievement' },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Vignette')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Vignette'), 'run-2');
    expect(onSingleVignetteChange).toHaveBeenCalledWith('run-2');
  });
});
