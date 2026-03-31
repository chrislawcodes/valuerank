import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LaunchControlsPanel } from '../../../../src/components/domains/domainTrials/LaunchControlsPanel';
import type { ProviderBudgetReadiness } from '../../../../src/components/domains/domainTrials/launch-state';

function makeProviderReadiness(overrides: Partial<ProviderBudgetReadiness> = {}): ProviderBudgetReadiness {
  return {
    providerId: 'openai',
    providerName: 'openai',
    providerDisplayName: 'OpenAI',
    expectedSpendUsd: 42,
    remainingBudgetUsd: 100,
    lastChecked: new Date().toISOString(),
    freshness: 'FRESH',
    status: 'READY',
    reason: 'Budget ready',
    ...overrides,
  };
}

describe('LaunchControlsPanel', () => {
  it('shows paired-batch setup and provider readiness', async () => {
    const user = userEvent.setup();
    const onSetTargetBatchCountInput = vi.fn();

    render(
      <MemoryRouter>
        <LaunchControlsPanel
          scopeCategory="PRODUCTION"
          vignetteCount={2}
          modelCount={2}
          totalPairedBatches={4}
          totalTrialRuns={8}
          totalEstimatedCost={84}
          estimateConfidence="HIGH"
          fallbackReason={null}
          knownExclusions={[]}
          useDefaultTemperature={true}
          disableTemperatureInput={false}
          temperatureInput="0.7"
          maxBudgetEnabled={false}
          maxBudgetInput=""
          hasValidBudget={true}
          targetBatchCountInput="1"
          hasValidTargetBatchCount={true}
          isStarting={false}
          planFetching={false}
          reviewSetupHref="/domains?domainId=domain-a&tab=setup"
          reviewVignettesHref="/domains?domainId=domain-a&tab=vignettes"
          excludedRequestedDefinitionCount={0}
          providerReadiness={[
            makeProviderReadiness(),
            makeProviderReadiness({
              providerId: 'anthropic',
              providerName: 'anthropic',
              providerDisplayName: 'Anthropic',
              expectedSpendUsd: 55,
              remainingBudgetUsd: 40,
              freshness: 'STALE',
              status: 'TOP_UP_REQUIRED',
              reason: 'Top-up needed before launch',
            }),
          ]}
          launchDisabled={true}
          launchDisabledReason="A launch is already active for this domain."
          onSetScopeCategory={() => {}}
          onSetUseDefaultTemperature={() => {}}
          onSetTemperatureInput={() => {}}
          onSetMaxBudgetEnabled={() => {}}
          onSetMaxBudgetInput={() => {}}
          onSetTargetBatchCountInput={onSetTargetBatchCountInput}
          onOpenConfirm={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByLabelText(/paired-batch depth per vignette/i)).toHaveValue(1);
    expect(screen.getByText('Provider budget readiness')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getAllByText('Checked just now')).toHaveLength(2);
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review & start domain evaluation/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/paired-batch depth per vignette/i), '2');
    expect(onSetTargetBatchCountInput).toHaveBeenCalled();
  });
});
