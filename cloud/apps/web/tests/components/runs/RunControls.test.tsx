/**
 * RunControls Component Tests
 *
 * Tests for the run control buttons (pause/resume/cancel).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunControls, type RunControlsProps } from '../../../src/components/runs/RunControls';
import type { RunStatus } from '../../../src/api/operations/runs';

describe('RunControls', () => {
  const defaultProps: RunControlsProps = {
    runId: 'run-123',
    status: 'RUNNING' as RunStatus,
    onPause: vi.fn(),
    onResume: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  describe('Button visibility based on status', () => {
    it('shows pause and cancel buttons when status is RUNNING', () => {
      render(<RunControls {...defaultProps} status="RUNNING" />);

      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    });

    it('shows pause and cancel buttons when status is PENDING', () => {
      render(<RunControls {...defaultProps} status="PENDING" />);

      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    });

    it('shows pause and cancel buttons when status is SUMMARIZING', () => {
      render(<RunControls {...defaultProps} status="SUMMARIZING" />);

      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    });

    it('shows resume and cancel buttons when status is PAUSED', () => {
      render(<RunControls {...defaultProps} status="PAUSED" />);

      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    });

    it('renders nothing when status is COMPLETED', () => {
      const { container } = render(<RunControls {...defaultProps} status="COMPLETED" />);

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when status is FAILED', () => {
      const { container } = render(<RunControls {...defaultProps} status="FAILED" />);

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when status is CANCELLED', () => {
      const { container } = render(<RunControls {...defaultProps} status="CANCELLED" />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Button interactions', () => {
    it('calls onPause when pause button is clicked', async () => {
      const onPause = vi.fn().mockResolvedValue(undefined);
      render(<RunControls {...defaultProps} onPause={onPause} />);

      fireEvent.click(screen.getByRole('button', { name: /pause/i }));

      await waitFor(() => {
        expect(onPause).toHaveBeenCalledWith('run-123');
      });
    });

    it('calls onResume when resume button is clicked', async () => {
      const onResume = vi.fn().mockResolvedValue(undefined);
      render(<RunControls {...defaultProps} status="PAUSED" onResume={onResume} />);

      fireEvent.click(screen.getByRole('button', { name: /resume/i }));

      await waitFor(() => {
        expect(onResume).toHaveBeenCalledWith('run-123');
      });
    });

    it('calls onCancel when cancel button is clicked and confirmed', async () => {
      const onCancel = vi.fn().mockResolvedValue(undefined);
      render(<RunControls {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(
          'Are you sure you want to cancel this run? This cannot be undone.'
        );
        expect(onCancel).toHaveBeenCalledWith('run-123');
      });
    });

    it('does not call onCancel when cancel is not confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const onCancel = vi.fn().mockResolvedValue(undefined);
      render(<RunControls {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
      });
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Disabled state', () => {
    it('disables all buttons when disabled prop is true', () => {
      render(<RunControls {...defaultProps} disabled={true} />);

      expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('disables buttons during loading', async () => {
      const onPause = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<RunControls {...defaultProps} onPause={onPause} />);

      fireEvent.click(screen.getByRole('button', { name: /pause/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      });
    });
  });

  describe('Loading states', () => {
    it('shows loading spinner during pause operation', async () => {
      const onPause = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(<RunControls {...defaultProps} onPause={onPause} />);

      fireEvent.click(screen.getByRole('button', { name: /pause/i }));

      // The button should have a loading spinner (Loader2 icon has animate-spin class)
      await waitFor(() => {
        const pauseButton = screen.getByRole('button', { name: /pause/i });
        expect(pauseButton.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });

    it('shows loading spinner during resume operation', async () => {
      const onResume = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(<RunControls {...defaultProps} status="PAUSED" onResume={onResume} />);

      fireEvent.click(screen.getByRole('button', { name: /resume/i }));

      await waitFor(() => {
        const resumeButton = screen.getByRole('button', { name: /resume/i });
        expect(resumeButton.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });

    it('shows loading spinner during cancel operation', async () => {
      const onCancel = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(<RunControls {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        expect(cancelButton.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible labels for pause button', () => {
      render(<RunControls {...defaultProps} />);

      expect(screen.getByRole('button', { name: /pause run/i })).toBeInTheDocument();
    });

    it('has accessible labels for resume button', () => {
      render(<RunControls {...defaultProps} status="PAUSED" />);

      expect(screen.getByRole('button', { name: /resume run/i })).toBeInTheDocument();
    });

    it('has accessible labels for cancel button', () => {
      render(<RunControls {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel run/i })).toBeInTheDocument();
    });
  });

  describe('Size prop', () => {
    it('passes size to buttons', () => {
      render(<RunControls {...defaultProps} size="sm" />);

      // Buttons should be rendered (we test that they exist, not CSS class details)
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });
});
