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
    decisionCode: '3',
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

    // Initially collapsed - row content not visible
    expect(screen.queryByText('3')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText('gpt-4'));

    // Now transcript content should be visible
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('collapses model group when clicked again', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ scenarioId: 'test-scenario-id' })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    // Expand
    await user.click(screen.getByText('gpt-4'));
    expect(screen.getByText('3')).toBeInTheDocument();

    // Collapse - use getAllByText since the model name also appears in the expanded transcript row
    const gpt4Elements = screen.getAllByText('gpt-4');
    // The first match is the model group header button
    await user.click(gpt4Elements[0]);
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('calls onSelect when transcript is clicked', async () => {
    const user = userEvent.setup();
    const transcript = createMockTranscript();

    render(<TranscriptList transcripts={[transcript]} onSelect={mockOnSelect} />);

    // Expand group
    await user.click(screen.getByText('gpt-4'));

    // Click transcript
    await user.click(screen.getByText('3'));

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

    expect(screen.getByPlaceholderText('Filter by model or transcript...')).toBeInTheDocument();
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

    expect(screen.queryByPlaceholderText('Filter by model or transcript...')).not.toBeInTheDocument();
  });

  it('shows decision in transcript row', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript()];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows canonical decision details in audit mode', async () => {
    const transcript = createMockTranscript({
      decisionCode: '1',
      decisionModelV2: {
        raw: {
          matchedText: 'Achievement',
          matchedLabel: 'Achievement',
          parseClass: 'exact',
          parsePath: 'exact.favor_second.strong',
          parserVersion: 'v1',
          responseExcerpt: 'Achievement',
          manualOverride: null,
        },
        canonical: {
          favoredValueKey: 'Benevolence_Dependability',
          opposedValueKey: 'Achievement',
          direction: 'favor_second',
          strength: 'strong',
          normalizationApplied: true,
          normalizationReason: 'orientation_flipped',
          source: 'deterministic',
        },
        legacy: {
          rawScore: null,
          canonicalScore: null,
        },
      },
    });

    render(
      <TranscriptList
        transcripts={[transcript]}
        onSelect={mockOnSelect}
        groupByModel={false}
        decisionDisplayMode="audit"
        decisionColumnLabel="Decision summary"
      />
    );

    expect(screen.getByText(/Strongly favors Benevolence Dependability/)).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('shows a fallback badge first when the transcript was not summarized deterministically', async () => {
    const transcript = createMockTranscript({
      decisionCode: '1',
      decisionModelV2: {
        raw: {
          matchedText: 'Achievement',
          matchedLabel: 'Achievement',
          parseClass: 'fallback_resolved',
          parsePath: 'fallback_resolved.favor_second.strong',
          parserVersion: 'v1',
          responseExcerpt: 'Achievement',
          manualOverride: null,
        },
        canonical: {
          favoredValueKey: 'Benevolence_Dependability',
          opposedValueKey: 'Achievement',
          direction: 'favor_second',
          strength: 'strong',
          normalizationApplied: true,
          normalizationReason: 'orientation_flipped',
          source: 'deterministic',
        },
        legacy: {
          rawScore: null,
          canonicalScore: null,
        },
      },
    });

    render(
      <TranscriptList
        transcripts={[transcript]}
        onSelect={mockOnSelect}
        groupByModel={false}
        decisionDisplayMode="audit"
        decisionColumnLabel="Decision summary"
      />
    );

    const fallbackBadge = screen.getByText('Fallback');
    expect(fallbackBadge).toBeInTheDocument();
    const containerText = fallbackBadge.parentElement?.textContent ?? '';
    expect(containerText.startsWith('Fallback')).toBe(true);
  });

  it('does not show token count in transcript row', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ tokenCount: 1234 })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.queryByText('1,234 tokens')).not.toBeInTheDocument();
  });

  it('keeps descending tie-breakers stable when column values match', async () => {
    const user = userEvent.setup();
    const transcripts = [
      createMockTranscript({ id: 't2', modelId: 'gpt-4', createdAt: '2024-01-15T10:00:00Z' }),
      createMockTranscript({ id: 't1', modelId: 'gpt-4', createdAt: '2024-01-15T10:00:00Z' }),
    ];

    const { container } = render(
      <TranscriptList transcripts={transcripts} onSelect={vi.fn()} groupByModel={false} />
    );

    await user.click(screen.getByRole('button', { name: /sort by model/i }));

    const rowIds = Array.from(container.querySelectorAll('[data-transcript-id]'))
      .map((element) => element.getAttribute('data-transcript-id'));

    expect(rowIds).toEqual(['t2', 't1']);
  });

  it('shows created time in transcript row', async () => {
    const user = userEvent.setup();
    const transcripts = [createMockTranscript({ createdAt: '2024-01-15T10:00:00Z' })];

    render(<TranscriptList transcripts={transcripts} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('gpt-4'));

    expect(screen.getByText(/\d{2}:\d{2}:\d{2} [AP]M/)).toBeInTheDocument();
  });

  it('shows table headers in flat list even without dimensions', () => {
    const transcripts = [
      createMockTranscript({ id: 't1', modelId: 'gpt-4' }),
    ];

    render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
      />
    );

    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Decision')).toBeInTheDocument();
  });

  it('shows a normalized decision score header tooltip when configured', async () => {
    const user = userEvent.setup();
    const tooltipText = 'In this paired view, some prompts showed the two options in a different order.';

    render(
      <TranscriptList
        transcripts={[createMockTranscript()]}
        onSelect={mockOnSelect}
        groupByModel={false}
        decisionColumnLabel="Normalized decision score"
        decisionColumnTooltip={tooltipText}
      />
    );

    expect(screen.getByText('Normalized decision score')).toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: /Normalized decision score:/i }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltipText);
  });

  it('shows normalized decision labels for adjusted rows', () => {
    const transcript = createMockTranscript({
      decisionCode: '5',
      decisionMetadata: {
        scaleLabels: [
          { code: '1', label: 'Strongly support taking the job with Achievement' },
          { code: '2', label: 'Somewhat support taking the job with Achievement' },
          { code: '3', label: 'Neutral / Unsure' },
          { code: '4', label: 'Somewhat support taking the job with Benevolence' },
          { code: '5', label: 'Strongly support taking the job with Benevolence' },
        ],
      },
    });

    render(
      <TranscriptList
        transcripts={[transcript]}
        onSelect={mockOnSelect}
        groupByModel={false}
        decisionColumnLabel="Normalized decision score"
        normalizedDecisionTranscriptIds={new Set([transcript.id])}
      />
    );

    expect(screen.getByText('1 - Strongly support (Achievement)')).toBeInTheDocument();
  });

  it('sorts flat transcript rows by the first value and then the second by default', () => {
    const transcripts = [
      createMockTranscript({ id: 't1', scenarioId: 'scenario-3', modelId: 'gpt-4' }),
      createMockTranscript({ id: 't2', scenarioId: 'scenario-1', modelId: 'claude-3' }),
      createMockTranscript({ id: 't3', scenarioId: 'scenario-2', modelId: 'gemini-2' }),
    ];

    const { container } = render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
        scenarioDimensions={{
          'scenario-1': { AttributeA: '1', AttributeB: '2' },
          'scenario-2': { AttributeA: '1', AttributeB: '1' },
          'scenario-3': { AttributeA: '2', AttributeB: '1' },
        }}
      />
    );

    const rowIds = Array.from(container.querySelectorAll('[data-transcript-id]'))
      .map((element) => element.getAttribute('data-transcript-id'));

    expect(rowIds).toEqual(['t3', 't2', 't1']);
  });

  it('sorts flat transcript rows when a column header is clicked', async () => {
    const user = userEvent.setup();
    const transcripts = [
      createMockTranscript({ id: 't1', modelId: 'model-c' }),
      createMockTranscript({ id: 't2', modelId: 'model-a' }),
      createMockTranscript({ id: 't3', modelId: 'model-b' }),
    ];

    const { container } = render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Sort by Model/i }));

    const rowIds = Array.from(container.querySelectorAll('[data-transcript-id]'))
      .map((element) => element.getAttribute('data-transcript-id'));

    expect(rowIds).toEqual(['t1', 't3', 't2']);
  });

  it('uses a stable id tie-breaker when the primary sort values are equal', () => {
    const transcripts = [
      createMockTranscript({ id: 't2', modelId: 'gpt-4', createdAt: '2024-01-15T10:00:00Z' }),
      createMockTranscript({ id: 't1', modelId: 'gpt-4', createdAt: '2024-01-15T10:00:00Z' }),
    ];

    const { container } = render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
      />
    );

    const rowIds = Array.from(container.querySelectorAll('[data-transcript-id]'))
      .map((element) => element.getAttribute('data-transcript-id'));

    expect(rowIds).toEqual(['t1', 't2']);
  });

  it('sorts dimension columns by numeric tier when values are stored as words', async () => {
    const transcripts = [
      createMockTranscript({ id: 't1', scenarioId: 'scenario-1' }),
      createMockTranscript({ id: 't2', scenarioId: 'scenario-2' }),
      createMockTranscript({ id: 't3', scenarioId: 'scenario-3' }),
    ];

    const { container } = render(
      <TranscriptList
        transcripts={transcripts}
        onSelect={mockOnSelect}
        groupByModel={false}
        scenarioDimensions={{
          'scenario-1': { AttributeA: 'full' },
          'scenario-2': { AttributeA: 'minimal' },
          'scenario-3': { AttributeA: 'substantial' },
        }}
      />
    );

    const rowIds = Array.from(container.querySelectorAll('[data-transcript-id]'))
      .map((element) => element.getAttribute('data-transcript-id'));

    expect(rowIds).toEqual(['t2', 't3', 't1']);
  });

  it('renders decision override dropdown for transcripts with decisionCode "other"', async () => {
    const user = userEvent.setup();
    const onDecisionChange = vi.fn();
    const transcript = createMockTranscript({ decisionCode: 'other' });

    render(
      <TranscriptList
        transcripts={[transcript]}
        onSelect={mockOnSelect}
        groupByModel={false}
        onDecisionChange={onDecisionChange}
      />
    );

    const dropdown = screen.getByLabelText(`Set decision for transcript ${transcript.id}`);
    expect(screen.getByText('other')).toBeInTheDocument();
    await user.selectOptions(dropdown, '4');

    expect(onDecisionChange).toHaveBeenCalledWith(transcript, '4');
  });
});
