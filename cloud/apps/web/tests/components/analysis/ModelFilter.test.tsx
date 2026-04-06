import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelFilter } from '../../../src/components/analysis/ModelFilter';

const TRANSCRIPT_MODELS = ['model-a', 'model-b', 'model-c'];

function setup(props: Partial<React.ComponentProps<typeof ModelFilter>> = {}) {
  const onSelectedModelsChange = vi.fn();
  const result = render(
    <ModelFilter
      transcriptModelIds={TRANSCRIPT_MODELS}
      selectedModels={[...TRANSCRIPT_MODELS]}
      onSelectedModelsChange={onSelectedModelsChange}
      {...props}
    />,
  );
  return { ...result, onSelectedModelsChange };
}

describe('ModelFilter — collapsed state', () => {
  it('renders "Default" label when all transcript-bearing models are selected', () => {
    setup({ selectedModels: [...TRANSCRIPT_MODELS] });
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('renders "N of M" label when a subset is selected', () => {
    setup({ selectedModels: ['model-a', 'model-b'] });
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('renders amber warning when 0 models are selected', () => {
    setup({ selectedModels: [] });
    expect(
      screen.getByText(/No models selected/i),
    ).toBeInTheDocument();
  });

  it('shows "Reset to default" link in custom subset state', () => {
    setup({ selectedModels: ['model-a'] });
    expect(screen.getByRole('button', { name: /reset to default/i })).toBeInTheDocument();
  });

  it('does not show "Reset to default" link in default state', () => {
    setup({ selectedModels: [...TRANSCRIPT_MODELS] });
    expect(screen.queryByRole('button', { name: /reset to default/i })).not.toBeInTheDocument();
  });
});

describe('ModelFilter — "Reset to default" link', () => {
  it('calls onSelectedModelsChange with full transcriptModelIds when no defaultModelIds provided', async () => {
    const user = userEvent.setup();
    const { onSelectedModelsChange } = setup({ selectedModels: ['model-a'] });

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    expect(onSelectedModelsChange).toHaveBeenCalledWith([...TRANSCRIPT_MODELS]);
  });

  it('calls onSelectedModelsChange with defaultModelIds when provided', async () => {
    const user = userEvent.setup();
    const { onSelectedModelsChange } = setup({
      defaultModelIds: ['model-a', 'model-b'],
      selectedModels: ['model-a'],
    });

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    expect(onSelectedModelsChange).toHaveBeenCalledWith(['model-a', 'model-b']);
  });

  it('shows "Default" when selection matches defaultModelIds subset', () => {
    setup({
      defaultModelIds: ['model-a', 'model-b'],
      selectedModels: ['model-a', 'model-b'],
    });
    expect(screen.getByText('Default')).toBeInTheDocument();
  });
});

describe('ModelFilter — expand/collapse', () => {
  it('toggle flips aria-expanded', async () => {
    const user = userEvent.setup();
    setup();

    const changeButton = screen.getByRole('button', { name: /change/i });
    expect(changeButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(changeButton);
    expect(screen.getByRole('button', { name: /close/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows expanded panel after clicking Change', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /change/i }));

    expect(screen.getByRole('group', { name: /model filter/i })).toBeInTheDocument();
  });
});

describe('ModelFilter — no-transcript models', () => {
  it('renders dimmed rows with disabled checkboxes for no-transcript models', async () => {
    const user = userEvent.setup();
    setup({
      selectedModels: [...TRANSCRIPT_MODELS],
      noTranscriptModelIds: ['model-d'],
    });

    // Open the panel
    await user.click(screen.getByRole('button', { name: /change/i }));

    // model-d should appear with disabled checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    const modelDCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).disabled && cb.closest('label')?.textContent?.includes('model-d'),
    );
    expect(modelDCheckbox).toBeDefined();
    expect(modelDCheckbox).toBeDisabled();

    // "no transcripts" text should appear
    expect(screen.getByText('no transcripts')).toBeInTheDocument();
  });
});

describe('ModelFilter — checking/unchecking', () => {
  it('calls onSelectedModelsChange with updated list when a model is unchecked', async () => {
    const user = userEvent.setup();
    const { onSelectedModelsChange } = setup({
      selectedModels: [...TRANSCRIPT_MODELS],
    });

    // Open the panel
    await user.click(screen.getByRole('button', { name: /change/i }));

    // Uncheck model-b
    const checkboxes = screen.getAllByRole('checkbox');
    const modelBCheckbox = checkboxes.find(
      (cb) =>
        !(cb as HTMLInputElement).disabled &&
        cb.closest('label')?.textContent?.includes('model-b'),
    );
    expect(modelBCheckbox).toBeDefined();
    await user.click(modelBCheckbox!);

    expect(onSelectedModelsChange).toHaveBeenCalledWith(['model-a', 'model-c']);
  });

  it('calls onSelectedModelsChange with full list when Select all is clicked', async () => {
    const user = userEvent.setup();
    const { onSelectedModelsChange } = setup({
      selectedModels: ['model-a'],
    });

    await user.click(screen.getByRole('button', { name: /change/i }));
    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(onSelectedModelsChange).toHaveBeenCalledWith([...TRANSCRIPT_MODELS]);
  });

  it('calls onSelectedModelsChange with [] when Clear is clicked', async () => {
    const user = userEvent.setup();
    const { onSelectedModelsChange } = setup({
      selectedModels: [...TRANSCRIPT_MODELS],
    });

    await user.click(screen.getByRole('button', { name: /change/i }));
    await user.click(screen.getByRole('button', { name: /^clear$/i }));

    expect(onSelectedModelsChange).toHaveBeenCalledWith([]);
  });
});
