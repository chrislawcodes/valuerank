/**
 * RunForm Component Tests
 *
 * Tests for the run creation form.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunForm } from '../../../src/components/runs/RunForm';
import type { AvailableModel } from '../../../src/api/operations/models';

// Mock the useAvailableModels hook
vi.mock('../../../src/hooks/useAvailableModels', () => ({
  useAvailableModels: vi.fn(),
}));

import { useAvailableModels } from '../../../src/hooks/useAvailableModels';

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

describe('RunForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAvailableModels).mockReturnValue({
      models: [
        createMockModel({ id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4' }),
        createMockModel({ id: 'claude-3', providerId: 'anthropic', displayName: 'Claude 3' }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('renders form with model selector', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Target Models')).toBeInTheDocument();
    expect(screen.getByText('Select Models')).toBeInTheDocument();
  });

  it('renders sample size options', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Sample Size')).toBeInTheDocument();
    expect(screen.getByText('1% (test run)')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('100% (full run)')).toBeInTheDocument();
  });

  it('defaults to 1% sample for testing', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    // 1% button should be styled as selected
    const testRunButton = screen.getByText('1% (test run)');
    expect(testRunButton).toHaveClass('border-teal-500');
  });

  it('shows estimated scenario count', () => {
    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    // With 1% default, should show ~1 scenario
    expect(screen.getByText('~1 scenario will be probed')).toBeInTheDocument();
  });

  it('updates estimated count when sample size changes', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    // Click 50% option
    await user.click(screen.getByText('50%'));

    expect(screen.getByText('~50 scenarios will be probed')).toBeInTheDocument();
  });

  it('disables submit button when no models are selected', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    // Submit button should be disabled
    const submitButton = screen.getByRole('button', { name: /start run/i });
    expect(submitButton).toBeDisabled();

    // onSubmit should not have been called
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits with correct data when models are selected', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    // Expand OpenAI and select GPT-4
    await user.click(screen.getByText('OpenAI'));
    await user.click(screen.getByText('GPT-4'));

    // Click 25% sample
    await user.click(screen.getByText('25%'));

    // Submit
    await user.click(screen.getByText('Start Run'));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      definitionId: 'def-1',
      models: ['gpt-4'],
      samplePercentage: 25,
    });
  });

  it('shows run summary when models are selected', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    // Select a model
    await user.click(screen.getByText('OpenAI'));
    await user.click(screen.getByText('GPT-4'));

    // Should show summary (1 model x 1 scenario = 1 job at 1% default)
    expect(screen.getByText('Run Summary')).toBeInTheDocument();
    expect(screen.getByText(/1 model/)).toBeInTheDocument();
    expect(screen.getByText(/1 probe job/)).toBeInTheDocument();
  });

  it('calls onCancel when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await user.click(screen.getByText('Cancel'));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('disables controls while submitting', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
        isSubmitting={true}
      />
    );

    // Submit button should show loading state
    expect(screen.getByText('Starting Run...')).toBeInTheDocument();

    // Sample buttons should be disabled
    const sampleButton = screen.getByText('10%');
    expect(sampleButton).toBeDisabled();
  });

  it('shows error when models fail to load', () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      models: [],
      loading: false,
      error: new Error('Failed to fetch models'),
      refetch: vi.fn(),
    });

    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Failed to load models: Failed to fetch models')).toBeInTheDocument();
  });

  it('shows loading state while fetching models', () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      models: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    // Should show loading skeleton in ModelSelector
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows advanced options when toggled', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    // Initially hidden
    expect(screen.getByText('Show advanced options')).toBeInTheDocument();

    // Click to show
    await user.click(screen.getByText('Show advanced options'));

    expect(screen.getByText('Hide advanced options')).toBeInTheDocument();
    expect(screen.getByText('Advanced options will be available in a future release.')).toBeInTheDocument();
  });

  it('enables submit button when models are selected', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    // Select a model
    await user.click(screen.getByText('OpenAI'));
    await user.click(screen.getByText('GPT-4'));

    const submitButton = screen.getByRole('button', { name: /start run/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('handles multiple model selection', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={10}
        onSubmit={mockOnSubmit}
      />
    );

    // Select models from different providers
    await user.click(screen.getByText('OpenAI'));
    await user.click(screen.getByText('GPT-4'));
    await user.click(screen.getByText('Anthropic'));
    await user.click(screen.getByText('Claude 3'));

    // Summary should show 2 models
    expect(screen.getByText(/2 models/)).toBeInTheDocument();

    // Submit
    await user.click(screen.getByText('Start Run'));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      definitionId: 'def-1',
      models: ['gpt-4', 'claude-3'],
      samplePercentage: 1,
    });
  });
});
