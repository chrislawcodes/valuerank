import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefinitionEditor } from '../../../src/components/definitions/DefinitionEditor';
import type { DefinitionContent } from '../../../src/api/operations/definitions';

function createMockContent(
  overrides: Partial<DefinitionContent> = {}
): DefinitionContent {
  return {
    schema_version: 1,
    preamble: '',
    template: '',
    dimensions: [],
    ...overrides,
  };
}

describe('DefinitionEditor', () => {
  describe('form fields', () => {
    it('should render name input with placeholder', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByPlaceholderText(/ethical dilemma/i)).toBeInTheDocument();
    });

    it('should render preamble textarea', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByPlaceholderText(/context or instructions/i)
      ).toBeInTheDocument();
    });

    it('should render template textarea', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByPlaceholderText(/you encounter a/i)
      ).toBeInTheDocument();
    });

    it('should render Add Dimension button', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByRole('button', { name: /add dimension/i })
      ).toBeInTheDocument();
    });
  });

  describe('initial values', () => {
    it('should populate fields with initial values', () => {
      const initialContent = createMockContent({
        preamble: 'This is the preamble',
        template: 'You face a [situation]',
      });

      render(
        <DefinitionEditor
          mode="edit"
          initialName="Test Definition"
          initialContent={initialContent}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue('Test Definition')).toBeInTheDocument();
      expect(screen.getByDisplayValue('This is the preamble')).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('You face a [situation]')
      ).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('should show error when name is empty', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      render(
        <DefinitionEditor
          mode="create"
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );

      const submitButton = screen.getByRole('button', { name: /create definition/i });
      await user.click(submitButton);

      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('should show error when template is empty', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      render(
        <DefinitionEditor
          mode="create"
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );

      const nameInput = screen.getByPlaceholderText(/ethical dilemma/i);
      await user.type(nameInput, 'Test Definition');

      const submitButton = screen.getByRole('button', { name: /create definition/i });
      await user.click(submitButton);

      expect(screen.getByText('Template is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('dimensions', () => {
    it('should show empty state when no dimensions', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('No dimensions yet')).toBeInTheDocument();
    });

    it('should add dimension when Add Dimension clicked', async () => {
      const user = userEvent.setup();

      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const addButton = screen.getByRole('button', { name: /add dimension/i });
      await user.click(addButton);

      expect(
        screen.getByPlaceholderText(/dimension name/i)
      ).toBeInTheDocument();
      expect(screen.queryByText('No dimensions yet')).not.toBeInTheDocument();
    });
  });

  describe('save action', () => {
    it('should call onSave with valid data', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);

      render(
        <DefinitionEditor
          mode="create"
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );

      const nameInput = screen.getByPlaceholderText(/ethical dilemma/i);
      await user.type(nameInput, 'Test Definition');

      const templateInput = screen.getByPlaceholderText(/you encounter a/i);
      await user.type(templateInput, 'A simple test scenario');

      const submitButton = screen.getByRole('button', { name: /create definition/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          'Test Definition',
          expect.objectContaining({
            template: 'A simple test scenario',
          })
        );
      });
    });

    it('should show "Save Changes" button in edit mode', () => {
      render(
        <DefinitionEditor
          mode="edit"
          initialName="Existing Definition"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByRole('button', { name: /save changes/i })
      ).toBeInTheDocument();
    });
  });

  describe('cancel action', () => {
    it('should call onCancel when cancel clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={onCancel}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should disable inputs when isSaving', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          isSaving={true}
        />
      );

      expect(screen.getByPlaceholderText(/ethical dilemma/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/context or instructions/i)).toBeDisabled();
      expect(screen.getByPlaceholderText(/you encounter a/i)).toBeDisabled();
    });

    it('should disable submit button when isSaving', () => {
      render(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          isSaving={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /create definition/i });
      expect(submitButton).toBeDisabled();
    });
  });
});
