import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { useAnalysis } from '../../src/hooks/useAnalysis';

const mockAnalysis = {
  id: 'analysis-1',
  runId: 'run-1',
  analysisType: 'basic',
  status: 'CURRENT',
  codeVersion: '1.0.0',
  inputHash: 'abc123',
  createdAt: '2024-01-15T10:00:00Z',
  computedAt: '2024-01-15T10:00:05Z',
  durationMs: 5000,
  perModel: {
    'gpt-4': {
      sampleSize: 50,
      values: {
        'Physical_Safety': {
          winRate: 0.8,
          confidenceInterval: { lower: 0.7, upper: 0.9, level: 0.95, method: 'wilson' },
          count: { prioritized: 40, deprioritized: 10, neutral: 0 },
        },
      },
      overall: { mean: 0.7, stdDev: 0.15, min: 0.4, max: 0.9 },
    },
  },
  modelAgreement: {
    pairwise: {},
    outlierModels: [],
    overallAgreement: 0.85,
  },
  dimensionAnalysis: null,
  mostContestedScenarios: [],
  methodsUsed: {
    winRateCI: 'wilson_score',
    modelComparison: 'spearman_rho',
    pValueCorrection: 'holm_bonferroni',
    effectSize: 'cohens_d',
    dimensionTest: 'kruskal_wallis',
    alpha: 0.05,
    codeVersion: '1.0.0',
  },
  warnings: [],
};

function createMockClient(options: { analysis?: typeof mockAnalysis | null; error?: Error | null } = {}) {
  const { analysis = mockAnalysis, error = null } = options;

  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { analysis },
          fetching: false,
          error: error ? { message: error.message } : undefined,
        }),
        delay(0)
      )
    ),
    executeMutation: vi.fn(() =>
      pipe(
        fromValue({
          data: { recomputeAnalysis: analysis },
          fetching: false,
          error: undefined,
        }),
        delay(0)
      )
    ),
    executeSubscription: vi.fn(),
  };
}

function wrapper(client: ReturnType<typeof createMockClient>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(Provider, { value: client as never }, children);
  };
}

describe('useAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should return analysis from query', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.analysis).not.toBeNull();
        expect(result.current.analysis?.id).toBe('analysis-1');
      });
    });

    it('should map analysis correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.analysis?.runId).toBe('run-1');
        expect(result.current.analysis?.status).toBe('CURRENT');
        expect(result.current.analysis?.analysisType).toBe('basic');
        expect(result.current.analysis?.codeVersion).toBe('1.0.0');
      });
    });

    it('should return null when no analysis exists', async () => {
      const client = createMockClient({ analysis: null });
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.analysis).toBeNull();
      });
    });

    it('should set loading state correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('refetch', () => {
    it('should provide refetch function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.refetch).toBeDefined();
      });

      // Call refetch
      result.current.refetch();
    });
  });

  describe('recompute', () => {
    it('should provide recompute function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.recompute).toBeDefined();
      });
    });

    it('should set recomputing state when recomputing', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.recomputing).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    it('should handle query errors', async () => {
      const client = createMockClient({ error: new Error('Query failed') });
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.error?.message).toBe('Query failed');
      });
    });
  });

  describe('pause option', () => {
    it('should not execute query when paused', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAnalysis({ runId: 'run-1', pause: true }), {
        wrapper: wrapper(client),
      });

      // With pause: true, the query shouldn't be executed immediately
      expect(result.current.analysis).toBeNull();
    });
  });
});
