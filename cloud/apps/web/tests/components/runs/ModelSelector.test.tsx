/**
 * ModelSelector Component Tests
 *
 * Tests for the model selection component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelSelector } from '../../../src/components/runs/ModelSelector';
import type { AvailableModel } from '../../../src/api/operations/models';

function createMockModel(overrides: Partial<AvailableModel> = {}): AvailableModel {
  return {
    id: 'test-model',
    providerId: 'test-provider',
    displayName: 'Test Model',
    versions: ['v1', 'v2'],
    defaultVersion: 'v1',
    isAvailable: true,
    ...overrides,
  };
}

describe('ModelSelector', () => {
  it('renders loading state', () => {
    render(
      <ModelSelector
        models={[]}
        selectedModels={[]}
        onSelectionChange={vi.fn()}
        loading={true}
      />
    );

    // Should show skeleton/loading state
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders empty state when no models available', () => {
    render(
      <ModelSelector
        models={[]}
        selectedModels={[]}
        onSelectionChange={vi.fn()}
        loading={false}
      />
    );

    expect(screen.getByText('No models available')).toBeInTheDocument();
    expect(screen.getByText('Configure API keys in Settings')).toBeInTheDocument();
  });

  it('renders models grouped by provider', async () => {
    const user = userEvent.setup();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
      createMockModel({ id: 'gpt-3.5', providerId: 'openai', displayName: 'GPT-3.5' }),
      createMockModel({ id: 'claude-3', providerId: 'anthropic', displayName: 'Claude 3' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={vi.fn()}
      />
    );

    // Provider headers should be visible
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();

    // Click to expand OpenAI
    await user.click(screen.getByText('OpenAI'));

    // Models should be visible
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('GPT-3.5')).toBeInTheDocument();
  });

  it('shows selected count in header', () => {
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
      createMockModel({ id: 'claude-3', providerId: 'anthropic', displayName: 'Claude 3' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={['gpt-4']}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
  });

  it('calls onSelectionChange when model is selected', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={onSelectionChange}
      />
    );

    // Expand provider
    await user.click(screen.getByText('OpenAI'));

    // Select model
    await user.click(screen.getByText('GPT-4'));

    expect(onSelectionChange).toHaveBeenCalledWith(['gpt-4']);
  });

  it('calls onSelectionChange when model is deselected', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={['gpt-4']}
        onSelectionChange={onSelectionChange}
      />
    );

    // Expand provider
    await user.click(screen.getByText('OpenAI'));

    // Deselect model
    await user.click(screen.getByText('GPT-4'));

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('disables unavailable models', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const models = [
      createMockModel({
        id: 'gpt-4',
        providerId: 'openai',
        displayName: 'GPT-4',
        isAvailable: false,
      }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={onSelectionChange}
      />
    );

    // Expand provider
    await user.click(screen.getByText('OpenAI'));

    // Try to select unavailable model
    const modelButton = screen.getByText('GPT-4').closest('button');
    expect(modelButton).toBeDisabled();

    // Should show "no API key" indicator
    expect(screen.getByText('(no API key)')).toBeInTheDocument();
  });

  it('supports select all in provider', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
      createMockModel({ id: 'gpt-3.5', providerId: 'openai', displayName: 'GPT-3.5' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={onSelectionChange}
      />
    );

    // Expand provider
    await user.click(screen.getByText('OpenAI'));

    // Click select all
    await user.click(screen.getByText('Select all available'));

    expect(onSelectionChange).toHaveBeenCalledWith(['gpt-4', 'gpt-3.5']);
  });

  it('supports deselect all in provider', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
      createMockModel({ id: 'gpt-3.5', providerId: 'openai', displayName: 'GPT-3.5' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={['gpt-4', 'gpt-3.5']}
        onSelectionChange={onSelectionChange}
      />
    );

    // Expand provider
    await user.click(screen.getByText('OpenAI'));

    // Click deselect all
    await user.click(screen.getByText('Deselect all'));

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('disables all controls when disabled prop is true', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={onSelectionChange}
        disabled={true}
      />
    );

    // Provider button should be disabled
    const providerButton = screen.getByText('OpenAI').closest('button');
    expect(providerButton).toBeDisabled();

    // Try to click - should not change anything
    await user.click(providerButton!);

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('shows correct per-provider selection count', async () => {
    const user = userEvent.setup();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
      createMockModel({ id: 'gpt-3.5', providerId: 'openai', displayName: 'GPT-3.5' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={['gpt-4']}
        onSelectionChange={vi.fn()}
      />
    );

    // Should show 1/2 for OpenAI
    expect(screen.getByText('1/2 selected')).toBeInTheDocument();
  });

  it('collapses and expands provider sections', async () => {
    const user = userEvent.setup();
    const models = [
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={vi.fn()}
      />
    );

    // Initially models are not visible (collapsed)
    expect(screen.queryByText('GPT-4')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText('OpenAI'));
    expect(screen.getByText('GPT-4')).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText('OpenAI'));
    expect(screen.queryByText('GPT-4')).not.toBeInTheDocument();
  });

  it('formats provider names correctly', async () => {
    const user = userEvent.setup();
    const models = [
      createMockModel({ id: 'claude-3', providerId: 'anthropic', displayName: 'Claude 3' }),
      createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
      createMockModel({ id: 'gemini', providerId: 'google', displayName: 'Gemini' }),
      createMockModel({ id: 'mistral', providerId: 'mistral', displayName: 'Mistral' }),
    ];

    render(
      <ModelSelector
        models={models}
        selectedModels={[]}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Mistral')).toBeInTheDocument();
  });
});
