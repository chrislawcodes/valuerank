/**
 * RunResults Component Tests
 *
 * Tests for the run results display component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunResults } from '../../../src/components/runs/RunResults';
import type { Run, Transcript } from '../../../src/api/operations/runs';

function createMockTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: {
      turns: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    },
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    createdAt: '2024-01-15T10:00:00Z',
    lastAccessedAt: null,
    ...overrides,
  };
}

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    definitionId: 'def-1',
    experimentId: null,
    status: 'COMPLETED',
    config: {
      models: ['gpt-4'],
      samplePercentage: 100,
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
    transcripts: [createMockTranscript()],
    transcriptCount: 1,
    recentTasks: [],
    definition: {
      id: 'def-1',
      name: 'Test Definition',
    },
    ...overrides,
  };
}

describe('RunResults', () => {
  it('renders empty state when no transcripts', () => {
    const run = createMockRun({ transcripts: [], transcriptCount: 0 });
    render(<RunResults run={run} />);

    expect(screen.getByText('No results available yet')).toBeInTheDocument();
  });

  it('shows "results will appear" message for incomplete runs', () => {
    const run = createMockRun({
      status: 'RUNNING',
      transcripts: [],
      transcriptCount: 0,
    });
    render(<RunResults run={run} />);

    expect(screen.getByText('Results will appear as the run progresses')).toBeInTheDocument();
  });

  it('renders summary stats', () => {
    const run = createMockRun({
      transcripts: [
        createMockTranscript({ tokenCount: 100, turnCount: 2, durationMs: 1000 }),
        createMockTranscript({ id: 't2', tokenCount: 200, turnCount: 4, durationMs: 2000 }),
      ],
      transcriptCount: 2,
    });
    render(<RunResults run={run} />);

    // Should show count
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Transcripts')).toBeInTheDocument();

    // Should show total tokens
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
  });

  it('renders per-model breakdown for multiple models', () => {
    const run = createMockRun({
      config: { models: ['gpt-4', 'claude-3'] },
      transcripts: [
        createMockTranscript({ id: 't1', modelId: 'gpt-4' }),
        createMockTranscript({ id: 't2', modelId: 'gpt-4' }),
        createMockTranscript({ id: 't3', modelId: 'claude-3' }),
      ],
      transcriptCount: 3,
    });
    render(<RunResults run={run} />);

    expect(screen.getByText('Results by Model')).toBeInTheDocument();
    // Model names appear in both breakdown and transcript list
    expect(screen.getAllByText('gpt-4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('claude-3').length).toBeGreaterThan(0);
  });

  it('does not show per-model breakdown for single model', () => {
    const run = createMockRun({
      config: { models: ['gpt-4'] },
      transcripts: [createMockTranscript()],
      transcriptCount: 1,
    });
    render(<RunResults run={run} />);

    expect(screen.queryByText('Results by Model')).not.toBeInTheDocument();
  });

  it('shows view mode toggles', () => {
    const run = createMockRun();
    render(<RunResults run={run} />);

    expect(screen.getByText('View:')).toBeInTheDocument();
    expect(screen.getByTitle('Group by model')).toBeInTheDocument();
    expect(screen.getByTitle('Flat list')).toBeInTheDocument();
  });

  it('shows export button when onExport is provided', () => {
    const run = createMockRun();
    const onExport = vi.fn();
    render(<RunResults run={run} onExport={onExport} />);

    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('does not show export button when onExport is not provided', () => {
    const run = createMockRun();
    render(<RunResults run={run} />);

    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
  });

  it('calls onExport when export button is clicked', async () => {
    const user = userEvent.setup();
    const run = createMockRun();
    const onExport = vi.fn();
    render(<RunResults run={run} onExport={onExport} />);

    await user.click(screen.getByRole('button', { name: /export csv/i }));

    expect(onExport).toHaveBeenCalled();
  });

  it('shows exporting state', () => {
    const run = createMockRun();
    render(<RunResults run={run} onExport={vi.fn()} isExporting={true} />);

    expect(screen.getByText('Exporting...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled();
  });

  it('opens transcript viewer when transcript is clicked', async () => {
    const user = userEvent.setup();
    const run = createMockRun({
      transcripts: [
        createMockTranscript({
          content: {
            turns: [
              { role: 'user', content: 'Test message' },
              { role: 'assistant', content: 'Test response' },
            ],
          },
        }),
      ],
    });
    render(<RunResults run={run} />);

    // Expand the model group first
    await user.click(screen.getByText('gpt-4'));

    // Click on a transcript row (contains scenario text)
    const transcriptButton = screen.getByText(/Scenario:/);
    await user.click(transcriptButton);

    // Should show transcript viewer modal
    expect(screen.getByRole('heading', { name: 'Transcript' })).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.getByText('Test response')).toBeInTheDocument();
  });

  it('closes transcript viewer when close button is clicked', async () => {
    const user = userEvent.setup();
    const run = createMockRun({
      transcripts: [createMockTranscript()],
    });
    render(<RunResults run={run} />);

    // Open viewer
    await user.click(screen.getByText('gpt-4'));
    await user.click(screen.getByText(/Scenario:/));

    // Close viewer
    await user.click(screen.getByRole('button', { name: /close/i }));

    // Should be closed
    expect(screen.queryByRole('heading', { name: 'Transcript' })).not.toBeInTheDocument();
  });

  it('toggles view mode', async () => {
    const user = userEvent.setup();
    const run = createMockRun();
    render(<RunResults run={run} />);

    // Initially grouped (default)
    expect(screen.getByTitle('Group by model')).toHaveClass('bg-teal-100');

    // Click flat list
    await user.click(screen.getByTitle('Flat list'));

    expect(screen.getByTitle('Flat list')).toHaveClass('bg-teal-100');
    expect(screen.getByTitle('Group by model')).not.toHaveClass('bg-teal-100');
  });
});
