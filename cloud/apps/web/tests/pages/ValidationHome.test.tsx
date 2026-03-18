import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValidationHome } from '../../src/pages/ValidationHome';
import {
  RUN_COUNT_QUERY,
  RUNS_QUERY,
} from '../../src/api/operations/runs';
import { TEMP_ZERO_VERIFICATION_REPORT_QUERY } from '../../src/api/operations/temp-zero-verification';
import { ORDER_INVARIANCE_REVIEW_QUERY } from '../../src/api/operations/order-invariance';

const useQueryMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

describe('ValidationHome', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: unknown }) => {
      if (args.query === RUN_COUNT_QUERY) {
        return [{ data: { runCount: 7 }, fetching: false, error: undefined }];
      }
      if (args.query === RUNS_QUERY) {
        return [{
          data: {
            runs: [
              {
                id: 'run-1',
                name: null,
                definitionId: 'def-1',
                definitionVersion: 1,
                experimentId: null,
                status: 'RUNNING',
                runCategory: 'VALIDATION',
                config: { models: ['model-1'] },
                progress: null,
                runProgress: null,
                summarizeProgress: null,
                startedAt: null,
                completedAt: null,
                createdAt: '2026-03-15T10:00:00.000Z',
                updatedAt: '2026-03-15T10:00:00.000Z',
                lastAccessedAt: null,
                transcripts: [],
                transcriptCount: 0,
                recentTasks: [],
                analysisStatus: null,
                executionMetrics: null,
                analysis: null,
                tags: [],
                definition: {
                  id: 'def-1',
                  name: 'Validation Definition',
                  version: 1,
                  content: {},
                  domain: { name: 'Professional Domain' },
                  tags: [],
                },
              },
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === TEMP_ZERO_VERIFICATION_REPORT_QUERY) {
        return [{
          data: {
            tempZeroVerificationReport: {
              generatedAt: '2026-03-15T11:00:00.000Z',
              transcriptCount: 120,
              batchTimestamp: '2026-03-15T09:00:00.000Z',
              models: [
                { modelId: 'model-1', transcriptCount: 60, adapterModes: ['explicit_temp_zero'], promptHashStabilityPct: 100, fingerprintDriftPct: 0, decisionMatchRatePct: 98 },
                { modelId: 'model-2', transcriptCount: 60, adapterModes: ['best_effort'], promptHashStabilityPct: 95, fingerprintDriftPct: 5, decisionMatchRatePct: 94 },
              ],
            },
          },
          fetching: false,
          error: undefined,
        }];
      }
      if (args.query === ORDER_INVARIANCE_REVIEW_QUERY) {
        return [{
          data: {
            assumptionsOrderInvarianceReview: {
              generatedAt: '2026-03-15T12:00:00.000Z',
              summary: {
                totalVignettes: 12,
                reviewedVignettes: 9,
                approvedVignettes: 7,
                rejectedVignettes: 2,
                pendingVignettes: 3,
                launchReady: false,
              },
              vignettes: [],
            },
          },
          fetching: false,
          error: undefined,
        }];
      }
      return [{ data: undefined, fetching: false, error: undefined }];
    });
  });

  it('renders live validation reporting plus links to validation run history and detailed surfaces', () => {
    render(
      <MemoryRouter>
        <ValidationHome />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /^validation$/i })).toBeInTheDocument();
    expect(screen.getByText(/total validation runs/i)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /validation run history/i })).toHaveAttribute('href', '/runs?runCategory=VALIDATION');
    expect(screen.getByText(/transcripts analyzed/i)).toBeInTheDocument();
    expect(screen.getByText(/launch readiness/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open temp=0 effect/i })).toHaveAttribute('href', '/assumptions/temp-zero-effect');
    expect(screen.getByRole('link', { name: /open legacy analysis/i })).toHaveAttribute('href', '/assumptions/analysis');
  });
});
