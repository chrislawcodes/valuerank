/**
 * Compare Page Integration Tests
 *
 * Tests for the full comparison flow:
 * - Run selection
 * - URL state persistence
 * - Visualization switching
 * - Filter application
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider as UrqlProvider } from 'urql';
import { Client, cacheExchange, fetchExchange } from 'urql';
import { Compare } from '../../src/pages/Compare';

// Mock urql client
const mockClient = new Client({
  url: 'http://localhost/graphql',
  exchanges: [cacheExchange, fetchExchange],
});

// Mock the hooks to provide controlled data
vi.mock('../../src/hooks/useComparisonData', () => ({
  useComparisonData: vi.fn(),
}));

import { useComparisonData } from '../../src/hooks/useComparisonData';
const mockUseComparisonData = vi.mocked(useComparisonData);

function createWrapper(initialPath = '/compare') {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(
      UrqlProvider,
      { value: mockClient },
      createElement(
        MemoryRouter,
        { initialEntries: [initialPath] },
        createElement(
          Routes,
          {},
          createElement(Route, { path: '/compare', element: children })
        )
      )
    );
  };
}

const mockAvailableRuns = [
  {
    id: 'run-1',
    name: null, // Uses algorithmic name
    definitionId: 'def-1',
    status: 'COMPLETED',
    config: { models: ['openai:gpt-4o'] },
    progress: { total: 100, completed: 100, failed: 0 },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    transcriptCount: 100,
    analysisStatus: 'CURRENT',
    analysis: {
      id: 'analysis-1',
      runId: 'run-1',
      analysisType: 'comprehensive',
      status: 'CURRENT',
      codeVersion: '1.0',
      inputHash: 'hash',
      createdAt: '2024-01-15T10:30:00Z',
      computedAt: null,
      durationMs: null,
      perModel: {
        'openai:gpt-4o': {
          sampleSize: 50,
          values: {},
          overall: { mean: 3.0, stdDev: 1.0, min: 1, max: 5 },
        },
      },
      modelAgreement: { pairwise: {}, outlierModels: [], overallAgreement: 0.85 },
      dimensionAnalysis: null,
      visualizationData: {
        decisionDistribution: { 'openai:gpt-4o': { '1': 10, '2': 15, '3': 20, '4': 12, '5': 8 } },
        modelScenarioMatrix: {},
      },
      mostContestedScenarios: [],
      methodsUsed: {
        winRateCI: 'wilson',
        modelComparison: 'spearman',
        pValueCorrection: 'bonferroni',
        effectSize: 'cohens_d',
        dimensionTest: 'kruskal_wallis',
        alpha: 0.05,
        codeVersion: '1.0',
      },
      warnings: [],
      summary: '',
    },
    definition: {
      id: 'def-1',
      name: 'Test Definition A',
      preamble: 'Test preamble',
      template: 'Test template',
      parentId: null,
      tags: [],
    },
  },
  {
    id: 'run-2',
    name: null, // Uses algorithmic name
    definitionId: 'def-2',
    status: 'COMPLETED',
    config: { models: ['openai:gpt-4o'] },
    progress: { total: 100, completed: 100, failed: 0 },
    startedAt: '2024-01-16T10:00:00Z',
    completedAt: '2024-01-16T10:30:00Z',
    createdAt: '2024-01-16T10:00:00Z',
    transcriptCount: 100,
    analysisStatus: 'CURRENT',
    analysis: {
      id: 'analysis-2',
      runId: 'run-2',
      analysisType: 'comprehensive',
      status: 'CURRENT',
      codeVersion: '1.0',
      inputHash: 'hash2',
      createdAt: '2024-01-16T10:30:00Z',
      computedAt: null,
      durationMs: null,
      perModel: {
        'openai:gpt-4o': {
          sampleSize: 60,
          values: {},
          overall: { mean: 3.5, stdDev: 0.9, min: 1, max: 5 },
        },
      },
      modelAgreement: { pairwise: {}, outlierModels: [], overallAgreement: 0.80 },
      dimensionAnalysis: null,
      visualizationData: {
        decisionDistribution: { 'openai:gpt-4o': { '1': 8, '2': 12, '3': 25, '4': 15, '5': 10 } },
        modelScenarioMatrix: {},
      },
      mostContestedScenarios: [],
      methodsUsed: {
        winRateCI: 'wilson',
        modelComparison: 'spearman',
        pValueCorrection: 'bonferroni',
        effectSize: 'cohens_d',
        dimensionTest: 'kruskal_wallis',
        alpha: 0.05,
        codeVersion: '1.0',
      },
      warnings: [],
      summary: '',
    },
    definition: {
      id: 'def-2',
      name: 'Test Definition B',
      preamble: 'Test preamble B',
      template: 'Test template B',
      parentId: null,
      tags: [],
    },
  },
];

describe('Compare Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: no runs selected, available runs loaded
    mockUseComparisonData.mockReturnValue({
      availableRuns: mockAvailableRuns,
      selectedRuns: [],
      statistics: null,
      loadingAvailable: false,
      loadingSelected: false,
      error: null,
      refetchAvailable: vi.fn(),
      missingAnalysisIds: [],
    });
  });

  describe('initial render', () => {
    it('renders page header', () => {
      render(<Compare />, { wrapper: createWrapper() });

      expect(screen.getByText('Compare Runs')).toBeInTheDocument();
      // Text may appear in multiple places, just verify it exists
      const selectRunsText = screen.getAllByText(/Select runs to compare/);
      expect(selectRunsText.length).toBeGreaterThan(0);
    });

    it('renders empty selection state when no runs selected', () => {
      render(<Compare />, { wrapper: createWrapper() });

      expect(screen.getByText('Cross-Run Comparison')).toBeInTheDocument();
      expect(screen.getByText(/Select 2 or more runs/)).toBeInTheDocument();
    });

    it('renders run selector with available runs', () => {
      render(<Compare />, { wrapper: createWrapper() });

      // Uses formatRunName - search by partial match
      // Definition name appears in both run name and small text, so use getAllByText
      expect(screen.getAllByText(/Test Definition A/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Test Definition B/).length).toBeGreaterThan(0);
    });
  });

  describe('run selection', () => {
    it('shows not enough runs state with 1 selected run', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: mockAvailableRuns,
        selectedRuns: [mockAvailableRuns[0]],
        statistics: null,
        loadingAvailable: false,
        loadingSelected: false,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1') });

      expect(screen.getByText('Not Enough Data')).toBeInTheDocument();
      expect(screen.getByText(/Only 1 run has analysis data/)).toBeInTheDocument();
    });

    it('shows visualization when 2+ runs selected', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: mockAvailableRuns,
        selectedRuns: mockAvailableRuns,
        statistics: {
          runPairs: [],
          commonModels: ['openai:gpt-4o'],
          uniqueModels: {},
          summary: { totalRuns: 2, totalSamples: 200, meanDecisionRange: [3.0, 3.5] },
        },
        loadingAvailable: false,
        loadingSelected: false,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2') });

      // Should show visualization navigation
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Decisions')).toBeInTheDocument();
      expect(screen.getByText('Values')).toBeInTheDocument();
    });
  });

  describe('visualization switching', () => {
    beforeEach(() => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: mockAvailableRuns,
        selectedRuns: mockAvailableRuns,
        statistics: {
          runPairs: [],
          commonModels: ['openai:gpt-4o'],
          uniqueModels: {},
          summary: { totalRuns: 2, totalSamples: 200, meanDecisionRange: [3.0, 3.5] },
        },
        loadingAvailable: false,
        loadingSelected: false,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });
    });

    it('shows overview visualization by default', () => {
      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2') });

      // Overview button should have active styling (teal color class)
      const overviewBtn = screen.getByRole('button', { name: /overview/i });
      expect(overviewBtn).toHaveClass('text-teal-600');
    });

    it('shows decisions visualization when selected', () => {
      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2&viz=decisions') });

      // Decisions button should have active styling
      const decisionsBtn = screen.getByRole('button', { name: /decisions/i });
      expect(decisionsBtn).toHaveClass('text-teal-600');
    });

    it('shows values visualization when selected', () => {
      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2&viz=values') });

      // Values button should have active styling
      const valuesBtn = screen.getByRole('button', { name: /values/i });
      expect(valuesBtn).toHaveClass('text-teal-600');
    });
  });

  describe('loading states', () => {
    it('shows loading when fetching available runs', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: [],
        selectedRuns: [],
        statistics: null,
        loadingAvailable: true,
        loadingSelected: false,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper() });

      // Run selector should show loading state
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows loading when fetching selected runs', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: mockAvailableRuns,
        selectedRuns: [],
        statistics: null,
        loadingAvailable: false,
        loadingSelected: true,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2') });

      expect(screen.getByText(/Loading run data/i)).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('shows error message when loading fails', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: [],
        selectedRuns: [],
        statistics: null,
        loadingAvailable: false,
        loadingSelected: false,
        error: new Error('Failed to load runs'),
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper() });

      expect(screen.getByText(/Failed to load runs/i)).toBeInTheDocument();
    });
  });

  describe('URL state persistence', () => {
    it('parses run IDs from URL', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: mockAvailableRuns,
        selectedRuns: mockAvailableRuns,
        statistics: {
          runPairs: [],
          commonModels: ['openai:gpt-4o'],
          uniqueModels: {},
          summary: { totalRuns: 2, totalSamples: 200, meanDecisionRange: [3.0, 3.5] },
        },
        loadingAvailable: false,
        loadingSelected: false,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2') });

      // Both runs should be shown - may appear in multiple places (selector + header)
      // Use getAllByText to verify they appear at least once
      const defAElements = screen.getAllByText('Test Definition A');
      const defBElements = screen.getAllByText('Test Definition B');
      expect(defAElements.length).toBeGreaterThan(0);
      expect(defBElements.length).toBeGreaterThan(0);
    });

    it('parses visualization from URL', () => {
      mockUseComparisonData.mockReturnValue({
        availableRuns: mockAvailableRuns,
        selectedRuns: mockAvailableRuns,
        statistics: {
          runPairs: [],
          commonModels: ['openai:gpt-4o'],
          uniqueModels: {},
          summary: { totalRuns: 2, totalSamples: 200, meanDecisionRange: [3.0, 3.5] },
        },
        loadingAvailable: false,
        loadingSelected: false,
        error: null,
        refetchAvailable: vi.fn(),
        missingAnalysisIds: [],
      });

      render(<Compare />, { wrapper: createWrapper('/compare?runs=run-1,run-2&viz=decisions') });

      const decisionsBtn = screen.getByRole('button', { name: /decisions/i });
      expect(decisionsBtn).toHaveClass('text-teal-600');
    });
  });
});
