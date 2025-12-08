/**
 * QueueStatus Component Tests
 *
 * Tests for job queue health status display.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueStatus } from '../../../src/components/settings/QueueStatus';
import type { QueueHealth } from '../../../src/api/operations/health';

function createMockQueueHealth(overrides: Partial<QueueHealth> = {}): QueueHealth {
  return {
    isHealthy: true,
    isRunning: true,
    isPaused: false,
    activeJobs: 0,
    pendingJobs: 0,
    completedLast24h: 0,
    failedLast24h: 0,
    successRate: null,
    jobTypes: [],
    error: null,
    checkedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('QueueStatus', () => {
  it('shows "Healthy" badge when queue is healthy', () => {
    const queue = createMockQueueHealth({ isHealthy: true, isRunning: true });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows "Stopped" badge when queue is not running', () => {
    const queue = createMockQueueHealth({ isHealthy: false, isRunning: false });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('shows "Paused" badge when queue is paused', () => {
    const queue = createMockQueueHealth({ isHealthy: true, isRunning: true, isPaused: true });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('displays active jobs count', () => {
    const queue = createMockQueueHealth({ activeJobs: 5 });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('displays pending jobs count', () => {
    const queue = createMockQueueHealth({ pendingJobs: 10 });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('displays completed jobs count', () => {
    const queue = createMockQueueHealth({ completedLast24h: 100 });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Completed (24h)')).toBeInTheDocument();
  });

  it('displays failed jobs count', () => {
    const queue = createMockQueueHealth({ failedLast24h: 3 });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Failed (24h)')).toBeInTheDocument();
  });

  it('displays success rate percentage', () => {
    const queue = createMockQueueHealth({ successRate: 0.95 });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('Success Rate (24h)')).toBeInTheDocument();
  });

  it('does not show success rate when null', () => {
    const queue = createMockQueueHealth({ successRate: null });

    render(<QueueStatus queue={queue} />);

    expect(screen.queryByText('Success Rate (24h)')).not.toBeInTheDocument();
  });

  it('displays error message when present', () => {
    const queue = createMockQueueHealth({
      isHealthy: false,
      error: 'Database connection failed',
    });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
  });

  it('displays job types breakdown', () => {
    const queue = createMockQueueHealth({
      jobTypes: [
        { type: 'probe_scenario', pending: 5, active: 2, completed: 10, failed: 1 },
        { type: 'expand_scenarios', pending: 0, active: 0, completed: 5, failed: 0 },
      ],
    });

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('Probe Scenario')).toBeInTheDocument();
    expect(screen.getByText('Expand Scenarios')).toBeInTheDocument();
    expect(screen.getByText('2 active')).toBeInTheDocument();
    expect(screen.getByText('5 pending')).toBeInTheDocument();
  });

  it('shows title "Job Queue"', () => {
    const queue = createMockQueueHealth();

    render(<QueueStatus queue={queue} />);

    expect(screen.getByText('Job Queue')).toBeInTheDocument();
  });
});
