/**
 * RunDetail Page Tests
 *
 * Tests for the run detail page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RunDetail } from '../../src/pages/RunDetail';
import type { Run } from '../../src/api/operations/runs';

// Mock the hooks
vi.mock('../../src/hooks/useRun', () => ({
  useRun: vi.fn(),
}));

vi.mock('../../src/hooks/useRunMutations', () => ({
  useRunMutations: vi.fn(),
}));

import { useRun } from '../../src/hooks/useRun';
import { useRunMutations } from '../../src/hooks/useRunMutations';

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-123456',
    definitionId: 'def-1',
    experimentId: null,
    status: 'RUNNING',
    config: {
      models: ['gpt-4', 'claude-3'],
      samplePercentage: 100,
    },
    progress: { total: 100, completed: 50, failed: 0 },
    runProgress: {
      total: 100,
      completed: 50,
      failed: 0,
      percentComplete: 50,
    },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: null,
    createdAt: '2024-01-15T09:55:00Z',
    updatedAt: '2024-01-15T10:05:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 0,
    recentTasks: [],
    analysisStatus: null,
    executionMetrics: null,
    analysis: null,
    definition: {
      id: 'def-1',
      name: 'Test Definition',
      tags: [],
    },
    ...overrides,
  };
}

function renderWithRouter(runId: string = 'run-123456') {
  return render(
    <MemoryRouter initialEntries={[`/runs/${runId}`]}>
      <Routes>
        <Route path="/runs/:id" element={<RunDetail />} />
        <Route path="/runs" element={<div>Runs List</div>} />
        <Route path="/definitions/:id" element={<div>Definition Detail</div>} />
        <Route path="/analysis/:id" element={<div>Analysis Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RunDetail', () => {
  const mockPauseRun = vi.fn();
  const mockResumeRun = vi.fn();
  const mockCancelRun = vi.fn();
  const mockDeleteRun = vi.fn();
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRunMutations).mockReturnValue({
      startRun: vi.fn(),
      pauseRun: mockPauseRun,
      resumeRun: mockResumeRun,
      cancelRun: mockCancelRun,
      deleteRun: mockDeleteRun,
      loading: false,
      error: null,
    });
  });

  it('renders loading state when fetching', () => {
    vi.mocked(useRun).mockReturnValue({
      run: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Loading run...')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', () => {
    vi.mocked(useRun).mockReturnValue({
      run: null,
      loading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Failed to load run: Network error')).toBeInTheDocument();
  });

  it('renders not found state when run does not exist', () => {
    vi.mocked(useRun).mockReturnValue({
      run: null,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Run not found')).toBeInTheDocument();
  });

  it('renders run details when data is available', () => {
    const run = createMockRun();
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    // Should show run ID prefix
    expect(screen.getByText(/Run run-1234/)).toBeInTheDocument();
    // Should show definition name
    expect(screen.getByText('Test Definition')).toBeInTheDocument();
  });

  it('shows pause button for running runs', () => {
    const run = createMockRun({ status: 'RUNNING' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('shows resume button for paused runs', () => {
    const run = createMockRun({ status: 'PAUSED' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('does not show control buttons for completed runs', () => {
    const run = createMockRun({ status: 'COMPLETED' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('calls pauseRun when pause button is clicked', async () => {
    const user = userEvent.setup();
    const run = createMockRun({ status: 'RUNNING' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockPauseRun.mockResolvedValue(run);

    renderWithRouter();

    await user.click(screen.getByRole('button', { name: /pause/i }));

    expect(mockPauseRun).toHaveBeenCalledWith('run-123456');
  });

  it('calls resumeRun when resume button is clicked', async () => {
    const user = userEvent.setup();
    const run = createMockRun({ status: 'PAUSED' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockResumeRun.mockResolvedValue(run);

    renderWithRouter();

    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(mockResumeRun).toHaveBeenCalledWith('run-123456');
  });

  it('shows configuration details', () => {
    const run = createMockRun({
      config: { models: ['gpt-4', 'claude-3'], samplePercentage: 50 },
    });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Configuration')).toBeInTheDocument();
    // Models appear in both progress and config sections
    expect(screen.getAllByText('gpt-4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('claude-3').length).toBeGreaterThan(0);
    // 50% appears in both progress and sample config
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('shows progress component', () => {
    const run = createMockRun();
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows polling indicator for active runs', () => {
    const run = createMockRun({ status: 'RUNNING' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Updating every 5 seconds...')).toBeInTheDocument();
  });

  it('shows paused indicator for paused runs', () => {
    const run = createMockRun({ status: 'PAUSED' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Run is paused')).toBeInTheDocument();
  });

  it('does not show polling indicator for completed runs', () => {
    const run = createMockRun({ status: 'COMPLETED' });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.queryByText('Updating every 5 seconds...')).not.toBeInTheDocument();
    expect(screen.queryByText('Run is paused')).not.toBeInTheDocument();
  });

  it('shows results section for completed runs with transcripts', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      transcriptCount: 50,
    });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('shows results section for single transcript', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      transcriptCount: 1,
    });
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('has back button that navigates to runs list', () => {
    const run = createMockRun();
    vi.mocked(useRun).mockReturnValue({
      run,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithRouter();

    expect(screen.getByRole('button', { name: /back to runs/i })).toBeInTheDocument();
  });

  describe('Analysis Banner', () => {
    it('shows View Analysis link for completed runs with completed analysis', () => {
      const run = createMockRun({
        status: 'COMPLETED',
        analysisStatus: 'completed',
      });
      vi.mocked(useRun).mockReturnValue({
        run,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithRouter();

      expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view analysis/i })).toBeInTheDocument();
    });

    it('shows computing status for analysis being computed', () => {
      const run = createMockRun({
        status: 'COMPLETED',
        analysisStatus: 'computing',
      });
      vi.mocked(useRun).mockReturnValue({
        run,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithRouter();

      expect(screen.getByText('Analysis Computing')).toBeInTheDocument();
    });

    it('shows pending status for pending analysis', () => {
      const run = createMockRun({
        status: 'COMPLETED',
        analysisStatus: 'pending',
      });
      vi.mocked(useRun).mockReturnValue({
        run,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithRouter();

      expect(screen.getByText('Analysis Pending')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view analysis/i })).toBeInTheDocument();
    });

    it('shows failed status for failed analysis', () => {
      const run = createMockRun({
        status: 'COMPLETED',
        analysisStatus: 'failed',
      });
      vi.mocked(useRun).mockReturnValue({
        run,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithRouter();

      expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view analysis/i })).toBeInTheDocument();
    });

    it('does not show analysis banner for running runs without analysis', () => {
      const run = createMockRun({
        status: 'RUNNING',
        analysisStatus: null,
      });
      vi.mocked(useRun).mockReturnValue({
        run,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithRouter();

      expect(screen.queryByText(/analysis/i, { selector: 'h3' })).not.toBeInTheDocument();
    });

    it('shows analysis link for completed runs without analysis status', () => {
      const run = createMockRun({
        status: 'COMPLETED',
        analysisStatus: null,
      });
      vi.mocked(useRun).mockReturnValue({
        run,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithRouter();

      expect(screen.getByRole('link', { name: /view analysis/i })).toBeInTheDocument();
    });
  });
});
