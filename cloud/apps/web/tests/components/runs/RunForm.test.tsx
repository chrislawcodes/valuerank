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

// Mock the useCostEstimate hook
vi.mock('../../../src/hooks/useCostEstimate', () => ({
  useCostEstimate: vi.fn().mockReturnValue({
    costEstimate: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../../src/hooks/useRunConditionGrid', () => ({
  useRunConditionGrid: vi.fn(),
}));

import { useAvailableModels } from '../../../src/hooks/useAvailableModels';
import { useRunConditionGrid } from '../../../src/hooks/useRunConditionGrid';

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
    vi.mocked(useRunConditionGrid).mockReturnValue({
      grid: {
        attributeA: 'Attribute A',
        attributeB: 'Attribute B',
        rowLevels: ['1'],
        colLevels: ['3'],
        cells: [{
          rowLevel: '1',
          colLevel: '3',
          trialCount: 7,
          scenarioCount: 1,
          scenarioIds: ['scenario-1'],
        }],
      },
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

  it('renders trial size options', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Trial Size')).toBeInTheDocument();
    expect(screen.getByText('Trial specific condition')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '100%' })).toBeInTheDocument();
    expect(screen.queryByText('10%')).not.toBeInTheDocument();
    expect(screen.queryByText('1% (test trial)')).not.toBeInTheDocument();
    expect(screen.queryByText('25%')).not.toBeInTheDocument();
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('renders paired batch labels and side-by-side layout in paired-batch mode', () => {
    render(
      <RunForm
        definitionId="def-1"
        copyMode="paired-batch"
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Batch Size')).toBeInTheDocument();
    expect(screen.getByText('Batches per vignette')).toBeInTheDocument();
    expect(screen.getByTestId('paired-batch-layout')).toHaveClass('grid');
    expect(screen.getByTestId('paired-batch-layout')).toHaveClass('lg:grid-cols-2');
  });

  it('defaults to 100% trial size', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    const defaultButton = screen.getByText('100%');
    expect(defaultButton).toHaveClass('border-teal-500');
  });

  it('shows estimated scenario count', () => {
    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('~100 vignettes will be probed')).toBeInTheDocument();
  });

  it('updates estimated count when trial size changes', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    await user.click(screen.getByText('Trial specific condition'));
    await user.click(screen.getByRole('button', { name: 'n = 7' }));

    expect(screen.getByText('~1 vignette will be probed')).toBeInTheDocument();
  });

  it('disables submit button when no models are selected', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    // Submit button should be disabled
    const submitButton = screen.getByRole('button', { name: /start trial/i });
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

    // Submit
    await user.click(screen.getByText('Start Trial'));

    expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'def-1',
      models: ['gpt-4'],
      samplePercentage: 100,
      samplesPerScenario: 1,
      finalTrial: false,
      launchMode: 'STANDARD',
    }));
  });

  it('shows cost estimate section when models are selected', async () => {
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

    // Should show cost estimate placeholder (since mock returns null costEstimate)
    expect(screen.getByText('Select models to see cost estimate')).toBeInTheDocument();
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
    expect(screen.getByText('Starting Trial...')).toBeInTheDocument();

    // Sample buttons should be disabled
    const sampleButton = screen.getByText('100%');
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

  it('shows trials per narrative controls directly', () => {
    render(
      <RunForm
        definitionId="def-1"
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Trials per Vignette')).toBeInTheDocument();
    expect(screen.queryByText(/advanced options/i)).not.toBeInTheDocument();
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

    const submitButton = screen.getByRole('button', { name: /start trial/i });
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

    // Submit
    await user.click(screen.getByText('Start Trial'));

    expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'def-1',
      models: ['gpt-4', 'claude-3'],
      samplePercentage: 100,
      samplesPerScenario: 1,
      finalTrial: false,
      launchMode: 'STANDARD',
    }));
  });

  it('defaults Job Choice definitions to paired batch launch mode', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <RunForm
        definitionId="job-choice-def-1"
        definitionContent={{
          schema_version: 1,
          methodology: {
            family: 'job-choice',
            presentation_order: 'A_first',
          },
          components: {
            value_first: { token: 'freedom' },
            value_second: { token: 'harmony' },
          },
          dimensions: [
            { name: 'Freedom' },
            { name: 'Harmony' },
          ],
        }}
        scenarioCount={10}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Batch Type')).toBeInTheDocument();
    const pairedModeButton = screen
      .getByText('Methodology-safe default. Launches both order variants together.')
      .closest('button');
    expect(pairedModeButton).not.toBeNull();
    expect(pairedModeButton).toHaveClass('border-teal-500');
    expect(screen.getByText(/currently configured as/i)).toHaveTextContent('Freedom -> Harmony');

    await user.click(screen.getByText('OpenAI'));
    await user.click(screen.getByText('GPT-4'));
    await user.click(screen.getAllByRole('button', { name: 'Start Paired Batch' }).at(-1)!);

    expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'job-choice-def-1',
      models: ['gpt-4'],
      launchMode: 'PAIRED_BATCH',
    }));
  });

  it('requires condition selection for trial specific condition mode', async () => {
    const user = userEvent.setup();

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    await user.click(screen.getByText('Trial specific condition'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('[no condition selected]')).toBeInTheDocument();
  });

  it('submits selected scenario ids for trial specific condition mode', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <RunForm
        definitionId="def-1"
        scenarioCount={100}
        onSubmit={mockOnSubmit}
      />
    );

    await user.click(screen.getByText('OpenAI'));
    await user.click(screen.getByText('GPT-4'));
    await user.click(screen.getByText('Trial specific condition'));
    await user.click(screen.getByRole('button', { name: 'n = 7' }));
    await user.click(screen.getByText('Start Trial'));

    expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'def-1',
      models: ['gpt-4'],
      samplePercentage: undefined,
      samplesPerScenario: 1,
      scenarioIds: ['scenario-1'],
      finalTrial: false,
      launchMode: 'STANDARD',
      temperature: undefined,
    }));
  });
});
