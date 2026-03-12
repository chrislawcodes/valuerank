/**
 * AnalysisDetail Page Tests
 *
 * Tests for the analysis detail page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
const mockUseAnalysis = vi.fn();

vi.mock('../../src/hooks/useRun', () => ({
  useRun: () => mockUseRun(),
}));

vi.mock('../../src/hooks/useRuns', () => ({
  useRuns: () => mockUseRuns(),
}));

vi.mock('../../src/hooks/useAnalysis', () => ({
  useAnalysis: () => mockUseAnalysis(),
}));

// Mock AnalysisPanel to avoid complex setup
vi.mock('../../src/components/analysis/AnalysisPanel', () => ({
  AnalysisPanel: ({ runId, isAggregate }: { runId: string; isAggregate?: boolean }) => (
    <div data-testid="analysis-panel" data-is-aggregate={String(isAggregate)}>
      Analysis Panel for {runId}
    </div>
  ),
}));

function renderWithRouter(runId: string) {
  return render(
    <Provider value={mockClient}>
      <MemoryRouter initialEntries={[`/analysis/${runId}`]}>
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
    mockUseAnalysis.mockReset();
    mockUseRuns.mockReturnValue({
      runs: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
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
          definition: { name: 'Test Definition' },
        },
        loading: false,
        error: null,
      });

      renderWithRouter('run-123');

      expect(screen.getByTestId('analysis-panel')).toBeInTheDocument();
      expect(screen.getByText('Analysis Panel for run-123')).toBeInTheDocument();
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
