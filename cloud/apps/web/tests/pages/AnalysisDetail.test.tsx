/**
 * AnalysisDetail Page Tests
 *
 * Tests for the analysis detail page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnalysisDetail } from '../../src/pages/AnalysisDetail';

// Mock useRun hook
const mockUseRun = vi.fn();

vi.mock('../../src/hooks/useRun', () => ({
  useRun: () => mockUseRun(),
}));

// Mock AnalysisPanel to avoid complex setup
vi.mock('../../src/components/analysis/AnalysisPanel', () => ({
  AnalysisPanel: ({ runId }: { runId: string }) => (
    <div data-testid="analysis-panel">Analysis Panel for {runId}</div>
  ),
}));

function renderWithRouter(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/analysis/${runId}`]}>
      <Routes>
        <Route path="/analysis/:id" element={<AnalysisDetail />} />
        <Route path="/analysis" element={<div>Analysis List</div>} />
        <Route path="/runs/:id" element={<div>Run Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AnalysisDetail', () => {
  beforeEach(() => {
    mockUseRun.mockReset();
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

      expect(screen.getByText('Run not found')).toBeInTheDocument();
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
      expect(screen.getByText('View Run Details')).toBeInTheDocument();
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

      expect(screen.getByText('View Run')).toBeInTheDocument();
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

      expect(screen.getByText(/Run run-1234/)).toBeInTheDocument();
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
  });
});
