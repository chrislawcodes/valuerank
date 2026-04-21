import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CircumplexModelPicker } from '../../../src/components/models/CircumplexModelPicker';
import type { CircumplexInsufficientModel, CircumplexResult } from '../../../src/api/operations/circumplex';

function buildEligibleModel(modelId: string, modelLabel: string): CircumplexResult {
  return {
    modelId,
    modelLabel,
    providerName: 'openai',
    trialsPerValue: [],
  } as unknown as CircumplexResult;
}

function buildInsufficientModel(modelId: string, modelLabel: string): CircumplexInsufficientModel {
  return {
    modelId,
    modelLabel,
    providerName: 'openai',
    reason: 'below_threshold',
    trialsPerValue: [{ valueKey: 'Achievement', trials: 3 }],
  } as unknown as CircumplexInsufficientModel;
}

describe('CircumplexModelPicker', () => {
  it('starts compact and expands into the picker details', async () => {
    const user = userEvent.setup();

    render(
      <CircumplexModelPicker
        eligible={[buildEligibleModel('model-a', 'Model A'), buildEligibleModel('model-b', 'Model B')]}
        insufficient={[buildInsufficientModel('model-c', 'Model C')]}
        selectedModelIds={['model-a']}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClear={() => {}}
      />,
    );

    expect(screen.getByText('Model A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /model details/i }));
    });

    expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
    expect(screen.getByText(/hidden from selection/i)).toBeInTheDocument();
    expect(screen.getByText('Model C')).toBeInTheDocument();
  });

  it('keeps the existing toggle callback for eligible model buttons', async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(
      <CircumplexModelPicker
        eligible={[buildEligibleModel('model-a', 'Model A'), buildEligibleModel('model-b', 'Model B')]}
        insufficient={[]}
        selectedModelIds={['model-a']}
        onToggle={handleToggle}
        onSelectAll={() => {}}
        onClear={() => {}}
      />,
    );

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /model details/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Model B/i }));
    });

    expect(handleToggle).toHaveBeenCalledWith('model-b');
  });
});
