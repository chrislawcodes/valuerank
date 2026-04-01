import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LaunchConfirmModal } from '../../../../src/components/domains/domainTrials/LaunchConfirmModal';

describe('LaunchConfirmModal', () => {
  it('shows the cleaner launch copy', () => {
    render(
      <MemoryRouter>
        <LaunchConfirmModal
          open={true}
          domainName="Job domain"
          vignetteCount={2}
          modelCount={2}
          totalPairedBatches={4}
          totalTrialRuns={8}
          estimatedTotalCost={84}
          estimateConfidence="HIGH"
          fallbackReason={null}
          knownExclusions={[]}
          temperatureLabel="Provider default"
          budgetCap={null}
          targetBatchCount={2}
          reviewSetupHref="/domains?domainId=domain-a&tab=setup"
          reviewVignettesHref="/domains?domainId=domain-a&tab=vignettes"
          isStarting={false}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /confirm domain level batches/i })).toBeInTheDocument();
    expect(screen.getByText('Job domain')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start paired batches/i })).toBeEnabled();
  });
});
