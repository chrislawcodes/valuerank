/**
 * SummarizationControls Component Tests [T030]
 *
 * Tests for the summarization control buttons (cancel/restart/force restart).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  SummarizationControls,
  type SummarizationControlsProps,
} from '../../../src/components/runs/SummarizationControls';
import type { RunStatus, RunProgress } from '../../../src/api/operations/runs';

describe('SummarizationControls', () => {
  const mockProgress: RunProgress = {
    total: 10,
    completed: 5,
    failed: 0,
    percentComplete: 50,
  };

  const defaultProps: SummarizationControlsProps = {
    runId: 'run-123',
    status: 'SUMMARIZING' as RunStatus,
    summarizeProgress: mockProgress,
    transcriptCount: 10,
    onCancelSummarization: vi.fn().mockResolvedValue({ cancelledCount: 3 }),
    onRestartSummarization: vi.fn().mockResolvedValue({ queuedCount: 5 }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  describe('Button visibility based on status', () => {
    it('shows cancel button when status is SUMMARIZING', () => {
      render(<SummarizationControls {...defaultProps} status="SUMMARIZING" />);

      expect(
        screen.getByRole('button', { name: /cancel summarization/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/restart summarization/i)
      ).not.toBeInTheDocument();
    });

    it('shows restart buttons when status is COMPLETED with unsummarized transcripts', () => {
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          summarizeProgress={{ total: 10, completed: 5, failed: 0, percentComplete: 50 }}
        />
      );

      expect(
        screen.getByLabelText(/restart summarization/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /re-summarize all/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /cancel summarization/i })
      ).not.toBeInTheDocument();
    });

    it('shows only re-summarize all button when all transcripts are summarized', () => {
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          summarizeProgress={{ total: 10, completed: 10, failed: 0, percentComplete: 100 }}
        />
      );

      expect(
        screen.queryByLabelText(/restart summarization/i)
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /re-summarize all/i })
      ).toBeInTheDocument();
    });

    it('shows restart buttons when status is FAILED', () => {
      render(
        <SummarizationControls
          {...defaultProps}
          status="FAILED"
          summarizeProgress={{ total: 10, completed: 3, failed: 2, percentComplete: 30 }}
        />
      );

      expect(
        screen.getByLabelText(/restart summarization/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /re-summarize all/i })
      ).toBeInTheDocument();
    });

    it('shows restart buttons when status is CANCELLED', () => {
      render(
        <SummarizationControls
          {...defaultProps}
          status="CANCELLED"
          summarizeProgress={{ total: 10, completed: 2, failed: 0, percentComplete: 20 }}
        />
      );

      expect(
        screen.getByLabelText(/restart summarization/i)
      ).toBeInTheDocument();
    });

    it('renders nothing when status is RUNNING', () => {
      const { container } = render(
        <SummarizationControls {...defaultProps} status="RUNNING" />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when status is PENDING', () => {
      const { container } = render(
        <SummarizationControls {...defaultProps} status="PENDING" />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when status is PAUSED', () => {
      const { container } = render(
        <SummarizationControls {...defaultProps} status="PAUSED" />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Button interactions', () => {
    it('calls onCancelSummarization when cancel button is clicked and confirmed', async () => {
      const onCancelSummarization = vi.fn().mockResolvedValue({ cancelledCount: 3 });
      render(
        <SummarizationControls
          {...defaultProps}
          onCancelSummarization={onCancelSummarization}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /cancel summarization/i })
      );

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(
          'Cancel summarization? Completed summaries will be preserved.'
        );
        expect(onCancelSummarization).toHaveBeenCalledWith('run-123');
      });
    });

    it('does not call onCancelSummarization when cancel is not confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const onCancelSummarization = vi.fn().mockResolvedValue({ cancelledCount: 0 });
      render(
        <SummarizationControls
          {...defaultProps}
          onCancelSummarization={onCancelSummarization}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /cancel summarization/i })
      );

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
      });
      expect(onCancelSummarization).not.toHaveBeenCalled();
    });

    it('calls onRestartSummarization without force when restart button is clicked', async () => {
      const onRestartSummarization = vi.fn().mockResolvedValue({ queuedCount: 5 });
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          onRestartSummarization={onRestartSummarization}
        />
      );

      fireEvent.click(screen.getByLabelText(/restart summarization/i));

      await waitFor(() => {
        expect(onRestartSummarization).toHaveBeenCalledWith('run-123', false);
      });
    });

    it('calls onRestartSummarization with force=true when re-summarize all is clicked', async () => {
      const onRestartSummarization = vi.fn().mockResolvedValue({ queuedCount: 10 });
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          onRestartSummarization={onRestartSummarization}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /re-summarize all/i }));

      await waitFor(() => {
        expect(onRestartSummarization).toHaveBeenCalledWith('run-123', true);
      });
    });
  });

  describe('Disabled state', () => {
    it('disables all buttons when disabled prop is true', () => {
      render(<SummarizationControls {...defaultProps} disabled={true} />);

      expect(
        screen.getByRole('button', { name: /cancel summarization/i })
      ).toBeDisabled();
    });

    it('disables buttons during loading', async () => {
      const onCancelSummarization = vi
        .fn()
        .mockImplementation(() => new Promise(() => {})); // Never resolves
      render(
        <SummarizationControls
          {...defaultProps}
          onCancelSummarization={onCancelSummarization}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /cancel summarization/i })
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /cancel summarization/i })
        ).toBeDisabled();
      });
    });
  });

  describe('Loading states', () => {
    it('shows loading spinner during cancel operation', async () => {
      const onCancelSummarization = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(
        <SummarizationControls
          {...defaultProps}
          onCancelSummarization={onCancelSummarization}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /cancel summarization/i })
      );

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /cancel summarization/i });
        expect(button.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });

    it('shows loading spinner during restart operation', async () => {
      const onRestartSummarization = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          onRestartSummarization={onRestartSummarization}
        />
      );

      fireEvent.click(screen.getByLabelText(/restart summarization/i));

      await waitFor(() => {
        const button = screen.getByLabelText(/restart summarization/i);
        expect(button.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });
  });

  describe('Callbacks', () => {
    it('calls onSuccess callback when cancel succeeds', async () => {
      const onSuccess = vi.fn();
      const onCancelSummarization = vi.fn().mockResolvedValue({ cancelledCount: 3 });
      render(
        <SummarizationControls
          {...defaultProps}
          onCancelSummarization={onCancelSummarization}
          onSuccess={onSuccess}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /cancel summarization/i })
      );

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          'Cancelled 3 pending summarization jobs'
        );
      });
    });

    it('calls onError callback when cancel fails', async () => {
      const onError = vi.fn();
      const onCancelSummarization = vi
        .fn()
        .mockRejectedValue(new Error('Test error'));
      render(
        <SummarizationControls
          {...defaultProps}
          onCancelSummarization={onCancelSummarization}
          onError={onError}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /cancel summarization/i })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Test error');
      });
    });

    it('calls onSuccess callback when restart succeeds', async () => {
      const onSuccess = vi.fn();
      const onRestartSummarization = vi.fn().mockResolvedValue({ queuedCount: 5 });
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          onRestartSummarization={onRestartSummarization}
          onSuccess={onSuccess}
        />
      );

      fireEvent.click(screen.getByLabelText(/restart summarization/i));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          'Queued 5 transcripts for summarization'
        );
      });
    });
  });

  describe('Unsummarized count display', () => {
    it('displays correct unsummarized count in restart button', () => {
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          transcriptCount={10}
          summarizeProgress={{ total: 10, completed: 3, failed: 0, percentComplete: 30 }}
        />
      );

      // Should show 7 unsummarized (10 - 3)
      const restartButton = screen.getByLabelText(/restart summarization/i);
      expect(restartButton).toHaveTextContent('(7)');
    });

    it('calculates unsummarized count when no progress exists', () => {
      render(
        <SummarizationControls
          {...defaultProps}
          status="COMPLETED"
          transcriptCount={5}
          summarizeProgress={null}
        />
      );

      // Should show all 5 as unsummarized
      const restartButton = screen.getByLabelText(/restart summarization/i);
      expect(restartButton).toHaveTextContent('(5)');
    });
  });

  describe('Accessibility', () => {
    it('has accessible label for cancel button', () => {
      render(<SummarizationControls {...defaultProps} />);

      expect(
        screen.getByLabelText(/cancel summarization/i)
      ).toBeInTheDocument();
    });

    it('has accessible label for restart button', () => {
      render(<SummarizationControls {...defaultProps} status="COMPLETED" />);

      expect(
        screen.getByLabelText(/restart summarization/i)
      ).toBeInTheDocument();
    });

    it('has accessible label for force restart button', () => {
      render(<SummarizationControls {...defaultProps} status="COMPLETED" />);

      expect(
        screen.getByLabelText(/re-summarize all/i)
      ).toBeInTheDocument();
    });
  });
});
