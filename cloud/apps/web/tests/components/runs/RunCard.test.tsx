/**
 * RunCard Component Tests
 *
 * Tests for the run card component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunCard } from '../../../src/components/runs/RunCard';
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
    definition: {
      id: 'def-1',
      name: 'Test Definition',
    },
    ...overrides,
  };
}

describe('RunCard', () => {
  it('renders run information', () => {
    const run = createMockRun();
    render(<RunCard run={run} />);

    // Run name shows in h3 as "Run: Test Definition on Jan 15, 2024"
    expect(screen.getByText(/Run:.*Test Definition/)).toBeInTheDocument();
    // Definition name shows in small text
    expect(screen.getByText(/Test Definition.*·/)).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows model count', () => {
    const run = createMockRun({ config: { models: ['gpt-4', 'claude-3', 'gemini'] } });
    render(<RunCard run={run} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
  });

  it('shows progress', () => {
    const run = createMockRun({
      runProgress: { total: 20, completed: 15, failed: 0, percentComplete: 75 },
    });
    render(<RunCard run={run} />);

    expect(screen.getByText('15/20')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const run = createMockRun();
    render(<RunCard run={run} onClick={onClick} />);

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders different status badges', () => {
    const statuses = ['PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
    const labels = ['Pending', 'Running', 'Paused', 'Completed', 'Failed', 'Cancelled'];

    statuses.forEach((status, index) => {
      const { unmount } = render(<RunCard run={createMockRun({ status })} />);
      expect(screen.getByText(labels[index])).toBeInTheDocument();
      unmount();
    });
  });

  it('handles missing definition name', () => {
    const run = createMockRun({ definition: undefined as unknown as Run['definition'] });
    render(<RunCard run={run} />);

    // Shows "Run: Unknown on <date>" in h3 and "Unnamed Definition" in small text
    expect(screen.getByText(/Run:.*Unknown/)).toBeInTheDocument();
    expect(screen.getByText(/Unnamed Definition.*·/)).toBeInTheDocument();
  });

  it('shows progress bar for completed runs', () => {
    const run = createMockRun({
      status: 'COMPLETED',
      runProgress: { total: 10, completed: 10, failed: 0, percentComplete: 100 },
    });
    const { container } = render(<RunCard run={run} />);

    // Progress bar should have bg-green-500 for completed
    const progressBar = container.querySelector('.bg-green-500');
    expect(progressBar).toBeInTheDocument();
  });

  it('shows progress bar for running runs', () => {
    const run = createMockRun({
      status: 'RUNNING',
      runProgress: { total: 10, completed: 5, failed: 0, percentComplete: 50 },
    });
    const { container } = render(<RunCard run={run} />);

    // Progress bar should have bg-teal-500 for running
    const progressBar = container.querySelector('.bg-teal-500');
    expect(progressBar).toBeInTheDocument();
  });

  it('shows progress bar for failed runs', () => {
    const run = createMockRun({
      status: 'FAILED',
      runProgress: { total: 10, completed: 3, failed: 7, percentComplete: 30 },
    });
    const { container } = render(<RunCard run={run} />);

    // Progress bar should have bg-red-500 for failed
    const progressBar = container.querySelector('.bg-red-500');
    expect(progressBar).toBeInTheDocument();
  });

  it('calculates duration for running runs', () => {
    // Mock date to be 5 minutes after start
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:05:00Z'));

    const run = createMockRun({
      status: 'RUNNING',
      startedAt: '2024-01-15T10:00:00Z',
      completedAt: null,
    });
    render(<RunCard run={run} />);

    expect(screen.getByText('5m 0s')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
