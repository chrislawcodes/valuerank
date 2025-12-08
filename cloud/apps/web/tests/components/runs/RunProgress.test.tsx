/**
 * RunProgress Component Tests
 *
 * Tests for the run progress display component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunProgress } from '../../../src/components/runs/RunProgress';
import type { Run } from '../../../src/api/operations/runs';

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    definitionId: 'def-1',
    experimentId: null,
    status: 'RUNNING',
    config: {
      models: ['gpt-4', 'claude-3'],
      samplePercentage: 100,
    },
    progress: { total: 100, completed: 50, failed: 0 },
    runProgress: {
      total: 100,
      completed: 50,
      failed: 0,
      percentComplete: 50,
    },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: null,
    createdAt: '2024-01-15T09:55:00Z',
    updatedAt: '2024-01-15T10:05:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 0,
    recentTasks: [],
    definition: {
      id: 'def-1',
      name: 'Test Definition',
    },
    ...overrides,
  };
}

describe('RunProgress', () => {
  it('renders status badge for running state', () => {
    const run = createMockRun({ status: 'RUNNING' });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders status badge for completed state', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      runProgress: { total: 100, completed: 100, failed: 0, percentComplete: 100 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders status badge for failed state', () => {
    const run = createMockRun({ status: 'FAILED' });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders status badge for paused state', () => {
    const run = createMockRun({ status: 'PAUSED' });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('renders status badge for pending state', () => {
    const run = createMockRun({
      status: 'PENDING',
      runProgress: { total: 100, completed: 0, failed: 0, percentComplete: 0 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders status badge for cancelled state', () => {
    const run = createMockRun({ status: 'CANCELLED' });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows progress count', () => {
    const run = createMockRun({
      runProgress: { total: 100, completed: 50, failed: 0, percentComplete: 50 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('50 of 100 completed')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows completed count in stats', () => {
    const run = createMockRun({
      runProgress: { total: 100, completed: 50, failed: 0, percentComplete: 50 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Completed: 50')).toBeInTheDocument();
  });

  it('shows failed count when there are failures', () => {
    const run = createMockRun({
      runProgress: { total: 100, completed: 45, failed: 5, percentComplete: 50 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Failed: 5')).toBeInTheDocument();
  });

  it('shows pending count when run is not complete', () => {
    const run = createMockRun({
      status: 'RUNNING',
      runProgress: { total: 100, completed: 30, failed: 0, percentComplete: 30 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('Pending: 70')).toBeInTheDocument();
  });

  it('does not show pending count when run is complete', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      runProgress: { total: 100, completed: 100, failed: 0, percentComplete: 100 },
    });
    render(<RunProgress run={run} />);

    expect(screen.queryByText(/Pending:/)).not.toBeInTheDocument();
  });

  it('shows warning for failed jobs on completed run', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      runProgress: { total: 100, completed: 95, failed: 5, percentComplete: 100 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('5 probes failed during this run.')).toBeInTheDocument();
  });

  it('shows singular form for single failure', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      runProgress: { total: 100, completed: 99, failed: 1, percentComplete: 100 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('1 probe failed during this run.')).toBeInTheDocument();
  });

  it('does not show per-model progress by default', () => {
    const run = createMockRun();
    render(<RunProgress run={run} />);

    expect(screen.queryByText('Per-Model Progress')).not.toBeInTheDocument();
  });

  it('shows per-model progress when enabled', () => {
    const run = createMockRun({
      config: { models: ['gpt-4', 'claude-3'] },
    });
    render(<RunProgress run={run} showPerModel={true} />);

    expect(screen.getByText('Per-Model Progress')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('handles zero progress correctly', () => {
    const run = createMockRun({
      status: 'PENDING',
      runProgress: { total: 100, completed: 0, failed: 0, percentComplete: 0 },
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('0 of 100 completed')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles null runProgress gracefully', () => {
    const run = createMockRun({
      runProgress: null,
    });
    render(<RunProgress run={run} />);

    expect(screen.getByText('0 of 0 completed')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
