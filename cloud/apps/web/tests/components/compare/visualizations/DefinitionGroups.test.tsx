/**
 * DefinitionGroups Component Tests
 *
 * Tests for the card layout visualization for 3+ runs.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefinitionGroups } from '../../../../src/components/compare/visualizations/DefinitionGroups';
import type { RunWithAnalysis } from '../../../../src/components/compare/types';
import type { ComparisonRun } from '../../../../src/api/operations/comparison';

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

describe('DefinitionGroups', () => {
  describe('summary header', () => {
    it('shows correct count for single definition', () => {
      const sharedDef = { ...createMockRun().definition!, id: 'def-1', name: 'Shared Definition' };
      const runs = [
        createMockRun({ id: 'run-1', definition: sharedDef }),
        createMockRun({ id: 'run-2', definition: sharedDef }),
        createMockRun({ id: 'run-3', definition: sharedDef }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('1 definition across 3 runs')).toBeInTheDocument();
    });

    it('shows correct count for multiple definitions', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' },
        }),
        createMockRun({
          id: 'run-3',
          definition: { ...createMockRun().definition!, id: 'def-C', name: 'Definition C' },
        }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('3 definitions across 3 runs')).toBeInTheDocument();
    });

    it('shows message for single definition case', () => {
      const sharedDef = { ...createMockRun().definition!, id: 'def-1', name: 'Shared Definition' };
      const runs = [
        createMockRun({ id: 'run-1', definition: sharedDef }),
        createMockRun({ id: 'run-2', definition: sharedDef }),
        createMockRun({ id: 'run-3', definition: sharedDef }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('All selected runs use the same definition')).toBeInTheDocument();
    });

    it('shows message for multiple definitions case', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' },
        }),
        createMockRun({
          id: 'run-3',
          definition: { ...createMockRun().definition!, id: 'def-C', name: 'Definition C' },
        }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('Select exactly 2 runs to see a detailed diff view')).toBeInTheDocument();
    });
  });

  describe('grouping by definition', () => {
    it('groups runs by definition ID correctly', () => {
      const defA = { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' };
      const defB = { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' };
      const runs = [
        createMockRun({ id: 'run-1', name: 'Run One', definition: defA }),
        createMockRun({ id: 'run-2', name: 'Run Two', definition: defA }),
        createMockRun({ id: 'run-3', name: 'Run Three', definition: defB }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('Definition A')).toBeInTheDocument();
      expect(screen.getByText('Definition B')).toBeInTheDocument();
    });

    it('shows correct run count per group', () => {
      const defA = { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' };
      const defB = { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' };
      const runs = [
        createMockRun({ id: 'run-1', definition: defA }),
        createMockRun({ id: 'run-2', definition: defA }),
        createMockRun({ id: 'run-3', definition: defB }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('2 runs')).toBeInTheDocument();
      expect(screen.getByText('1 run')).toBeInTheDocument();
    });

    it('displays run badges in each card', () => {
      const sharedDef = { ...createMockRun().definition!, id: 'def-1' };
      const runs = [
        createMockRun({ id: 'run-1', name: 'Alpha Run', definition: sharedDef }),
        createMockRun({ id: 'run-2', name: 'Beta Run', definition: sharedDef }),
        createMockRun({ id: 'run-3', name: 'Gamma Run', definition: sharedDef }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('Alpha Run')).toBeInTheDocument();
      expect(screen.getByText('Beta Run')).toBeInTheDocument();
      expect(screen.getByText('Gamma Run')).toBeInTheDocument();
    });
  });

  describe('template preview', () => {
    it('shows template preview text', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definitionContent: { template: 'This is the template content', preamble: '' },
        }),
        createMockRun({
          id: 'run-2',
          definitionContent: { template: 'Different template', preamble: '' },
        }),
        createMockRun({
          id: 'run-3',
          definitionContent: { template: 'Another template', preamble: '' },
        }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('This is the template content')).toBeInTheDocument();
    });

    it('truncates long template text', () => {
      const longTemplate = 'A'.repeat(400);
      const runs = [
        createMockRun({
          id: 'run-1',
          definitionContent: { template: longTemplate, preamble: '' },
        }),
        createMockRun({ id: 'run-2' }),
        createMockRun({ id: 'run-3' }),
      ];

      render(<DefinitionGroups runs={runs} />);

      // Should show truncated text with ellipsis
      const preview = screen.getByText(/A{100,}\.{3}/);
      expect(preview).toBeInTheDocument();
    });

    it('shows Template Preview label', () => {
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2' }),
        createMockRun({ id: 'run-3' }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText('Template Preview')).toBeInTheDocument();
    });
  });

  describe('preamble indicator', () => {
    it('shows preamble indicator when preamble exists', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definitionContent: { template: 'Template', preamble: 'This is a preamble' },
        }),
        createMockRun({ id: 'run-2' }),
        createMockRun({ id: 'run-3' }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.getByText(/Has preamble \(\d+ chars\)/)).toBeInTheDocument();
    });

    it('does not show preamble indicator when preamble is empty', () => {
      const sharedDef = { ...createMockRun().definition!, id: 'def-1' };
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: sharedDef,
          definitionContent: { template: 'Template', preamble: '' },
        }),
        createMockRun({
          id: 'run-2',
          definition: sharedDef,
          definitionContent: { template: 'Template', preamble: '' },
        }),
        createMockRun({
          id: 'run-3',
          definition: sharedDef,
          definitionContent: { template: 'Template', preamble: '' },
        }),
      ];

      render(<DefinitionGroups runs={runs} />);

      expect(screen.queryByText(/Has preamble/)).not.toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('sorts groups by run count descending', () => {
      const defA = { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' };
      const defB = { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' };
      const runs = [
        createMockRun({ id: 'run-1', definition: defB }),
        createMockRun({ id: 'run-2', definition: defA }),
        createMockRun({ id: 'run-3', definition: defA }),
        createMockRun({ id: 'run-4', definition: defA }),
      ];

      render(<DefinitionGroups runs={runs} />);

      // Get all definition headers
      const headers = screen.getAllByRole('heading', { level: 3 });

      // Definition A should be first (3 runs) then Definition B (1 run)
      expect(headers[0]).toHaveTextContent('Definition A');
      expect(headers[1]).toHaveTextContent('Definition B');
    });
  });
});
