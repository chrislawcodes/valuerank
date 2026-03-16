import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DomainTrialsDashboard } from '../../src/pages/DomainTrialsDashboard';
import {
  DOMAIN_EVALUATIONS_QUERY,
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_EVALUATION_STATUS_QUERY,
  DOMAIN_RUN_SUMMARY_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  DOMAIN_TRIALS_PLAN_QUERY,
  ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  RETRY_DOMAIN_TRIAL_CELL_MUTATION,
  START_DOMAIN_EVALUATION_MUTATION,
} from '../../src/api/operations/domains';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const startDomainEvaluationMock = vi.fn();
const retryCellMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
    useMutation: (query: unknown) => useMutationMock(query),
  };
});

function renderDomainTrialsDashboard() {
  return render(
    <MemoryRouter initialEntries={['/domains/domain-a/run-trials?evaluationId=eval-1']}>
      <Routes>
        <Route path="/domains/:domainId/run-trials" element={<DomainTrialsDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DomainTrialsDashboard', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    startDomainEvaluationMock.mockReset();
    retryCellMock.mockReset();

    useMutationMock.mockImplementation((query: unknown) => {
      if (query === START_DOMAIN_EVALUATION_MUTATION) {
        return [{ fetching: false }, startDomainEvaluationMock];
      }
      if (query === RETRY_DOMAIN_TRIAL_CELL_MUTATION) {
        return [{ fetching: false }, retryCellMock];
      }
      return [{ fetching: false }, vi.fn()];
    });

    useQueryMock.mockImplementation((args: { query: unknown }) => {
      if (args.query === DOMAIN_TRIALS_PLAN_QUERY) {
        return [{
          data: {
            domainTrialsPlan: {
              domainId: 'domain-a',
              domainName: 'Domain A',
              vignettes: [
                { definitionId: 'def-1', definitionName: 'Eval Vignette', definitionVersion: 1, signature: 'v1td', scenarioCount: 3 },
              ],
              models: [
                { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true },
              ],
              cellEstimates: [
                { definitionId: 'def-1', modelId: 'model-1', estimatedCost: 1.25 },
              ],
              totalEstimatedCost: 1.25,
              existingTemperatures: [],
              defaultTemperature: null,
              temperatureWarning: null,
            },
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      if (args.query === ESTIMATE_DOMAIN_EVALUATION_COST_QUERY) {
        return [{
          data: {
            estimateDomainEvaluationCost: {
              domainId: 'domain-a',
              domainName: 'Domain A',
              scopeCategory: 'PRODUCTION',
              targetedDefinitions: 1,
              totalScenarioCount: 3,
              totalEstimatedCost: 1.4,
              basedOnSampleCount: 50,
              isUsingFallback: false,
              fallbackReason: null,
              estimateConfidence: 'HIGH',
              knownExclusions: ['Judge/evaluator passes are not included yet.'],
              models: [],
              definitions: [],
              existingTemperatures: [],
              defaultTemperature: null,
              temperatureWarning: null,
            },
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      if (args.query === DOMAIN_RUN_SUMMARY_QUERY) {
        return [{
          data: {
            domainRunSummary: {
              domainId: 'domain-a',
              scopeCategory: null,
              totalEvaluations: 2,
              pendingEvaluations: 0,
              runningEvaluations: 1,
              completedEvaluations: 1,
              failedEvaluations: 0,
              cancelledEvaluations: 0,
              totalMemberRuns: 2,
              pendingMemberRuns: 0,
              runningMemberRuns: 1,
              completedMemberRuns: 1,
              failedMemberRuns: 0,
              cancelledMemberRuns: 0,
              pilotEvaluations: 0,
              productionEvaluations: 2,
              replicationEvaluations: 0,
              validationEvaluations: 0,
              latestEvaluationId: 'eval-1',
              latestEvaluationStatus: 'RUNNING',
              latestScopeCategory: 'PRODUCTION',
              latestEvaluationCreatedAt: '2026-03-15T12:00:00.000Z',
            },
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      if (args.query === DOMAIN_EVALUATIONS_QUERY) {
        return [{
          data: {
            domainEvaluations: [
              {
                id: 'eval-1',
                domainId: 'domain-a',
                domainNameAtLaunch: 'Domain A',
                scopeCategory: 'PRODUCTION',
                status: 'RUNNING',
                createdAt: '2026-03-15T12:00:00.000Z',
                startedAt: '2026-03-15T12:01:00.000Z',
                completedAt: null,
                startedRuns: 1,
                failedDefinitions: 0,
                skippedForBudget: 0,
                projectedCostUsd: 1.4,
                models: ['model-1'],
                temperature: null,
                maxBudgetUsd: null,
                memberCount: 1,
              },
            ],
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      if (args.query === DOMAIN_EVALUATION_QUERY) {
        return [{
          data: {
            domainEvaluation: {
              id: 'eval-1',
              domainId: 'domain-a',
              domainNameAtLaunch: 'Domain A',
              scopeCategory: 'PRODUCTION',
              status: 'RUNNING',
              createdAt: '2026-03-15T12:00:00.000Z',
              startedAt: '2026-03-15T12:01:00.000Z',
              completedAt: null,
              startedRuns: 1,
              failedDefinitions: 0,
              skippedForBudget: 0,
              projectedCostUsd: 1.4,
              models: ['model-1'],
              temperature: null,
              maxBudgetUsd: null,
              memberCount: 1,
              members: [
                {
                  runId: 'run-1',
                  definitionIdAtLaunch: 'def-1',
                  definitionNameAtLaunch: 'Eval Vignette',
                  domainIdAtLaunch: 'domain-a',
                  createdAt: '2026-03-15T12:01:00.000Z',
                  runStatus: 'RUNNING',
                  runCategory: 'PRODUCTION',
                  runStartedAt: '2026-03-15T12:01:00.000Z',
                  runCompletedAt: null,
                },
              ],
            },
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      if (args.query === DOMAIN_EVALUATION_STATUS_QUERY) {
        return [{
          data: {
            domainEvaluationStatus: {
              id: 'eval-1',
              status: 'RUNNING',
              totalRuns: 1,
              pendingRuns: 0,
              runningRuns: 1,
              completedRuns: 0,
              failedRuns: 0,
              cancelledRuns: 0,
            },
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      if (args.query === DOMAIN_TRIAL_RUNS_STATUS_QUERY) {
        return [{
          data: {
            domainTrialRunsStatus: [
              {
                runId: 'run-1',
                definitionId: 'def-1',
                status: 'RUNNING',
                modelStatuses: [
                  {
                    modelId: 'model-1',
                    generationCompleted: 1,
                    generationFailed: 0,
                    generationTotal: 3,
                    summarizationCompleted: 0,
                    summarizationFailed: 0,
                    summarizationTotal: 3,
                    latestErrorMessage: null,
                  },
                ],
              },
            ],
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }
      return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
    });
  });

  it('renders the domain evaluation summary and launch confirmation with scoped wording', async () => {
    const user = userEvent.setup();
    renderDomainTrialsDashboard();

    expect(screen.getByRole('heading', { name: /domain evaluation summary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /current cohort summary/i })).toBeInTheDocument();
    expect(screen.getAllByText(/eval vignette/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/domain evaluation summary is the cohort-level view/i)).toBeInTheDocument();
    expect(screen.getByText(/configuration review before launch/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review setup coverage/i })).toHaveAttribute('href', '/domains?domainId=domain-a&tab=setup&setupTab=contexts');
    expect(screen.getByRole('link', { name: /review vignette overrides/i })).toHaveAttribute('href', '/domains?domainId=domain-a&tab=vignettes');
    expect(screen.getByRole('link', { name: /open run diagnostics/i })).toHaveAttribute('href', '/runs/run-1');

    await user.selectOptions(screen.getByRole('combobox'), 'PILOT');
    await user.click(screen.getByRole('button', { name: /review & start domain evaluation/i }));

    expect(screen.getByRole('heading', { name: /confirm domain evaluation/i })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/domain evaluation scope:/i)).toHaveTextContent(/pilot/i);
    expect(within(dialog).getByText(/review before confirming/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/judge\/evaluator passes are not included yet/i)).toBeInTheDocument();
  });
});
