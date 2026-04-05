import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText(/No models selected/i)).toBeInTheDocument();
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
  it('calls onSelectedModelsChange with full transcriptModelIds when clicked', () => {
    const { onSelectedModelsChange } = setup({ selectedModels: ['model-a'] });
    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));
    expect(onSelectedModelsChange).toHaveBeenCalledWith([...TRANSCRIPT_MODELS]);
  });
});

describe('ModelFilter — expand/collapse', () => {
  it('toggle flips aria-expanded', () => {
    setup();
    const changeButton = screen.getByRole('button', { name: /change/i });
    expect(changeButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(changeButton);
    expect(screen.getByRole('button', { name: /close/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows expanded panel after clicking Change', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByRole('group', { name: /model filter/i })).toBeInTheDocument();
  });
});

describe('ModelFilter — no-transcript models', () => {
  it('renders dimmed rows with disabled checkboxes for no-transcript models', () => {
    setup({
      selectedModels: [...TRANSCRIPT_MODELS],
      noTranscriptModelIds: ['model-d'],
    });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));

    const checkboxes = screen.getAllByRole('checkbox');
    const modelDCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).disabled && cb.closest('label')?.textContent?.includes('model-d'),
    );
    expect(modelDCheckbox).toBeDefined();
    expect(modelDCheckbox).toBeDisabled();
    expect(screen.getByText('no transcripts')).toBeInTheDocument();
  });
});

describe('ModelFilter — checking/unchecking', () => {
  it('calls onSelectedModelsChange with updated list when a model is unchecked', () => {
    const { onSelectedModelsChange } = setup({
      selectedModels: [...TRANSCRIPT_MODELS],
    });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));

    const checkboxes = screen.getAllByRole('checkbox');
    const modelBCheckbox = checkboxes.find(
      (cb) =>
        !(cb as HTMLInputElement).disabled &&
        cb.closest('label')?.textContent?.includes('model-b'),
    );
    expect(modelBCheckbox).toBeDefined();
    fireEvent.click(modelBCheckbox!);
    expect(onSelectedModelsChange).toHaveBeenCalledWith(['model-a', 'model-c']);
  });

  it('calls onSelectedModelsChange with full list when Select all is clicked', () => {
    const { onSelectedModelsChange } = setup({
      selectedModels: ['model-a'],
    });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    expect(onSelectedModelsChange).toHaveBeenCalledWith([...TRANSCRIPT_MODELS]);
  });

  it('calls onSelectedModelsChange with [] when Clear is clicked', () => {
    const { onSelectedModelsChange } = setup({
      selectedModels: [...TRANSCRIPT_MODELS],
    });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onSelectedModelsChange).toHaveBeenCalledWith([]);
  });
});
