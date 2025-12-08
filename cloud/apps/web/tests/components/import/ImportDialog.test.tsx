/**
 * ImportDialog Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDialog } from '../../../src/components/import/ImportDialog';
import * as importApi from '../../../src/api/import';

vi.mock('../../../src/api/import', () => ({
  importDefinitionFromMd: vi.fn(),
  ImportApiError: class ImportApiError extends Error {
    details?: Array<{ field: string; message: string }>;
    suggestions?: { alternativeName?: string };
    constructor(
      message: string,
      details?: Array<{ field: string; message: string }>,
      suggestions?: { alternativeName?: string }
    ) {
      super(message);
      this.details = details;
      this.suggestions = suggestions;
    }
  },
}));

describe('ImportDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders import dialog with header', () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    expect(screen.getByText('Import Definition')).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop a .md file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse files/i })).toBeInTheDocument();
  });

  it('closes dialog when clicking backdrop', async () => {
    const user = userEvent.setup();
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Click the backdrop (the dark overlay)
    const backdrop = document.querySelector('.bg-black.bg-opacity-25');
    if (backdrop) {
      await user.click(backdrop);
    }

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes dialog when clicking X button', async () => {
    const user = userEvent.setup();
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no name
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes dialog when clicking Cancel button', async () => {
    const user = userEvent.setup();
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows error for non-markdown files', async () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Create a non-md file
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;

    // Simulate drop
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Please select a markdown/i)).toBeInTheDocument();
    });
  });

  it('accepts markdown file and shows file name', async () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Create a valid md file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;

    // Simulate drop
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('test.md')).toBeInTheDocument();
    });
  });

  it('enables import button after file selection', async () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Initially import button should be disabled
    const importButton = screen.getByRole('button', { name: /^import$/i });
    expect(importButton).toBeDisabled();

    // Select a file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(importButton).not.toBeDisabled();
    });
  });

  it('shows name override input after file selection', async () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Select a file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Leave blank to use name from file/i)).toBeInTheDocument();
    });
  });

  it('calls import API with file content', async () => {
    const user = userEvent.setup();
    vi.mocked(importApi.importDefinitionFromMd).mockResolvedValue({
      id: 'def-123',
      name: 'Test Definition',
    });

    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Select a file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('test.md')).toBeInTheDocument();
    });

    // Click import
    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(importApi.importDefinitionFromMd).toHaveBeenCalledWith(content, {
        name: undefined,
        forceAlternativeName: false,
      });
    });
  });

  it('shows success state after import', async () => {
    const user = userEvent.setup();
    vi.mocked(importApi.importDefinitionFromMd).mockResolvedValue({
      id: 'def-123',
      name: 'Test Definition',
    });

    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Select and import a file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('test.md')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText('Import Successful!')).toBeInTheDocument();
      expect(screen.getByText(/Test Definition/)).toBeInTheDocument();
    });
  });

  it('calls onSuccess when clicking Go to Definition', async () => {
    const user = userEvent.setup();
    vi.mocked(importApi.importDefinitionFromMd).mockResolvedValue({
      id: 'def-123',
      name: 'Test Definition',
    });

    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Select and import a file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('test.md')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText('Go to Definition')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /go to definition/i }));

    expect(mockOnSuccess).toHaveBeenCalledWith('def-123', 'Test Definition');
  });

  it('shows error message on import failure', async () => {
    const user = userEvent.setup();
    vi.mocked(importApi.importDefinitionFromMd).mockRejectedValue(
      new Error('Import failed: Invalid format')
    );

    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Select and try to import a file
    const content = 'invalid content';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('test.md')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Import failed: Invalid format/i)).toBeInTheDocument();
    });
  });

  it('passes name override to API', async () => {
    const user = userEvent.setup();
    vi.mocked(importApi.importDefinitionFromMd).mockResolvedValue({
      id: 'def-123',
      name: 'Custom Name',
    });

    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    // Select a file
    const content = '---\nname: Test Definition\n---\n# Preamble\nTest';
    const file = new File([content], 'test.md', { type: 'text/markdown' });

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Leave blank to use name from file/i)).toBeInTheDocument();
    });

    // Enter custom name
    await user.type(screen.getByPlaceholderText(/Leave blank to use name from file/i), 'Custom Name');

    // Click import
    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(importApi.importDefinitionFromMd).toHaveBeenCalledWith(content, {
        name: 'Custom Name',
        forceAlternativeName: false,
      });
    });
  });

  it('handles drag over state', async () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;

    // Simulate drag over
    fireEvent.dragOver(dropZone);

    // Check for visual feedback (border color change)
    expect(dropZone).toHaveClass('border-teal-400');
  });

  it('handles drag leave state', async () => {
    render(<ImportDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const dropZone = screen.getByText(/Drag and drop a .md file/i).closest('div')!;

    // Simulate drag over then leave
    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);

    // Should go back to default state
    expect(dropZone).not.toHaveClass('border-teal-400');
  });
});
