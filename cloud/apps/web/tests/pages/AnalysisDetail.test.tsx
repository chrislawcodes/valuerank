/**
 * AnalysisDetail Page Tests
 *
 * Tests for the analysis detail page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Provider, createClient } from 'urql';
import { AnalysisDetail } from '../../src/pages/AnalysisDetail';

// Create a dummy urql client for testing
const mockClient = createClient({
  url: 'http://localhost:3000/graphql',
  exchanges: [],
});

// Mock useRun hook
const mockUseRun = vi.fn();
const mockUseRuns = vi.fn();
const mockUseInfiniteRuns = vi.fn();
const mockUseAnalysis = vi.fn();

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location-search">{location.search}</div>;
}

vi.mock('../../src/hooks/useRun', () => ({
  useRun: (args: unknown) => mockUseRun(args),
}));

vi.mock('../../src/hooks/useRuns', () => ({
  useRuns: (args: unknown) => mockUseRuns(args),
}));

vi.mock('../../src/hooks/useInfiniteRuns', () => ({
  useInfiniteRuns: (args: unknown) => mockUseInfiniteRuns(args),
}));

vi.mock('../../src/hooks/useAnalysis', () => ({
  useAnalysis: (args: unknown) => mockUseAnalysis(args),
}));

// Mock AnalysisPanel to avoid complex setup
vi.mock('../../src/components/analysis/AnalysisPanel', () => ({
  AnalysisPanel: ({
    runId,
    isAggregate,
    transcripts,
    analysisMode,
    coverageBatchCount,
    coveragePairedBatchCount,
    onAnalysisModeChange,
    onSingleVignetteChange,
    currentRun,
    companionRun,
  }: {
    runId: string;
    isAggregate?: boolean;
    transcripts?: Array<unknown>;
    analysisMode?: 'single' | 'paired';
    coverageBatchCount?: number | null;
    coveragePairedBatchCount?: number | null;
    onAnalysisModeChange?: (mode: 'single' | 'paired') => void;
    onSingleVignetteChange?: (runId: string) => void;
    currentRun?: { id: string; definition?: { name?: string | null } | null } | null;
    companionRun?: { id: string; definition?: { name?: string | null } | null } | null;
  }) => (
    <div
      data-testid="analysis-panel"
      data-is-aggregate={String(isAggregate)}
      data-transcript-count={String(transcripts?.length ?? 0)}
      data-analysis-mode={analysisMode ?? 'unset'}
      data-coverage-batch-count={String(coverageBatchCount ?? 'null')}
      data-coverage-paired-batch-count={String(coveragePairedBatchCount ?? 'null')}
    >
      Analysis Panel for {runId}
      <button type="button" aria-pressed={analysisMode === 'single'} onClick={() => onAnalysisModeChange?.('single')}>
        Single vignette
      </button>
      <button type="button" aria-pressed={analysisMode === 'paired'} onClick={() => onAnalysisModeChange?.('paired')}>
        Paired vignettes
      </button>
      {analysisMode === 'single' && companionRun ? (
        <label>
          Vignette
          <select
            aria-label="Vignette"
            value={runId}
            onChange={(event) => onSingleVignetteChange?.(event.target.value)}
          >
            <option value={currentRun?.id ?? runId}>{currentRun?.definition?.name ?? currentRun?.id ?? runId}</option>
            <option value={companionRun.id}>{companionRun.definition?.name ?? companionRun.id}</option>
          </select>
        </label>
      ) : null}
    </div>
  ),
}));

function renderWithRouter(runIdOrEntry: string) {
  const initialEntry = runIdOrEntry.startsWith('/') ? runIdOrEntry : `/analysis/${runIdOrEntry}`;

  return render(
    <Provider value={mockClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes>
          <Route path="/analysis/:id" element={<AnalysisDetail />} />
          <Route path="/analysis" element={<div>Analysis List</div>} />
          <Route path="/runs/:id" element={<div>Run Detail</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('AnalysisDetail', () => {
  beforeEach(() => {
    mockUseRun.mockReset();
    mockUseRuns.mockReset();
    mockUseInfiniteRuns.mockReset();
    mockUseAnalysis.mockReset();
    mockUseRuns.mockReturnValue({
      runs: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseInfiniteRuns.mockReturnValue({
      runs: [],
      loading: false,
      loadingMore: false,
      error: null,
      refetch: vi.fn(),
      items: [],
      hasNextPage: false,
      loadMore: vi.fn(),
      softRefetch: vi.fn(),
    });
    mockUseAnalysis.mockReturnValue({
      analysis: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      recompute: vi.fn(),
      recomputing: false,
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching', () => {
      mockUseRun.mockReturnValue({
        run: null,
        loading: true,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Loading analysis...')).toBeInTheDocument();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when fetch fails', () => {
      mockUseRun.mockReturnValue({
        run: null,
        loading: false,
        error: { message: 'Network error' },
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Failed to load analysis: Network error')).toBeInTheDocument();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  describe('Not Found State', () => {
    it('shows not found message when run does not exist', () => {
      mockUseRun.mockReturnValue({
        run: null,
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Trial not found')).toBeInTheDocument();
    });
  });

  describe('No Analysis State', () => {
    it('shows no analysis message when analysisStatus is null', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: null,
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('No Analysis Available')).toBeInTheDocument();
      expect(screen.getByText(/This trial does not have analysis data/)).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('renders AnalysisPanel when analysis is available', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          transcripts: [{ id: 'tx-1' }, { id: 'tx-2' }],
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByTestId('analysis-panel')).toBeInTheDocument();
      expect(screen.getByText('Analysis Panel for run-123')).toBeInTheDocument();
      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-transcript-count', '2');
    });

    it('renders AnalysisPanel for pending analysis', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'pending',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByTestId('analysis-panel')).toBeInTheDocument();
    });

    it('renders AnalysisPanel for computing analysis', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'computing',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByTestId('analysis-panel')).toBeInTheDocument();
    });

    it('uses mirroredRuns and skips the legacy run-list search', () => {
      const companionRun = {
        id: 'run-companion',
        analysisStatus: 'completed',
        definition: { name: 'Companion Definition' },
        createdAt: '2024-01-01T00:01:00Z',
      };

      mockUseRun.mockImplementation(({ id, pause }: { id: string; pause?: boolean }) => {
        if (pause || !id) {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        return {
          run: {
            id: 'run-123',
            analysisStatus: 'completed',
            mirroredRuns: [companionRun],
            config: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
              jobChoicePresentationOrder: 'A_first',
            },
            definition: {
              name: 'Achievement -> Benevolence',
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: 'A_first',
                },
              },
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      });
      mockUseInfiniteRuns.mockImplementation(({ pause }: { pause?: boolean }) => ({
        runs: [],
        loading: false,
        loadingMore: false,
        error: null,
        refetch: vi.fn(),
        items: [],
        hasNextPage: false,
        loadMore: vi.fn(),
        softRefetch: vi.fn(),
        pause,
      }));

      renderWithRouter('/analysis/run-123?mode=single');

      expect(screen.getByText('Analysis Panel for run-123')).toBeInTheDocument();
      expect(screen.getByLabelText('Vignette')).toBeInTheDocument();
      expect(mockUseInfiniteRuns).toHaveBeenCalled();
      expect(mockUseInfiniteRuns.mock.calls.some(([args]) => args?.pause === true)).toBe(true);
    });

    it('falls back to the legacy search when mirroredRuns are absent', () => {
      const legacyCompanionRun = {
        id: 'run-456',
        analysisStatus: 'completed',
        definition: { name: 'Benevolence -> Achievement' },
        createdAt: '2024-01-01T00:01:00Z',
      };

      mockUseRun.mockImplementation(({ id, pause }: { id: string; pause?: boolean }) => {
        if (pause || !id) {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        if (id === 'run-456') {
          return {
            run: legacyCompanionRun,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        if (id === 'missing-run') {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        return {
          run: {
            id: 'run-123',
            analysisStatus: 'completed',
            config: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
              jobChoicePresentationOrder: 'A_first',
            },
            definition: {
              name: 'Achievement -> Benevolence',
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: 'A_first',
                },
              },
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      });
      mockUseInfiniteRuns.mockImplementation(({ pause }: { pause?: boolean }) => ({
        runs: pause ? [] : [
          {
            id: legacyCompanionRun.id,
            analysisStatus: legacyCompanionRun.analysisStatus,
            config: {
              jobChoicePresentationOrder: 'B_first',
            },
            definition: {
              name: legacyCompanionRun.definition.name,
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: 'B_first',
                },
              },
            },
            createdAt: legacyCompanionRun.createdAt,
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        refetch: vi.fn(),
        items: [],
        hasNextPage: false,
        loadMore: vi.fn(),
        softRefetch: vi.fn(),
        pause,
      }));

      renderWithRouter('/analysis/run-123?mode=single');

      expect(screen.getByText('Analysis Panel for run-123')).toBeInTheDocument();
      expect(screen.getByLabelText('Vignette')).toBeInTheDocument();
      expect(mockUseInfiniteRuns).toHaveBeenCalled();
      expect(mockUseInfiniteRuns.mock.calls.some(([args]) => args?.pause === false)).toBe(true);
    });

    it('keeps paging through legacy run results until the companion appears', async () => {
      const loadMore = vi.fn();

      mockUseRun.mockImplementation(({ id, pause }: { id: string; pause?: boolean }) => {
        if (pause || !id) {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        if (id === 'missing-run') {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        if (id === 'run-456') {
          return {
            run: {
              id: 'run-456',
              analysisStatus: 'completed',
              config: {
                jobChoicePresentationOrder: 'B_first',
              },
              definition: {
                name: 'Benevolence -> Achievement',
                content: {
                  methodology: {
                    family: 'job-choice',
                    pair_key: 'pair-1',
                    presentation_order: 'B_first',
                  },
                },
              },
              createdAt: '2024-01-01T00:01:00Z',
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        return {
          run: {
            id: 'run-123',
            analysisStatus: 'completed',
            config: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
            },
            definition: {
              name: 'Achievement -> Benevolence',
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: 'A_first',
                },
              },
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      });
      mockUseInfiniteRuns.mockImplementation(({ pause }: { pause?: boolean }) => ({
        runs: pause ? [] : [
          {
            id: 'run-456',
            analysisStatus: 'completed',
            config: {
              jobChoicePresentationOrder: 'B_first',
            },
            definition: {
              name: 'Benevolence -> Achievement',
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: 'B_first',
                },
              },
            },
            createdAt: '2024-01-01T00:01:00Z',
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        refetch: vi.fn(),
        items: [],
        hasNextPage: true,
        loadMore,
        softRefetch: vi.fn(),
        pause,
      }));

      renderWithRouter('/analysis/run-123?mode=single');

      expect(screen.getByText('Analysis Panel for run-123')).toBeInTheDocument();
    });

    it('shows the analysis mode toggle and updates the URL when switched', async () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('/analysis/run-123');

      expect(screen.getByRole('button', { name: /single vignette/i })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /paired vignettes/i })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=overview&mode=single');

      fireEvent.click(screen.getByRole('button', { name: /paired vignettes/i }));

      // waitFor: interaction triggers async state update before DOM settles
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /single vignette/i })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: /paired vignettes/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=overview&mode=paired');
      });
    });

    it('passes coverage counts through when opened from a coverage cell', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('/analysis/run-123?mode=single&coverageBatchCount=5&coveragePairedBatchCount=2');

      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-analysis-mode', 'single');
      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-coverage-batch-count', '5');
      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-coverage-paired-batch-count', '2');
      expect(screen.getByTestId('location-search')).toHaveTextContent('mode=single');
      expect(screen.getByTestId('location-search')).toHaveTextContent('coverageBatchCount=5');
      expect(screen.getByTestId('location-search')).toHaveTextContent('coveragePairedBatchCount=2');
      expect(screen.getByTestId('location-search')).toHaveTextContent('tab=overview');
    });

    it('ignores invalid coverage count query params', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('/analysis/run-123?coverageBatchCount=abc&coveragePairedBatchCount=2.5');

      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-coverage-batch-count', 'null');
      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-coverage-paired-batch-count', 'null');
    });

    it('switches to the selected single vignette run and preserves single mode', async () => {
      mockUseRun.mockImplementation(({ id, pause }: { id: string; pause?: boolean }) => {
        if (pause || !id) {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        return {
          run: {
            id,
            analysisStatus: 'completed',
            config: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
              jobChoiceBatchGroupId: 'batch-1',
              jobChoicePresentationOrder: id === 'run-123' ? 'A_first' : 'B_first',
            },
            definition: {
              name: id === 'run-123' ? 'Achievement -> Benevolence' : 'Benevolence -> Achievement',
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: id === 'run-123' ? 'A_first' : 'B_first',
                },
              },
            },
            createdAt: id === 'run-123' ? '2024-01-01T00:00:00Z' : '2024-01-01T00:01:00Z',
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      });
      mockUseInfiniteRuns.mockReturnValue({
        runs: [
          {
            id: 'run-123',
            analysisStatus: 'completed',
            createdAt: '2024-01-01T00:00:00Z',
            config: {
              jobChoiceBatchGroupId: 'batch-1',
              jobChoicePresentationOrder: 'A_first',
            },
            definition: {
              name: 'Achievement -> Benevolence',
              content: { methodology: { pair_key: 'pair-1', presentation_order: 'A_first' } },
            },
          },
          {
            id: 'run-456',
            analysisStatus: 'completed',
            createdAt: '2024-01-01T00:01:00Z',
            config: {
              jobChoiceBatchGroupId: 'batch-1',
              jobChoicePresentationOrder: 'B_first',
            },
            definition: {
              name: 'Benevolence -> Achievement',
              content: { methodology: { pair_key: 'pair-1', presentation_order: 'B_first' } },
            },
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        refetch: vi.fn(),
        items: [],
        hasNextPage: false,
        loadMore: vi.fn(),
        softRefetch: vi.fn(),
      });

      renderWithRouter('/analysis/run-123?tab=scenarios');

      fireEvent.change(screen.getByLabelText('Vignette'), { target: { value: 'run-456' } });

      // waitFor: interaction triggers async state update before DOM settles
      await waitFor(() => {
        expect(screen.getByText('Analysis Panel for run-456')).toBeInTheDocument();
        expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=scenarios&mode=single');
      });
    });

    it('drops stale coverage counts when switching single vignette runs', async () => {
      mockUseRun.mockImplementation(({ id, pause }: { id: string; pause?: boolean }) => {
        if (pause || !id) {
          return {
            run: null,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        }

        return {
          run: {
            id,
            analysisStatus: 'completed',
            config: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
              jobChoiceBatchGroupId: 'batch-1',
              jobChoicePresentationOrder: id === 'run-123' ? 'A_first' : 'B_first',
            },
            definition: {
              name: id === 'run-123' ? 'Achievement -> Benevolence' : 'Benevolence -> Achievement',
              content: {
                methodology: {
                  family: 'job-choice',
                  pair_key: 'pair-1',
                  presentation_order: id === 'run-123' ? 'A_first' : 'B_first',
                },
              },
            },
            createdAt: id === 'run-123' ? '2024-01-01T00:00:00Z' : '2024-01-01T00:01:00Z',
          },
          loading: false,
          error: null,
          refetch: vi.fn(),
        };
      });
      mockUseInfiniteRuns.mockReturnValue({
        runs: [
          {
            id: 'run-123',
            analysisStatus: 'completed',
            createdAt: '2024-01-01T00:00:00Z',
            config: {
              jobChoiceBatchGroupId: 'batch-1',
              jobChoicePresentationOrder: 'A_first',
            },
            definition: {
              name: 'Achievement -> Benevolence',
              content: { methodology: { pair_key: 'pair-1', presentation_order: 'A_first' } },
            },
          },
          {
            id: 'run-456',
            analysisStatus: 'completed',
            createdAt: '2024-01-01T00:01:00Z',
            config: {
              jobChoiceBatchGroupId: 'batch-1',
              jobChoicePresentationOrder: 'B_first',
            },
            definition: {
              name: 'Benevolence -> Achievement',
              content: { methodology: { pair_key: 'pair-1', presentation_order: 'B_first' } },
            },
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        refetch: vi.fn(),
        items: [],
        hasNextPage: false,
        loadMore: vi.fn(),
        softRefetch: vi.fn(),
      });

      renderWithRouter('/analysis/run-123?tab=scenarios&coverageBatchCount=5&coveragePairedBatchCount=2');

      fireEvent.change(screen.getByLabelText('Vignette'), { target: { value: 'run-456' } });

      // waitFor: interaction triggers async state update before DOM settles
      await waitFor(() => {
        expect(screen.getByText('Analysis Panel for run-456')).toBeInTheDocument();
        expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=scenarios&mode=single');
        expect(screen.getByTestId('location-search')).not.toHaveTextContent('coverageBatchCount=');
        expect(screen.getByTestId('location-search')).not.toHaveTextContent('coveragePairedBatchCount=');
      });
    });

  });

  describe('Header Navigation', () => {
    it('shows back to analysis link', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Back to Analysis')).toBeInTheDocument();
    });

    it('shows view run link', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('View Trial')).toBeInTheDocument();
    });

    it('shows definition name in header', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: { name: 'Trolley Problem' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Trolley Problem')).toBeInTheDocument();
    });

    it('shows Job Choice and paired batch labels for Job Choice analysis', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: {
            name: 'Test Definition',
            content: {
              methodology: {
                family: 'job-choice',
              },
              components: {
                value_first: { token: 'achievement', body: '' },
                value_second: { token: 'power_dominance', body: '' },
              },
            },
            domain: {
              name: 'Job Choice',
            },
          },
          config: {
            jobChoiceLaunchMode: 'PAIRED_BATCH',
          },
          tags: [],
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Job Choice')).toBeInTheDocument();
      expect(screen.getByText('Paired Batch')).toBeInTheDocument();
    });

    it('shows Old V1 label for retained professional analysis', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: {
            name: 'Test Definition',
            content: null,
            domain: {
              name: 'professional',
            },
          },
          tags: [],
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Old V1')).toBeInTheDocument();
    });

    it('shows run ID in header', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-12345678-abcd',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-12345678-abcd');

      expect(screen.getByText(/Trial run-1234/)).toBeInTheDocument();
    });

    it('shows a user-facing unknown signature label when signature data is missing', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-12345678-abcd',
          analysisStatus: 'completed',
          definition: { name: 'Test Definition' },
          definitionVersion: null,
          config: null,
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-12345678-abcd');

      expect(screen.getByText('Unknown Signature')).toBeInTheDocument();
    });

    it('deduplicates aggregate signature options and shows the embedded run count', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'agg-run-2',
          analysisStatus: 'completed',
          definition: { id: 'def-1', name: 'Aggregate Definition' },
          definitionVersion: 2,
          config: { temperature: 0 },
          tags: [{ id: 'tag-agg', name: 'Aggregate' }],
        },
        loading: false,
        error: null,
      });
      mockUseRuns.mockReturnValue({
        runs: [
          {
            id: 'agg-run-1',
            definitionVersion: 2,
            config: { temperature: 0 },
            tags: [{ id: 'tag-agg', name: 'Aggregate' }],
          },
          {
            id: 'agg-run-2',
            definitionVersion: 2,
            config: { temperature: 0 },
            tags: [{ id: 'tag-agg', name: 'Aggregate' }],
          },
          {
            id: 'agg-run-3',
            definitionVersion: 2,
            config: { temperature: 0.7 },
            tags: [{ id: 'tag-agg', name: 'Aggregate' }],
          },
        ],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithRouter('agg-run-2');

      expect(screen.getByRole('option', { name: 'v2t0 (2 runs)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'v2t0.7' })).toBeInTheDocument();
    });

    it('shows unnamed definition when definition is missing', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          analysisStatus: 'completed',
          definition: null,
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Unnamed Definition')).toBeInTheDocument();
    });

    it('uses the canonical aggregate fallback when analysisType is AGGREGATE but tags are missing', () => {
      mockUseRun.mockReturnValue({
        run: {
          id: 'run-123',
          tags: [],
          analysisStatus: 'completed',
          definition: { id: 'def-1', name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });
      mockUseAnalysis.mockReturnValue({
        analysis: {
          analysisType: 'AGGREGATE',
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
        recompute: vi.fn(),
        recomputing: false,
      });

      renderWithRouter('run-123');

      expect(screen.getByText('Aggregate View')).toBeInTheDocument();
      expect(screen.queryByText('View Trial')).not.toBeInTheDocument();
      expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-is-aggregate', 'true');
    });
  });
});
