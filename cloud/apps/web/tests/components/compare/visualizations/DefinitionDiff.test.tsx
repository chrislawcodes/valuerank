/**
 * DefinitionDiff Component Tests
 *
 * Tests for the Monaco diff editor visualization for 2 runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefinitionDiff } from '../../../../src/components/compare/visualizations/DefinitionDiff';
import type { RunWithAnalysis } from '../../../../src/components/compare/types';
import type { ComparisonRun } from '../../../../src/api/operations/comparison';

// Mock Monaco DiffEditor
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="mock-diff-editor">
      <div data-testid="diff-original">{original}</div>
      <div data-testid="diff-modified">{modified}</div>
    </div>
  ),
}));

function createMockRun(overrides: Partial<ComparisonRun & RunWithAnalysis> = {}): RunWithAnalysis {
  return {
    id: 'run-1',
    name: 'Test Run',
    definitionId: 'def-1',
    status: 'COMPLETED',
    config: { models: ['openai:gpt-4o'] },
    progress: { total: 100, completed: 100, failed: 0 },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    transcriptCount: 100,
    analysisStatus: 'CURRENT',
    analysis: null,
    definition: {
      id: 'def-1',
      name: 'Test Definition',
      preamble: 'Test preamble',
      template: 'Test template',
      parentId: null,
      tags: [],
    },
    definitionContent: {
      template: 'Test template content',
      preamble: 'Test preamble content',
    },
    ...overrides,
  };
}

describe('DefinitionDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders Monaco DiffEditor with correct content', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: { template: 'Left template', preamble: 'Left preamble' },
      });
      const rightRun = createMockRun({
        id: 'run-2',
        definitionContent: { template: 'Right template', preamble: 'Right preamble' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
      expect(screen.getByTestId('diff-original')).toHaveTextContent('Left template');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('Right template');
    });

    it('displays run names in header', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        name: 'Run Alpha',
        definition: { ...createMockRun().definition!, name: 'Definition A' },
      });
      const rightRun = createMockRun({
        id: 'run-2',
        name: 'Run Beta',
        definition: { ...createMockRun().definition!, name: 'Definition B' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByText('Run Alpha')).toBeInTheDocument();
      expect(screen.getByText('Run Beta')).toBeInTheDocument();
      expect(screen.getByText('Definition A')).toBeInTheDocument();
      expect(screen.getByText('Definition B')).toBeInTheDocument();
    });

    it('displays Original and Modified labels', () => {
      const leftRun = createMockRun({ id: 'run-1' });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.getByText('Modified')).toBeInTheDocument();
    });
  });

  describe('tab switching', () => {
    it('defaults to Template tab', () => {
      const leftRun = createMockRun({
        definitionContent: { template: 'Template A', preamble: 'Preamble A' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Template B', preamble: 'Preamble B' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('Template A');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('Template B');
    });

    it('switches to Preamble tab when clicked', async () => {
      const user = userEvent.setup();
      const leftRun = createMockRun({
        definitionContent: { template: 'Template A', preamble: 'Preamble A' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Template B', preamble: 'Preamble B' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      await user.click(screen.getByText('Preamble'));

      expect(screen.getByTestId('diff-original')).toHaveTextContent('Preamble A');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('Preamble B');
    });

    it('hides Preamble tab when both runs have no preamble', () => {
      const leftRun = createMockRun({
        definitionContent: { template: 'Template A', preamble: '' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Template B', preamble: '' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.queryByText('Preamble')).not.toBeInTheDocument();
    });

    it('shows Preamble tab when at least one run has preamble', () => {
      const leftRun = createMockRun({
        definitionContent: { template: 'Template A', preamble: 'Has preamble' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Template B', preamble: '' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByText('Preamble')).toBeInTheDocument();
    });
  });

  describe('identical definitions', () => {
    it('shows identical message when templates and preambles match', () => {
      const content = { template: 'Same template', preamble: 'Same preamble' };
      const leftRun = createMockRun({ definitionContent: content });
      const rightRun = createMockRun({ definitionContent: content });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByText('Definitions are identical')).toBeInTheDocument();
      expect(screen.getByText('Both runs use the same definition content')).toBeInTheDocument();
    });

    it('does not show identical message when templates differ', () => {
      const leftRun = createMockRun({
        definitionContent: { template: 'Template A', preamble: 'Same' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Template B', preamble: 'Same' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.queryByText('Definitions are identical')).not.toBeInTheDocument();
    });

    it('does not show identical message when preambles differ', () => {
      const leftRun = createMockRun({
        definitionContent: { template: 'Same', preamble: 'Preamble A' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Same', preamble: 'Preamble B' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.queryByText('Definitions are identical')).not.toBeInTheDocument();
    });
  });

  describe('missing content', () => {
    it('shows placeholder when definitionContent is undefined', () => {
      const leftRun = createMockRun({ definitionContent: undefined });
      const rightRun = createMockRun({ definitionContent: undefined });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('(Definition content not available)');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('(Definition content not available)');
    });

    it('shows fallback for empty template string', () => {
      const leftRun = createMockRun({
        definitionContent: { template: '', preamble: '' },
      });
      const rightRun = createMockRun({
        definitionContent: { template: 'Has content', preamble: '' },
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      // Empty string becomes "(No template defined)"
      expect(screen.getByTestId('diff-original')).toHaveTextContent('(No template defined)');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('Has content');
    });
  });

  describe('copy functionality', () => {
    it('renders copy buttons', () => {
      const leftRun = createMockRun({ id: 'run-1' });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByText('Copy Left')).toBeInTheDocument();
      expect(screen.getByText('Copy Right')).toBeInTheDocument();
    });

    it('copy buttons have correct titles', () => {
      const leftRun = createMockRun({ id: 'run-1' });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTitle('Copy Left to clipboard')).toBeInTheDocument();
      expect(screen.getByTitle('Copy Right to clipboard')).toBeInTheDocument();
    });
  });
});
