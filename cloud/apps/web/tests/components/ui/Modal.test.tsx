import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../../../src/components/ui/Modal';

describe('Modal', () => {
  beforeEach(() => {
    // Reset body styles before each test
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Clean up any portaled content
    document.body.style.overflow = '';
  });

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={() => {}}>
          Content
        </Modal>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render title when provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
    });

    it('should render children content', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Modal body content
        </Modal>
      );
      expect(screen.getByText('Modal body content')).toBeInTheDocument();
    });

    it('should render footer when provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} footer={<button>Save</button>}>
          Content
        </Modal>
      );
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('should render close button by default', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );
      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });

    it('should not render close button when showCloseButton is false', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} showCloseButton={false}>
          Content
        </Modal>
      );
      expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          Content
        </Modal>
      );

      await user.click(screen.getByLabelText('Close modal'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('escape key handling', () => {
    it('should close on Escape key by default', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          Content
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('should not close on Escape when closeOnEscape is false', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} closeOnEscape={false}>
          Content
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('backdrop click', () => {
    it('should close on backdrop click by default', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          Content
        </Modal>
      );

      // Click the backdrop (the dark overlay)
      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) {
        await user.click(backdrop);
        expect(handleClose).toHaveBeenCalledTimes(1);
      }
    });

    it('should not close on backdrop click when closeOnBackdropClick is false', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} closeOnBackdropClick={false}>
          Content
        </Modal>
      );

      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) {
        await user.click(backdrop);
        expect(handleClose).not.toHaveBeenCalled();
      }
    });
  });

  describe('body scroll lock', () => {
    it('should prevent body scroll when open', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          Content
        </Modal>
      );

      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });

  describe('size variants', () => {
    it('should apply small size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="sm">
          Content
        </Modal>
      );
      const modal = document.querySelector('.max-w-sm');
      expect(modal).toBeInTheDocument();
    });

    it('should apply medium size (default)', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );
      const modal = document.querySelector('.max-w-md');
      expect(modal).toBeInTheDocument();
    });

    it('should apply large size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="lg">
          Content
        </Modal>
      );
      const modal = document.querySelector('.max-w-lg');
      expect(modal).toBeInTheDocument();
    });

    it('should apply extra large size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="xl">
          Content
        </Modal>
      );
      const modal = document.querySelector('.max-w-xl');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have dialog role', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have aria-modal attribute', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby when title is provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Title">
          Content
        </Modal>
      );
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'modal-title');
    });
  });

  describe('focus management', () => {
    it('should focus first focusable element when opened', async () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test">
          <button data-testid="first-button">First</button>
          <button>Second</button>
        </Modal>
      );

      // The close button is the first focusable element in header
      await waitFor(() => {
        expect(document.activeElement).toHaveAttribute('aria-label', 'Close modal');
      });
    });
  });
});
