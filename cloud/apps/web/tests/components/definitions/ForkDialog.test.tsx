import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForkDialog } from '../../../src/components/definitions/ForkDialog';

describe('ForkDialog', () => {
  it('should render dialog with original name in description', () => {
    render(
      <ForkDialog
        originalName="Test Definition"
        onFork={vi.fn()}
        onClose={vi.fn()}
        isForking={false}
      />
    );

    expect(screen.getByText('Fork Vignette')).toBeInTheDocument();
    expect(screen.getByText(/test definition/i)).toBeInTheDocument();
  });

  it('should pre-fill name input with "(Fork)" suffix', () => {
    render(
      <ForkDialog
        originalName="Original Name"
        onFork={vi.fn()}
        onClose={vi.fn()}
        isForking={false}
      />
    );

    expect(screen.getByDisplayValue('Original Name (Fork)')).toBeInTheDocument();
  });

  it('should call onClose when cancel button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ForkDialog
        originalName="Test"
        onFork={vi.fn()}
        onClose={onClose}
        isForking={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onClose when X button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ForkDialog
        originalName="Test"
        onFork={vi.fn()}
        onClose={onClose}
        isForking={false}
      />
    );

    // Find the X button (it's the one with just the X icon)
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons.find((btn) => btn.querySelector('.lucide-x'));
    if (closeButton) {
      await user.click(closeButton);
    }
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onFork with name when Create Fork clicked', async () => {
    const user = userEvent.setup();
    const onFork = vi.fn().mockResolvedValue(undefined);

    render(
      <ForkDialog
        originalName="Test"
        onFork={onFork}
        onClose={vi.fn()}
        isForking={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /create fork/i }));

    await waitFor(() => {
      expect(onFork).toHaveBeenCalledWith('Test (Fork)');
    });
  });

  it('should allow editing the fork name', async () => {
    const user = userEvent.setup();
    const onFork = vi.fn().mockResolvedValue(undefined);

    render(
      <ForkDialog
        originalName="Test"
        onFork={onFork}
        onClose={vi.fn()}
        isForking={false}
      />
    );

    const input = screen.getByDisplayValue('Test (Fork)');
    await user.clear(input);
    await user.type(input, 'My Custom Fork');

    await user.click(screen.getByRole('button', { name: /create fork/i }));

    await waitFor(() => {
      expect(onFork).toHaveBeenCalledWith('My Custom Fork');
    });
  });

  it('should show error when name is empty', async () => {
    const user = userEvent.setup();
    const onFork = vi.fn();

    render(
      <ForkDialog
        originalName="Test"
        onFork={onFork}
        onClose={vi.fn()}
        isForking={false}
      />
    );

    const input = screen.getByDisplayValue('Test (Fork)');
    await user.clear(input);

    await user.click(screen.getByRole('button', { name: /create fork/i }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(onFork).not.toHaveBeenCalled();
  });

  it('should disable inputs when isForking is true', () => {
    render(
      <ForkDialog
        originalName="Test"
        onFork={vi.fn()}
        onClose={vi.fn()}
        isForking={true}
      />
    );

    expect(screen.getByDisplayValue('Test (Fork)')).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('should show loading state on submit button when forking', () => {
    render(
      <ForkDialog
        originalName="Test"
        onFork={vi.fn()}
        onClose={vi.fn()}
        isForking={true}
      />
    );

    const submitButton = screen.getByRole('button', { name: /create fork/i });
    expect(submitButton).toBeDisabled();
  });
});
