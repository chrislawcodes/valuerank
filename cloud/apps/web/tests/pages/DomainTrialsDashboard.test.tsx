import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DomainTrialsDashboard } from '../../src/pages/DomainTrialsDashboard';
import {
  BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
  DOMAIN_EVALUATIONS_QUERY,
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_EVALUATION_STATUS_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  DOMAIN_TRIALS_PLAN_QUERY,
  ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  START_DOMAIN_EVALUATION_MUTATION,
} from '../../src/api/operations/domains';
import { LLM_MODELS_QUERY } from '../../src/api/operations/llm';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const useRunMock = vi.fn();
const startDomainEvaluationMock = vi.fn();
const backfillDomainEvaluationModelsMock = vi.fn();
const NOW = new Date().toISOString();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
    useMutation: (query: unknown) => useMutationMock(query),
  };
});

vi.mock('../../src/hooks/useRun', () => ({
  useRun: (...args: unknown[]) => useRunMock(...args),
}));

vi.mock('../../src/components/runs/RunProgress', () => ({
  RunProgress: () => <div>Run progress mock</div>,
}));

function renderDomainTrialsDashboard(initialEntries: string[] = ['/domains/domain-a/run-trials']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/domains/:domainId/run-trials" element={<DomainTrialsDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeRunDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    definitionId: 'def-1',
    experimentId: null,
    status: 'RUNNING',
    config: {
      models: ['model-1', 'model-2'],
      samplePercentage: 100,
    },
    runProgress: { total: 25, completed: 10, failed: 0, percentComplete: 40 },
    summarizeProgress: null,
    executionMetrics: null,
    startedAt: '2026-03-15T12:01:00.000Z',
    completedAt: null,
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:03:00.000Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 0,
    recentTasks: [],
    definition: {
      id: 'def-1',
      name: 'Jobs A',
    },
    runCategory: 'PRODUCTION',
    analysisStatus: 'computing',
    stalledModels: [],
    ...overrides,
  };
}

function mockSetupQueries() {
  useQueryMock.mockImplementation((args: { query: unknown }) => {
    if (args.query === DOMAIN_TRIALS_PLAN_QUERY) {
      return [{
        data: {
          domainTrialsPlan: {
            domainId: 'domain-a',
            domainName: 'Job domain',
            vignettes: [
              { definitionId: 'def-1', definitionName: 'Jobs A', definitionVersion: 1, signature: 'sig-a', scenarioCount: 25, existingBatchCount: 0 },
              { definitionId: 'def-2', definitionName: 'Jobs B', definitionVersion: 1, signature: 'sig-b', scenarioCount: 25, existingBatchCount: 0 },
            ],
            models: [
              { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true },
              { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true },
            ],
            cellEstimates: [
              { definitionId: 'def-1', modelId: 'model-1', estimatedCost: 42 },
              { definitionId: 'def-1', modelId: 'model-2', estimatedCost: 42 },
              { definitionId: 'def-2', modelId: 'model-1', estimatedCost: 42 },
              { definitionId: 'def-2', modelId: 'model-2', estimatedCost: 42 },
            ],
            totalEstimatedCost: 84,
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
            domainName: 'Job domain',
            scopeCategory: 'PRODUCTION',
            targetedDefinitions: 2,
            totalScenarioCount: 50,
            totalEstimatedCost: 84,
            basedOnSampleCount: 50,
            isUsingFallback: false,
            fallbackReason: null,
            estimateConfidence: 'HIGH',
            knownExclusions: [],
            models: [
              { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
              { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
            ],
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
    if (args.query === LLM_MODELS_QUERY) {
      return [{
        data: {
          llmModels: [
            {
              id: 'model-1-id',
              providerId: 'openai',
              modelId: 'model-1',
              displayName: 'Model One',
              costInputPerMillion: 1,
              costOutputPerMillion: 2,
              status: 'ACTIVE',
              isDefault: true,
              isAvailable: true,
              apiConfig: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
              provider: {
                id: 'openai',
                name: 'openai',
                displayName: 'OpenAI',
                maxParallelRequests: 5,
                requestsPerMinute: 100,
                isEnabled: true,
                balance: 100,
                lastSyncedAt: NOW,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                models: [],
              },
            },
            {
              id: 'model-2-id',
              providerId: 'anthropic',
              modelId: 'model-2',
              displayName: 'Model Two',
              costInputPerMillion: 1,
              costOutputPerMillion: 2,
              status: 'ACTIVE',
              isDefault: false,
              isAvailable: true,
              apiConfig: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
              provider: {
                id: 'anthropic',
                name: 'anthropic',
                displayName: 'Anthropic',
                maxParallelRequests: 5,
                requestsPerMinute: 100,
                isEnabled: true,
                balance: 100,
                lastSyncedAt: NOW,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                models: [],
              },
            },
          ],
        },
        fetching: false,
        error: undefined,
      }, vi.fn()];
    }
    if (args.query === DOMAIN_EVALUATIONS_QUERY) {
      return [{ data: { domainEvaluations: [] }, fetching: false, error: undefined }, vi.fn()];
    }
    if (args.query === DOMAIN_EVALUATION_QUERY) {
      return [{
        data: {
          domainEvaluation: null,
        },
        fetching: false,
        error: undefined,
      }, vi.fn()];
    }
    if (args.query === DOMAIN_EVALUATION_STATUS_QUERY) {
      return [{
        data: {
          domainEvaluationStatus: null,
        },
        fetching: false,
        error: undefined,
      }, vi.fn()];
    }
    if (args.query === DOMAIN_TRIAL_RUNS_STATUS_QUERY) {
      return [{ data: { domainTrialRunsStatus: [] }, fetching: false, error: undefined }, vi.fn()];
    }
    return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
  });
}

function mockActiveLaunchQueries() {
  useQueryMock.mockImplementation((args: { query: unknown }) => {
    if (args.query === DOMAIN_TRIALS_PLAN_QUERY) {
      return [{
        data: {
          domainTrialsPlan: {
            domainId: 'domain-a',
            domainName: 'Job domain',
            vignettes: [
              { definitionId: 'def-1', definitionName: 'Jobs A', definitionVersion: 1, signature: 'sig-a', scenarioCount: 25, existingBatchCount: 0 },
              { definitionId: 'def-2', definitionName: 'Jobs B', definitionVersion: 1, signature: 'sig-b', scenarioCount: 25, existingBatchCount: 0 },
            ],
            models: [
              { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true },
              { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true },
            ],
            cellEstimates: [
              { definitionId: 'def-1', modelId: 'model-1', estimatedCost: 42 },
              { definitionId: 'def-1', modelId: 'model-2', estimatedCost: 42 },
              { definitionId: 'def-2', modelId: 'model-1', estimatedCost: 42 },
              { definitionId: 'def-2', modelId: 'model-2', estimatedCost: 42 },
            ],
            totalEstimatedCost: 84,
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
            domainName: 'Job domain',
            scopeCategory: 'PRODUCTION',
            targetedDefinitions: 2,
            totalScenarioCount: 50,
            totalEstimatedCost: 84,
            basedOnSampleCount: 50,
            isUsingFallback: false,
            fallbackReason: null,
            estimateConfidence: 'HIGH',
            knownExclusions: [],
            models: [
              { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
              { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
            ],
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
    if (args.query === LLM_MODELS_QUERY) {
      return [{
        data: {
          llmModels: [
            {
              id: 'model-1-id',
              providerId: 'openai',
              modelId: 'model-1',
              displayName: 'Model One',
              costInputPerMillion: 1,
              costOutputPerMillion: 2,
              status: 'ACTIVE',
              isDefault: true,
              isAvailable: true,
              apiConfig: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
              provider: {
                id: 'openai',
                name: 'openai',
                displayName: 'OpenAI',
                maxParallelRequests: 5,
                requestsPerMinute: 100,
                isEnabled: true,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                models: [],
              },
            },
            {
              id: 'model-2-id',
              providerId: 'anthropic',
              modelId: 'model-2',
              displayName: 'Model Two',
              costInputPerMillion: 1,
              costOutputPerMillion: 2,
              status: 'ACTIVE',
              isDefault: false,
              isAvailable: true,
              apiConfig: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
              provider: {
                id: 'anthropic',
                name: 'anthropic',
                displayName: 'Anthropic',
                maxParallelRequests: 5,
                requestsPerMinute: 100,
                isEnabled: true,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                models: [],
              },
            },
          ],
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
              domainNameAtLaunch: 'Job domain',
              scopeCategory: 'PRODUCTION',
              status: 'RUNNING',
              createdAt: '2026-03-15T12:00:00.000Z',
              startedAt: '2026-03-15T12:01:00.000Z',
              completedAt: null,
              startedRuns: 2,
              failedDefinitions: 0,
              skippedForBudget: 0,
              projectedCostUsd: 84,
              models: ['model-1', 'model-2'],
              temperature: null,
              maxBudgetUsd: null,
              memberCount: 2,
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
            domainNameAtLaunch: 'Job domain',
            scopeCategory: 'PRODUCTION',
            status: 'RUNNING',
            createdAt: '2026-03-15T12:00:00.000Z',
            startedAt: '2026-03-15T12:01:00.000Z',
            completedAt: null,
            startedRuns: 2,
            failedDefinitions: 0,
            skippedForBudget: 0,
            projectedCostUsd: 84,
            models: ['model-1', 'model-2'],
            launchableDefinitionIds: ['def-1', 'def-2'],
            launchableDefinitions: [
              { definitionId: 'def-1', definitionName: 'Jobs A', pairKey: 'pair-1' },
              { definitionId: 'def-2', definitionName: 'Jobs B', pairKey: 'pair-1' },
            ],
            samplePercentage: 100,
            samplesPerScenario: 1,
            targetBatchCount: 1,
            temperature: null,
            maxBudgetUsd: null,
            memberCount: 2,
            members: [
              {
                runId: 'run-1',
                definitionIdAtLaunch: 'def-1',
                definitionNameAtLaunch: 'Jobs A',
                domainIdAtLaunch: 'domain-a',
                modelIds: ['model-1', 'model-2'],
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
                modelIds: ['model-1', 'model-2'],
                createdAt: '2026-03-15T12:01:00.000Z',
                runStatus: 'FAILED',
                runCategory: 'PRODUCTION',
                runStartedAt: '2026-03-15T12:01:00.000Z',
                runCompletedAt: '2026-03-15T12:04:00.000Z',
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
            totalRuns: 2,
            pendingRuns: 0,
            runningRuns: 1,
            completedRuns: 1,
            failedRuns: 1,
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
          ],
        },
        fetching: false,
        error: undefined,
      }, vi.fn()];
    }
    return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
  });
}

function mockBackfillQueries() {
  useQueryMock.mockImplementation((args: { query: unknown; variables?: Record<string, unknown> }) => {
    if (args.query === DOMAIN_TRIALS_PLAN_QUERY) {
      return [{
        data: {
          domainTrialsPlan: {
            domainId: 'domain-a',
            domainName: 'Job domain',
            vignettes: [
              { definitionId: 'def-1', definitionName: 'Jobs A', definitionVersion: 1, signature: 'sig-a', scenarioCount: 25, existingBatchCount: 1 },
              { definitionId: 'def-2', definitionName: 'Jobs B', definitionVersion: 1, signature: 'sig-b', scenarioCount: 25, existingBatchCount: 1 },
            ],
            models: [
              { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true },
              { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true },
            ],
            cellEstimates: [
              { definitionId: 'def-1', modelId: 'model-1', estimatedCost: 21 },
              { definitionId: 'def-1', modelId: 'model-2', estimatedCost: 21 },
              { definitionId: 'def-2', modelId: 'model-1', estimatedCost: 21 },
              { definitionId: 'def-2', modelId: 'model-2', estimatedCost: 21 },
            ],
            totalEstimatedCost: 84,
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
      if (args.variables?.modelIds && Array.isArray(args.variables.modelIds) && args.variables.modelIds[0] === 'model-2') {
        return [{
          data: {
            estimateDomainEvaluationCost: {
              domainId: 'domain-a',
              domainName: 'Job domain',
              scopeCategory: 'PRODUCTION',
              targetedDefinitions: 2,
              totalScenarioCount: 50,
              totalEstimatedCost: 42,
              basedOnSampleCount: 50,
              isUsingFallback: false,
              fallbackReason: null,
              estimateConfidence: 'HIGH',
              knownExclusions: [],
              models: [
                { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
              ],
              definitions: [
                { definitionId: 'def-1', definitionName: 'Jobs A', definitionVersion: 1, signature: 'sig-a', scenarioCount: 25, estimatedCost: 21, basedOnSampleCount: 50, isUsingFallback: false },
                { definitionId: 'def-2', definitionName: 'Jobs B', definitionVersion: 1, signature: 'sig-b', scenarioCount: 25, estimatedCost: 21, basedOnSampleCount: 50, isUsingFallback: false },
              ],
              existingTemperatures: [],
              defaultTemperature: null,
              temperatureWarning: null,
            },
          },
          fetching: false,
          error: undefined,
        }, vi.fn()];
      }

      return [{
        data: {
          estimateDomainEvaluationCost: {
            domainId: 'domain-a',
            domainName: 'Job domain',
            scopeCategory: 'PRODUCTION',
            targetedDefinitions: 2,
            totalScenarioCount: 50,
            totalEstimatedCost: 84,
            basedOnSampleCount: 50,
            isUsingFallback: false,
            fallbackReason: null,
            estimateConfidence: 'HIGH',
            knownExclusions: [],
            models: [
              { modelId: 'model-1', label: 'Model One', isDefault: true, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
              { modelId: 'model-2', label: 'Model Two', isDefault: false, supportsTemperature: true, estimatedCost: 42, basedOnSampleCount: 50, isUsingFallback: false },
            ],
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
    if (args.query === LLM_MODELS_QUERY) {
      return [{
        data: {
          llmModels: [
            {
              id: 'model-1-id',
              providerId: 'openai',
              modelId: 'model-1',
              displayName: 'Model One',
              costInputPerMillion: 1,
              costOutputPerMillion: 2,
              status: 'ACTIVE',
              isDefault: true,
              isAvailable: true,
              apiConfig: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
              provider: {
                id: 'openai',
                name: 'openai',
                displayName: 'OpenAI',
                maxParallelRequests: 5,
                requestsPerMinute: 100,
                isEnabled: true,
                balance: 100,
                lastSyncedAt: NOW,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                models: [],
              },
            },
            {
              id: 'model-2-id',
              providerId: 'anthropic',
              modelId: 'model-2',
              displayName: 'Model Two',
              costInputPerMillion: 1,
              costOutputPerMillion: 2,
              status: 'ACTIVE',
              isDefault: false,
              isAvailable: true,
              apiConfig: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
              provider: {
                id: 'anthropic',
                name: 'anthropic',
                displayName: 'Anthropic',
                maxParallelRequests: 5,
                requestsPerMinute: 100,
                isEnabled: true,
                balance: 100,
                lastSyncedAt: NOW,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
                models: [],
              },
            },
          ],
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
              domainNameAtLaunch: 'Job domain',
              scopeCategory: 'PRODUCTION',
              status: 'COMPLETED',
              createdAt: '2026-03-15T12:00:00.000Z',
              startedAt: '2026-03-15T12:01:00.000Z',
              completedAt: '2026-03-15T12:05:00.000Z',
              startedRuns: 2,
              failedDefinitions: 0,
              skippedForBudget: 0,
              projectedCostUsd: 84,
              models: ['model-1', 'model-2'],
              temperature: null,
              maxBudgetUsd: null,
              memberCount: 2,
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
            domainNameAtLaunch: 'Job domain',
            scopeCategory: 'PRODUCTION',
            status: 'COMPLETED',
            createdAt: '2026-03-15T12:00:00.000Z',
            startedAt: '2026-03-15T12:01:00.000Z',
            completedAt: '2026-03-15T12:05:00.000Z',
            startedRuns: 2,
            failedDefinitions: 0,
            skippedForBudget: 0,
            projectedCostUsd: 84,
            models: ['model-1', 'model-2'],
            launchableDefinitionIds: ['def-1', 'def-2'],
            launchableDefinitions: [
              { definitionId: 'def-1', definitionName: 'Jobs A', pairKey: 'pair-1' },
              { definitionId: 'def-2', definitionName: 'Jobs B', pairKey: 'pair-1' },
            ],
            samplePercentage: 100,
            samplesPerScenario: 1,
            targetBatchCount: 1,
            temperature: null,
            maxBudgetUsd: null,
            memberCount: 2,
            members: [
              {
                runId: 'run-1',
                definitionIdAtLaunch: 'def-1',
                definitionNameAtLaunch: 'Jobs A',
                domainIdAtLaunch: 'domain-a',
                modelIds: ['model-1'],
                createdAt: '2026-03-15T12:01:00.000Z',
                runStatus: 'COMPLETED',
                runCategory: 'PRODUCTION',
                runStartedAt: '2026-03-15T12:01:00.000Z',
                runCompletedAt: '2026-03-15T12:03:00.000Z',
              },
              {
                runId: 'run-2',
                definitionIdAtLaunch: 'def-2',
                definitionNameAtLaunch: 'Jobs B',
                domainIdAtLaunch: 'domain-a',
                modelIds: ['model-1'],
                createdAt: '2026-03-15T12:01:00.000Z',
                runStatus: 'COMPLETED',
                runCategory: 'PRODUCTION',
                runStartedAt: '2026-03-15T12:01:00.000Z',
                runCompletedAt: '2026-03-15T12:03:00.000Z',
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
            status: 'COMPLETED',
            totalRuns: 2,
            pendingRuns: 0,
            runningRuns: 0,
            completedRuns: 2,
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
              status: 'COMPLETED',
              updatedAt: '2026-03-15T12:04:00.000Z',
              stalledModels: [],
              analysisStatus: 'completed',
              modelStatuses: [],
            },
            {
              runId: 'run-2',
              definitionId: 'def-2',
              status: 'COMPLETED',
              updatedAt: '2026-03-15T12:04:00.000Z',
              stalledModels: [],
              analysisStatus: 'completed',
              modelStatuses: [],
            },
          ],
        },
        fetching: false,
        error: undefined,
      }, vi.fn()];
    }
    return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
  });
}

describe('DomainTrialsDashboard', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useRunMock.mockReset();
    startDomainEvaluationMock.mockReset();
    backfillDomainEvaluationModelsMock.mockReset();

    useMutationMock.mockImplementation((query: unknown) => {
      if (query === START_DOMAIN_EVALUATION_MUTATION) {
        return [{ fetching: false }, startDomainEvaluationMock];
      }
      if (query === BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION) {
        return [{ fetching: false }, backfillDomainEvaluationModelsMock];
      }
      return [{ fetching: false }, vi.fn()];
    });

    useRunMock.mockReturnValue({
      run: makeRunDetails(),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('renders setup-first copy and launch confirmation math', async () => {
    const user = userEvent.setup();
    mockSetupQueries();

    renderDomainTrialsDashboard();

    expect(screen.getByText('Domain Level Batches')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /job domain/i })).toBeInTheDocument();
    expect(screen.getByText('Job domain')).toBeInTheDocument();
    expect(screen.getByLabelText(/target number of paired batches per vignette/i)).toHaveValue(1);
    expect(screen.getByText('Provider Budget Estimates')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /review & start paired batches/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /review & start paired batches/i }));

    expect(screen.getByRole('heading', { name: /confirm domain level batches/i })).toBeInTheDocument();
    expect(screen.getByText(/target paired batches per vignette:/i)).toHaveTextContent('1');
    expect(screen.getByText(/total paired batches:/i)).toHaveTextContent('2');
    expect(screen.getByText(/total individual trial runs:/i)).toHaveTextContent('4');
  });

  it('shows live status rows and opens a details drawer from a row click', async () => {
    const user = userEvent.setup();
    mockActiveLaunchQueries();

    renderDomainTrialsDashboard(['/domains/domain-a/run-trials?evaluationId=eval-1']);

    expect(screen.getByText('Live processing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /needs attention/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review & start paired batches/i })).toBeDisabled();

    // Click the batch ID text (not the vignette name link) to open the drawer
    await user.click(screen.getByText('Batch run-1'));

    expect(screen.getByText('Run progress mock')).toBeInTheDocument();
    expect(screen.getByText('Recent task log')).toBeInTheDocument();
    expect(screen.getByText('Recent transcripts')).toBeInTheDocument();
    expect(screen.getByText('Open run diagnostics')).toBeInTheDocument();
  });

  it('lets the user backfill a missing model into the existing batch', async () => {
    const user = userEvent.setup();
    mockBackfillQueries();
    backfillDomainEvaluationModelsMock.mockResolvedValue({
      data: {
        backfillDomainEvaluationModels: {
          domainEvaluationId: 'eval-1',
          scopeCategory: 'PRODUCTION',
          success: true,
          totalDefinitions: 2,
          targetedDefinitions: 2,
          startedRuns: 2,
          failedDefinitions: 0,
          skippedForBudget: 0,
          projectedCostUsd: 42,
          blockedByActiveLaunch: false,
          runs: [
            { definitionId: 'def-1', runId: 'run-3', modelIds: ['model-2'] },
            { definitionId: 'def-2', runId: 'run-4', modelIds: ['model-2'] },
          ],
        },
      },
      error: undefined,
    });

    renderDomainTrialsDashboard(['/domains/domain-a/run-trials?evaluationId=eval-1']);

    expect(screen.getByRole('heading', { name: /missing model backfill/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/backfill target number of paired batches per vignette/i)).toHaveValue(1);
    expect(screen.getByText(/selected model:/i)).toHaveTextContent('Model Two');
    expect(screen.getByText(/new paired batch groups:/i)).toHaveTextContent('1');
    expect(screen.getByText(/new individual trial runs:/i)).toHaveTextContent('2');
    expect(screen.getByText(/estimated additional cost:/i)).toHaveTextContent('$42.00');

    await user.click(screen.getByRole('button', { name: /review & start missing model backfill/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /confirm missing model backfill/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/existing batch:/i)).toHaveTextContent('eval-1');
    expect(within(dialog).getByText(/^model:/i)).toHaveTextContent('Model Two');

    await user.click(screen.getByRole('button', { name: /start backfill/i }));

    expect(backfillDomainEvaluationModelsMock).toHaveBeenCalledWith({
      domainEvaluationId: 'eval-1',
      modelIds: ['model-2'],
      targetBatchCount: 1,
    });
  });
});
