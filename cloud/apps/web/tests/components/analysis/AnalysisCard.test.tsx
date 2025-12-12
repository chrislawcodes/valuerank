/**
 * AnalysisCard Component Tests
 *
 * Tests for the analysis card component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisCard } from '../../../src/components/analysis/AnalysisCard';
import type { Run } from '../../../src/api/operations/runs';

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-12345678-abcd',
    name: null, // Uses algorithmic name
    definitionId: 'def-1',
    experimentId: null,
    status: 'COMPLETED',
    config: {
      models: ['gpt-4', 'claude-3'],
    },
    progress: { total: 10, completed: 10, failed: 0 },
    runProgress: {
      total: 10,
      completed: 10,
      failed: 0,
      percentComplete: 100,
    },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:10:00Z',
    createdAt: '2024-01-15T09:55:00Z',
    updatedAt: '2024-01-15T10:10:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 10,
    recentTasks: [],
    analysisStatus: 'completed',
    executionMetrics: null,
    analysis: null,
    definition: {
      id: 'def-1',
      name: 'Test Definition',
      tags: [],
    },
    ...overrides,
  };
}

describe('AnalysisCard', () => {
  it('renders run information', () => {
    const run = createMockRun();
    render(<AnalysisCard run={run} />);

    // Run name shows in h3 as "Run: Test Definition on Jan 15, 2024"
    expect(screen.getByText(/Run:.*Test Definition/)).toBeInTheDocument();
    // Definition name shows in small text
    expect(screen.getByText(/Test Definition.*·/)).toBeInTheDocument();
  });

  it('shows model count', () => {
    const run = createMockRun({ config: { models: ['gpt-4', 'claude-3', 'gemini'] } });
    render(<AnalysisCard run={run} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
  });

  it('shows transcript count', () => {
    const run = createMockRun({ transcriptCount: 25 });
    render(<AnalysisCard run={run} />);

    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('Transcripts')).toBeInTheDocument();
  });

  it('calls onClick when clicked for completed analysis', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const run = createMockRun({ analysisStatus: 'completed' });
    render(<AnalysisCard run={run} onClick={onClick} />);

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when analysis is computing', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const run = createMockRun({ analysisStatus: 'computing' });
    render(<AnalysisCard run={run} onClick={onClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('is disabled when analysis is pending', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const run = createMockRun({ analysisStatus: 'pending' });
    render(<AnalysisCard run={run} onClick={onClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('renders different status badges', () => {
    const statuses = ['completed', 'pending', 'computing', 'failed'] as const;
    const labels = ['Current', 'Pending', 'Computing', 'Failed'];

    statuses.forEach((status, index) => {
      const { unmount } = render(<AnalysisCard run={createMockRun({ analysisStatus: status })} />);
      expect(screen.getByText(labels[index])).toBeInTheDocument();
      unmount();
    });
  });

  it('handles missing definition name', () => {
    const run = createMockRun({ definition: undefined as unknown as Run['definition'] });
    render(<AnalysisCard run={run} />);

    // Shows "Run: Unknown on <date>" in h3 and "Unnamed Definition" in small text
    expect(screen.getByText(/Run:.*Unknown/)).toBeInTheDocument();
    expect(screen.getByText(/Unnamed Definition.*·/)).toBeInTheDocument();
  });

  it('shows tags when present', () => {
    const run = createMockRun({
      definition: {
        id: 'def-1',
        name: 'Test Definition',
        tags: [
          { id: 'tag-1', name: 'Ethics' },
          { id: 'tag-2', name: 'Safety' },
        ],
      },
    });
    render(<AnalysisCard run={run} />);

    expect(screen.getByText('Ethics')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
  });

  it('shows +N for more than 3 tags', () => {
    const run = createMockRun({
      definition: {
        id: 'def-1',
        name: 'Test Definition',
        tags: [
          { id: 'tag-1', name: 'Ethics' },
          { id: 'tag-2', name: 'Safety' },
          { id: 'tag-3', name: 'Research' },
          { id: 'tag-4', name: 'Production' },
        ],
      },
    });
    render(<AnalysisCard run={run} />);

    expect(screen.getByText('Ethics')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
  });

  it('uses completedAt for display date when available', () => {
    const run = createMockRun({
      createdAt: '2024-01-15T09:55:00Z',
      completedAt: '2024-01-15T10:10:00Z',
    });
    render(<AnalysisCard run={run} />);

    // The card shows the date in multiple places (run name and small text)
    const dateElements = screen.getAllByText(/Jan 15/i);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it('uses createdAt for display date when completedAt is null', () => {
    const run = createMockRun({
      createdAt: '2024-01-15T09:55:00Z',
      completedAt: null,
    });
    render(<AnalysisCard run={run} />);

    // The card shows the date in multiple places
    const dateElements = screen.getAllByText(/Jan 15/i);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it('handles null analysisStatus gracefully', () => {
    const run = createMockRun({ analysisStatus: null });
    render(<AnalysisCard run={run} />);

    // Should default to 'Pending' status
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
