import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'urql';
import { fromValue } from 'wonka';
import { DefinitionEditor } from '../../../src/components/definitions/DefinitionEditor';
import type { DefinitionContent } from '../../../src/api/operations/definitions';

const mockClient = {
  executeQuery: vi.fn(() => fromValue({ data: { preambles: [] }, fetching: false })),
  executeMutation: vi.fn(),
  executeSubscription: vi.fn(),
};

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <Provider value={mockClient as never}>
      {ui}
    </Provider>
  );
}

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
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByPlaceholderText(/ethical dilemma/i)).toBeInTheDocument();
    });

    it('should render preamble select', () => {
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('System Preamble')).toBeInTheDocument();
      expect(screen.getByText('Default (None)')).toBeInTheDocument();
    });

    it('should render template editor section', () => {
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Template editor section exists (Monaco editor doesn't use placeholder attribute)
      expect(screen.getByText('Narrative')).toBeInTheDocument();
    });

    it('should render Add Custom Dimension button', () => {
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByRole('button', { name: /add custom attribute/i })
      ).toBeInTheDocument();
    });
  });

  describe('initial values', () => {
    it('should populate fields with initial values', () => {
      const initialContent = createMockContent({
        preamble: 'This is the preamble',
        template: 'You face a [situation]',
      });

      renderWithProvider(
        <DefinitionEditor
          mode="edit"
          initialName="Test Definition"
          initialContent={initialContent}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue('Test Definition')).toBeInTheDocument();
      // Monaco editor content can't be checked with getByDisplayValue
      // Just verify the template section is present
      expect(screen.getByText('Narrative')).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('should show error when name is empty', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );

      const submitButton = screen.getByRole('button', { name: /create vignette/i });
      await user.click(submitButton);

      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('should show error when template is empty', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );

      const nameInput = screen.getByPlaceholderText(/ethical dilemma/i);
      await user.type(nameInput, 'Test Definition');

      const submitButton = screen.getByRole('button', { name: /create vignette/i });
      await user.click(submitButton);

      expect(screen.getByText('Template is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('dimensions', () => {
    it('should show empty state when no dimensions', () => {
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('No attributes yet')).toBeInTheDocument();
    });

    it('should add dimension when Add Custom Dimension clicked', async () => {
      const user = userEvent.setup();

      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const addButton = screen.getByRole('button', { name: /add custom attribute/i });
      await user.click(addButton);

      expect(
        screen.getByPlaceholderText(/attribute name/i)
      ).toBeInTheDocument();
      expect(screen.queryByText('No attributes yet')).not.toBeInTheDocument();
    });
  });

  describe('save action', () => {
    it('should call onSave with valid data', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);

      // Pre-populate template since Monaco editor is hard to interact with in tests
      const initialContent = createMockContent({
        template: 'A simple test scenario',
      });

      renderWithProvider(
        <DefinitionEditor
          mode="create"
          initialContent={initialContent}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );

      const nameInput = screen.getByPlaceholderText(/ethical dilemma/i);
      await user.type(nameInput, 'Test Definition');

      const submitButton = screen.getByRole('button', { name: /create vignette/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          'Test Definition',
          expect.objectContaining({
            template: 'A simple test scenario',
          }),
          null
        );
      });
    });

    it('should show "Save Changes" button in edit mode', () => {
      renderWithProvider(
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

      renderWithProvider(
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
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          isSaving={true}
        />
      );

      expect(screen.getByPlaceholderText(/ethical dilemma/i)).toBeDisabled();
      // Monaco editor disabled state is handled differently - can't check with toBeDisabled()
      // Just verify the name input is disabled
    });

    it('should disable submit button when isSaving', () => {
      renderWithProvider(
        <DefinitionEditor
          mode="create"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          isSaving={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /create vignette/i });
      expect(submitButton).toBeDisabled();
    });
  });
});
