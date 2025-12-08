/**
 * TranscriptList Component Tests
 *
 * Tests for the transcript list display component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranscriptList } from '../../../src/components/runs/TranscriptList';
import type { Transcript } from '../../../src/api/operations/runs';

function createMockTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: { turns: [] },
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    createdAt: '2024-01-15T10:00:00Z',
    lastAccessedAt: null,
    ...overrides,
  };
}

describe('TranscriptList', () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no transcripts', () => {
    render(<TranscriptList transcripts={[]} onSelect={mockOnSelect} />);

    expect(screen.getByText('No transcripts yet')).toBeInTheDocument();
  });

  it('renders transcripts grouped by model by default', () => {
    const transcripts = [
      createMockTranscript({ id: 't1', modelId: 'gpt-4' }),
      createMockTranscript({ id: 't2', modelId: 'claude-3' }),
    ];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows transcript count per model', () => {
    const transcripts = [
      createMockTranscript({ id: 't1', modelId: 'gpt-4' }),
      createMockTranscript({ id: 't2', modelId: 'gpt-4' }),
      createMockTranscript({ id: 't3', modelId: 'claude-3' }),
    ];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    expect(screen.getByText('(2 transcripts)')).toBeInTheDocument();
    expect(screen.getByText('(1 transcript)')).toBeInTheDocument();
  });

  it('expands model group when clicked', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ scenarioId: 'test-scenario-id' })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    // Initially collapsed - scenario not visible
    expect(screen.queryByText(/Scenario:/)).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText('gpt-4'));

    // Now scenario should be visible
    expect(screen.getByText(/Scenario:/)).toBeInTheDocument();
  });

  it('collapses model group when clicked again', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ scenarioId: 'test-scenario-id' })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    // Expand
    await user.click(screen.getByText('gpt-4'));
    expect(screen.getByText(/Scenario:/)).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText('gpt-4'));
    expect(screen.queryByText(/Scenario:/)).not.toBeInTheDocument();
  });

  it('calls onSelect when transcript is clicked', async () => {
    const user = userEvent.setup();
    const transcript = createMockTranscript();

    render(<TranscriptList transcripts={[transcript]} onSelect={mockOnSelect} />);

    // Expand group
    await user.click(screen.getByText('gpt-4'));

    // Click transcript
    await user.click(screen.getByText(/Scenario:/));

    expect(mockOnSelect).toHaveBeenCalledWith(transcript);
  });

  it('renders flat list when groupByModel is false', () => {
    const transcripts = [
      createMockTranscript({ id: 't1', modelId: 'gpt-4' }),
      createMockTranscript({ id: 't2', modelId: 'claude-3' }),
    ];

    render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
      />
    );

    // Should not show model group headers
    expect(screen.queryByText('(1 transcript)')).not.toBeInTheDocument();

    // Should show model names in each row
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows filter input for large lists', () => {
    const transcripts = Array.from({ length: 10 }, (_, i) =>
      createMockTranscript({ id: `t${i}`, modelId: `model-${i}` })
    );

    render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
      />
    );

    expect(screen.getByPlaceholderText('Filter by model or scenario...')).toBeInTheDocument();
  });

  it('does not show filter for small lists', () => {
    const transcripts = [createMockTranscript()];

    render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
      />
    );

    expect(screen.queryByPlaceholderText('Filter by model or scenario...')).not.toBeInTheDocument();
  });

  it('shows turn count in transcript row', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ turnCount: 5 })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.getByTitle('Turns')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows token count in transcript row', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ tokenCount: 1234 })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.getByTitle('Tokens')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows duration in transcript row', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ durationMs: 2500 })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.getByTitle('Duration')).toBeInTheDocument();
    expect(screen.getByText('2.5s')).toBeInTheDocument();
  });

  it('handles transcript without scenario ID', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ scenarioId: null })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.getByText('No scenario')).toBeInTheDocument();
  });

  it('truncates long scenario IDs', async () => {
    const user = userEvent.setup();
    const transcripts = [
      createMockTranscript({ scenarioId: 'very-long-scenario-id-that-should-be-truncated' }),
    ];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    // Should show truncated version
    expect(screen.getByText(/Scenario: very-lon\.\.\./)).toBeInTheDocument();
  });
});
