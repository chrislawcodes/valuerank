/**
 * RerunDialog Component Tests
 *
 * Tests for the re-run dialog functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RerunDialog } from '../../../src/components/runs/RerunDialog';
import type { Run } from '../../../src/api/operations/runs';

// Mock the hooks
vi.mock('../../../src/hooks/useRunMutations', () => ({
  useRunMutations: () => ({
    startRun: vi.fn().mockResolvedValue({ run: { id: 'new-run-id' }, jobCount: 10 }),
    pauseRun: vi.fn(),
    resumeRun: vi.fn(),
    cancelRun: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../src/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({
    models: [
      { id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4', isAvailable: true },
      { id: 'claude-3', providerId: 'anthropic', displayName: 'Claude 3', isAvailable: true },
    ],
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../src/hooks/useCostEstimate', () => ({
  useCostEstimate: () => ({
    costEstimate: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../../src/hooks/useRunConditionGrid', () => ({
  useRunConditionGrid: () => ({
    grid: {
      attributeA: 'Attribute A',
      attributeB: 'Attribute B',
      rowLevels: ['1'],
      colLevels: ['1'],
      cells: [
        {
          rowLevel: '1',
          colLevel: '1',
          trialCount: 0,
          scenarioCount: 1,
          scenarioIds: ['scenario-1'],
        },
      ],
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock the useFinalTrialPlan hook (used by RunForm)
vi.mock('../../../src/hooks/useFinalTrialPlan', () => ({
  useFinalTrialPlan: vi.fn().mockReturnValue({
    plan: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    name: null,
    definitionId: 'def-1',
    definitionVersion: null,
    experimentId: null,
    status: 'COMPLETED',
    config: {
      models: ['gpt-4', 'claude-3'],
      samplePercentage: 100,
    },
    progress: { total: 100, completed: 100, failed: 0 },
    runProgress: {
      total: 100,
      completed: 100,
      failed: 0,
      percentComplete: 100,
    },
    summarizeProgress: null,
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T11:00:00Z',
    createdAt: '2024-01-15T09:55:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 100,
    recentTasks: [],
    analysisStatus: null,
    executionMetrics: null,
    analysis: null,
    definition: {
      id: 'def-1',
      name: 'Test Definition',
      version: 1,
      tags: [],
      content: null,
    },
    tags: [],
    ...overrides,
  };
}

describe('RerunDialog', () => {
  const defaultProps = {
    run: createMockRun(),
    scenarioCount: 100,
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <RerunDialog {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when isOpen is true', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByText('Re-run Evaluation')).toBeInTheDocument();
    });

    it('shows original run information', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByText('Original Run')).toBeInTheDocument();
      expect(screen.getByText(/gpt-4, claude-3/)).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });

    it('shows definition name', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByText(/Test Definition/)).toBeInTheDocument();
    });
  });

  describe('Dialog controls', () => {
    it('calls onClose when backdrop is clicked', () => {
      render(<RerunDialog {...defaultProps} />);

      // Click the backdrop (the div with bg-black/50)
      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', () => {
      render(<RerunDialog {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: /close dialog/i });
      fireEvent.click(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when Cancel button in form is clicked', () => {
      render(<RerunDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Form behavior', () => {
    it('shows Start Trial button', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /start trial/i })).toBeInTheDocument();
    });

    it('shows model selector', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByText('Target Models')).toBeInTheDocument();
    });

    it('shows trial size options', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByText('Trial Size')).toBeInTheDocument();
      expect(screen.getByText('Trial specific condition')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '100%' })).toBeInTheDocument();
    });
  });

  describe('Different run statuses', () => {
    it('displays FAILED status', () => {
      const failedRun = createMockRun({ status: 'FAILED' });
      render(<RerunDialog {...defaultProps} run={failedRun} />);

      expect(screen.getByText('FAILED')).toBeInTheDocument();
    });

    it('displays CANCELLED status', () => {
      const cancelledRun = createMockRun({ status: 'CANCELLED' });
      render(<RerunDialog {...defaultProps} run={cancelledRun} />);

      expect(screen.getByText('CANCELLED')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible close button', () => {
      render(<RerunDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /close dialog/i })).toBeInTheDocument();
    });

    it('renders dialog with proper heading structure', () => {
      render(<RerunDialog {...defaultProps} />);

      // Check that dialog has proper heading
      expect(screen.getByRole('heading', { name: /re-run evaluation/i })).toBeInTheDocument();
    });
  });
});
