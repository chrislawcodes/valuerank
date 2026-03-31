/**
 * Unit tests for BudgetWarningDialog component and checkBudgetOverdraft helper
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetWarningDialog } from '../../../src/components/runs/BudgetWarningDialog';
import { checkBudgetOverdraft } from '../../../src/components/runs/RunForm';

// ============================================================================
// BudgetWarningDialog component tests (T029)
// ============================================================================

describe('BudgetWarningDialog', () => {
  const overdraftProviders = [
    { name: 'openai', displayName: 'OpenAI', estimatedCost: 5.0, balance: 2.0 },
  ];

  it('renders provider rows with correct data', () => {
    render(
      <BudgetWarningDialog
        overdraftProviders={overdraftProviders}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText('$2.00')).toBeInTheDocument();
  });

  it('calls onProceed when Proceed Anyway button is clicked', async () => {
    const onProceed = vi.fn();
    render(
      <BudgetWarningDialog
        overdraftProviders={overdraftProviders}
        onProceed={onProceed}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /proceed anyway/i }));
    expect(onProceed).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <BudgetWarningDialog
        overdraftProviders={overdraftProviders}
        onProceed={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders multiple overdraft providers', () => {
    const multiProviders = [
      { name: 'openai', displayName: 'OpenAI', estimatedCost: 5.0, balance: 2.0 },
      { name: 'anthropic', displayName: 'Anthropic', estimatedCost: 3.0, balance: 1.0 },
    ];
    render(
      <BudgetWarningDialog
        overdraftProviders={multiProviders}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });
});

// ============================================================================
// checkBudgetOverdraft helper tests (T030)
// ============================================================================

describe('checkBudgetOverdraft', () => {
  const makeProvider = (name: string, displayName: string, balance: number | null) => ({
    id: `provider-${name}`,
    name,
    displayName,
    balance,
    lastSyncedAt: null,
    maxParallelRequests: 5,
    requestsPerMinute: 60,
    isEnabled: true,
    createdAt: '',
    updatedAt: '',
    models: [],
  });

  it('returns empty array when no provider is overdrawn', () => {
    const providers = [makeProvider('openai', 'OpenAI', 100.0)];
    const costEstimate = {
      total: 5.0,
      perModel: [{ modelId: 'openai:gpt-4o', totalCost: 5.0, displayName: '', scenarioCount: 1, inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, avgInputPerProbe: 0, avgOutputPerProbe: 0, sampleCount: 1, isUsingFallback: false }],
      scenarioCount: 1,
      basedOnSampleCount: 1,
      isUsingFallback: false,
    };

    const result = checkBudgetOverdraft(costEstimate, providers);
    expect(result).toHaveLength(0);
  });

  it('returns overdraft entry when provider balance is insufficient', () => {
    const providers = [makeProvider('openai', 'OpenAI', 1.0)];
    const costEstimate = {
      total: 5.0,
      perModel: [{ modelId: 'openai:gpt-4o', totalCost: 5.0, displayName: '', scenarioCount: 1, inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, avgInputPerProbe: 0, avgOutputPerProbe: 0, sampleCount: 1, isUsingFallback: false }],
      scenarioCount: 1,
      basedOnSampleCount: 1,
      isUsingFallback: false,
    };

    const result = checkBudgetOverdraft(costEstimate, providers);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('openai');
    expect(result[0].estimatedCost).toBeCloseTo(5.0);
    expect(result[0].balance).toBeCloseTo(1.0);
  });

  it('does not include provider with null balance', () => {
    const providers = [makeProvider('openai', 'OpenAI', null)];
    const costEstimate = {
      total: 5.0,
      perModel: [{ modelId: 'openai:gpt-4o', totalCost: 5.0, displayName: '', scenarioCount: 1, inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, avgInputPerProbe: 0, avgOutputPerProbe: 0, sampleCount: 1, isUsingFallback: false }],
      scenarioCount: 1,
      basedOnSampleCount: 1,
      isUsingFallback: false,
    };

    const result = checkBudgetOverdraft(costEstimate, providers);
    expect(result).toHaveLength(0);
  });

  it('handles multi-provider scenario — only includes overdrawn ones', () => {
    const providers = [
      makeProvider('openai', 'OpenAI', 100.0),
      makeProvider('anthropic', 'Anthropic', 1.0),
    ];
    const costEstimate = {
      total: 8.0,
      perModel: [
        { modelId: 'openai:gpt-4o', totalCost: 3.0, displayName: '', scenarioCount: 1, inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, avgInputPerProbe: 0, avgOutputPerProbe: 0, sampleCount: 1, isUsingFallback: false },
        { modelId: 'anthropic:claude-3', totalCost: 5.0, displayName: '', scenarioCount: 1, inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, avgInputPerProbe: 0, avgOutputPerProbe: 0, sampleCount: 1, isUsingFallback: false },
      ],
      scenarioCount: 1,
      basedOnSampleCount: 1,
      isUsingFallback: false,
    };

    const result = checkBudgetOverdraft(costEstimate, providers);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('anthropic');
  });

  it('returns empty array when costEstimate has no perModel', () => {
    const providers = [makeProvider('openai', 'OpenAI', 5.0)];
    const costEstimate = {
      total: 0,
      perModel: [],
      scenarioCount: 0,
      basedOnSampleCount: 0,
      isUsingFallback: false,
    };

    const result = checkBudgetOverdraft(costEstimate, providers);
    expect(result).toHaveLength(0);
  });
});
