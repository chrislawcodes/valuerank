import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DomainEvaluationStatusPanel } from '../../../../src/components/domains/domainTrials/DomainEvaluationStatusPanel';

function makeEvaluation() {
  return {
    id: 'eval-1',
    domainId: 'domain-a',
    domainNameAtLaunch: 'Jobs',
    scopeCategory: 'PRODUCTION',
    status: 'RUNNING',
    createdAt: '2026-03-15T12:00:00.000Z',
    startedAt: '2026-03-15T12:01:00.000Z',
    completedAt: null,
    startedRuns: 2,
    failedDefinitions: 0,
    skippedForBudget: 0,
    projectedCostUsd: 84,
    models: ['model-1'],
    temperature: null,
    maxBudgetUsd: null,
    memberCount: 2,
    members: [
      {
        runId: 'run-1',
        definitionIdAtLaunch: 'def-1',
        definitionNameAtLaunch: 'Jobs A',
        domainIdAtLaunch: 'domain-a',
        createdAt: '2026-03-15T12:01:00.000Z',
        runStatus: 'RUNNING',
        runCategory: 'PRODUCTION',
        runStartedAt: '2026-03-15T12:01:00.000Z',
        runCompletedAt: null,
      },
      {
        runId: 'run-2',
        definitionIdAtLaunch: 'def-2',
        definitionNameAtLaunch: 'Jobs B',
        domainIdAtLaunch: 'domain-a',
        createdAt: '2026-03-15T12:01:00.000Z',
        runStatus: 'FAILED',
        runCategory: 'PRODUCTION',
        runStartedAt: '2026-03-15T12:01:00.000Z',
        runCompletedAt: '2026-03-15T12:04:00.000Z',
      },
    ],
  };
}

describe('DomainEvaluationStatusPanel', () => {
  it('shows live rows, exceptions, and row selection', async () => {
    const user = userEvent.setup();
    const onSelectRun = vi.fn();

    render(
      <MemoryRouter>
      <DomainEvaluationStatusPanel
        domainName="Jobs"
        evaluation={makeEvaluation() as never}
        evaluationStatus={{
          id: 'eval-1',
          status: 'RUNNING',
          totalRuns: 2,
          pendingRuns: 0,
          runningRuns: 1,
          completedRuns: 1,
          failedRuns: 1,
          cancelledRuns: 0,
        }}
        runStatuses={[
          {
            runId: 'run-1',
            definitionId: 'def-1',
            status: 'SUMMARIZING',
            updatedAt: '2026-03-15T12:02:00.000Z',
            stalledModels: [],
            analysisStatus: 'computing',
            modelStatuses: [
              {
                modelId: 'model-1',
                generationCompleted: 25,
                generationFailed: 0,
                generationTotal: 25,
                summarizationCompleted: 10,
                summarizationFailed: 0,
                summarizationTotal: 25,
                latestErrorMessage: null,
              },
            ],
          },
          {
            runId: 'run-2',
            definitionId: 'def-2',
            status: 'FAILED',
            updatedAt: '2026-03-15T12:05:00.000Z',
            stalledModels: ['model-2'],
            analysisStatus: 'failed',
            modelStatuses: [
              {
                modelId: 'model-2',
                generationCompleted: 2,
                generationFailed: 1,
                generationTotal: 25,
                summarizationCompleted: 0,
                summarizationFailed: 0,
                summarizationTotal: 25,
                latestErrorMessage: 'Budget exhausted',
              },
            ],
          },
        ]}
        fetching={false}
        lastUpdatedAt={Date.now()}
        selectedRunId={null}
        onSelectRun={onSelectRun}
      />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByText('Live processing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /needs attention/i })).toBeInTheDocument();
    expect(screen.getByText('Jobs A')).toBeInTheDocument();
    expect(screen.getByText('Jobs B')).toBeInTheDocument();
    expect(screen.getByText(/Analysis complete:/i)).toHaveTextContent('0');

    await user.click(screen.getByText('Jobs A'));
    expect(onSelectRun).toHaveBeenCalledWith('run-1');
  });
});
