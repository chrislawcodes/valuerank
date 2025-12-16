/**
 * DefinitionDiff Component Tests
 *
 * Tests for the Monaco diff editor visualization for 2 runs.
 * Now shows full definition content in markdown format.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefinitionDiff } from '../../../../src/components/compare/visualizations/DefinitionDiff';
import type { RunWithAnalysis, DefinitionContent } from '../../../../src/components/compare/types';
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

function createMockDefinitionContent(
  overrides: Partial<DefinitionContent> = {}
): DefinitionContent {
  return {
    template: 'Test template content',
    preamble: 'Test preamble content',
    dimensions: [
      {
        name: 'TestDimension',
        levels: [
          { score: 1, label: 'Low', options: ['low option'] },
          { score: 5, label: 'High', options: ['high option'] },
        ],
      },
    ],
    matchingRules: '',
    ...overrides,
  };
}

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
      parentId: null,
      tags: [],
    },
    definitionContent: createMockDefinitionContent(),
    ...overrides,
  };
}

describe('DefinitionDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders Monaco DiffEditor with markdown content', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({ template: 'Left template' }),
      });
      const rightRun = createMockRun({
        id: 'run-2',
        definitionContent: createMockDefinitionContent({ template: 'Right template' }),
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

  describe('markdown format', () => {
    it('includes definition name as header', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definition: { ...createMockRun().definition!, name: 'My Definition' },
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('# My Definition');
    });

    it('includes preamble section', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({ preamble: 'Custom preamble text' }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('## Preamble');
      expect(screen.getByTestId('diff-original')).toHaveTextContent('Custom preamble text');
    });

    it('includes template section', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({ template: 'Custom template text' }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('## Template');
      expect(screen.getByTestId('diff-original')).toHaveTextContent('Custom template text');
    });

    it('includes dimensions section with table', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({
          dimensions: [
            {
              name: 'Value_A',
              levels: [
                { score: 1, label: 'Low stakes', options: ['option1'] },
                { score: 3, label: 'Medium stakes', options: ['option2'] },
              ],
            },
          ],
        }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      const content = screen.getByTestId('diff-original').textContent;
      expect(content).toContain('# Dimensions');
      expect(content).toContain('## Value_A');
      expect(content).toContain('| Score | Label | Options |');
      expect(content).toContain('| 1 | Low stakes | option1 |');
      expect(content).toContain('| 3 | Medium stakes | option2 |');
    });

    it('includes matching rules section when present', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({ matchingRules: 'Custom matching rules' }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('# Matching Rules');
      expect(screen.getByTestId('diff-original')).toHaveTextContent('Custom matching rules');
    });

    it('sorts dimension levels by score', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({
          dimensions: [
            {
              name: 'TestDim',
              levels: [
                { score: 5, label: 'High' },
                { score: 1, label: 'Low' },
                { score: 3, label: 'Medium' },
              ],
            },
          ],
        }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      const content = screen.getByTestId('diff-original').textContent ?? '';
      const lowIndex = content.indexOf('| 1 | Low');
      const mediumIndex = content.indexOf('| 3 | Medium');
      const highIndex = content.indexOf('| 5 | High');

      expect(lowIndex).toBeLessThan(mediumIndex);
      expect(mediumIndex).toBeLessThan(highIndex);
    });

    it('handles legacy dimension format with values array', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({
          dimensions: [
            {
              name: 'LegacyDim',
              values: ['Value 1', 'Value 2', 'Value 3'],
            },
          ],
        }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      const content = screen.getByTestId('diff-original').textContent;
      expect(content).toContain('## LegacyDim');
      expect(content).toContain('| Value 1 |');
      expect(content).toContain('| Value 2 |');
    });
  });

  describe('identical definitions', () => {
    it('shows identical message when full content matches', () => {
      const content = createMockDefinitionContent({
        template: 'Same template',
        preamble: 'Same preamble',
        dimensions: [],
        matchingRules: '',
      });
      const leftRun = createMockRun({
        id: 'run-1',
        definition: { ...createMockRun().definition!, name: 'Same Def' },
        definitionContent: content,
      });
      const rightRun = createMockRun({
        id: 'run-2',
        definition: { ...createMockRun().definition!, name: 'Same Def' },
        definitionContent: content,
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByText('Definitions are identical')).toBeInTheDocument();
      expect(screen.getByText('Both runs use the same definition content')).toBeInTheDocument();
    });

    it('does not show identical message when templates differ', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({ template: 'Template A' }),
      });
      const rightRun = createMockRun({
        id: 'run-2',
        definitionContent: createMockDefinitionContent({ template: 'Template B' }),
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.queryByText('Definitions are identical')).not.toBeInTheDocument();
    });

    it('does not show identical message when dimensions differ', () => {
      const leftRun = createMockRun({
        id: 'run-1',
        definitionContent: createMockDefinitionContent({
          dimensions: [{ name: 'DimA', levels: [{ score: 1, label: 'A' }] }],
        }),
      });
      const rightRun = createMockRun({
        id: 'run-2',
        definitionContent: createMockDefinitionContent({
          dimensions: [{ name: 'DimB', levels: [{ score: 1, label: 'B' }] }],
        }),
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

      expect(screen.getByTestId('diff-original')).toHaveTextContent(
        '(Definition content not available)'
      );
      expect(screen.getByTestId('diff-modified')).toHaveTextContent(
        '(Definition content not available)'
      );
    });

    it('shows fallback for empty template string', () => {
      const leftRun = createMockRun({
        definitionContent: createMockDefinitionContent({ template: '', preamble: '' }),
      });
      const rightRun = createMockRun({
        definitionContent: createMockDefinitionContent({ template: 'Has content', preamble: '' }),
      });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('(No template defined)');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('Has content');
    });

    it('shows fallback for empty preamble string', () => {
      const leftRun = createMockRun({
        definitionContent: createMockDefinitionContent({ preamble: '' }),
      });
      const rightRun = createMockRun({ id: 'run-2' });

      render(<DefinitionDiff leftRun={leftRun} rightRun={rightRun} />);

      expect(screen.getByTestId('diff-original')).toHaveTextContent('(No preamble defined)');
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
