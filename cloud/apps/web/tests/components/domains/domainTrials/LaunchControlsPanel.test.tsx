import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LaunchControlsPanel } from '../../../../src/components/domains/domainTrials/LaunchControlsPanel';
import type { ProviderBudgetEstimate } from '../../../../src/components/domains/domainTrials/launch-state';

function makeProviderEstimate(overrides: Partial<ProviderBudgetEstimate> = {}): ProviderBudgetEstimate {
  return {
    providerId: 'openai',
    providerName: 'openai',
    providerDisplayName: 'OpenAI',
    expectedSpendUsd: 42,
    budgetBalanceUsd: 100,
    budgetReady: true,
    ...overrides,
  };
}

describe('LaunchControlsPanel', () => {
  it('shows paired-batch setup and provider budget estimates', async () => {
    const user = userEvent.setup();
    const onSetTargetBatchCountInput = vi.fn();

    render(
      <MemoryRouter>
        <LaunchControlsPanel
          useDefaultTemperature={true}
          disableTemperatureInput={false}
          temperatureInput="0.7"
          maxBudgetEnabled={false}
          maxBudgetInput=""
          hasValidBudget={true}
          targetBatchCountInput="1"
          hasValidTargetBatchCount={true}
          isStarting={false}
          providerBudgetEstimates={[
            makeProviderEstimate(),
            makeProviderEstimate({
              providerId: 'anthropic',
              providerName: 'anthropic',
              providerDisplayName: 'Anthropic',
              expectedSpendUsd: 55,
              budgetBalanceUsd: 40,
              budgetReady: false,
            }),
          ]}
          launchDisabled={true}
          launchDisabledReason="A launch is already active for this domain."
          onSetUseDefaultTemperature={() => {}}
          onSetTemperatureInput={() => {}}
          onSetMaxBudgetEnabled={() => {}}
          onSetMaxBudgetInput={() => {}}
          onSetTargetBatchCountInput={onSetTargetBatchCountInput}
          onOpenConfirm={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Provider Budget Estimates')).toBeInTheDocument();
    expect(screen.getByLabelText(/target number of paired batches per vignette/i)).toHaveValue(1);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('Budget balance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review & start paired batches/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/target number of paired batches per vignette/i), '2');
    expect(onSetTargetBatchCountInput).toHaveBeenCalled();
  });
});
