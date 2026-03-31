import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptViewer } from '../../../src/components/runs/TranscriptViewer';
import type { Transcript } from '../../../src/api/operations/runs';

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: { turns: [{ role: 'user', content: 'Hello' }] },
    decisionCode: '1',
    decisionCodeSource: 'manual',
    decisionMetadata: null,
    turnCount: 1,
    tokenCount: 42,
    durationMs: 1000,
    estimatedCost: null,
    createdAt: '2024-01-15T10:00:00Z',
    lastAccessedAt: null,
    decisionModelV2: {
      raw: {
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'exact.favor_second.strong',
        parserVersion: 'v1',
        responseExcerpt: 'Achievement',
        manualOverride: {
          previousValue: '5',
          overriddenAt: '2024-01-15T12:00:00Z',
          overriddenByUserId: 'user-1',
        },
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
        rawScore: 5,
        canonicalScore: null,
      },
    },
    ...overrides,
  };
}

describe('TranscriptViewer', () => {
  it('renders the audit surface with canonical decision and raw evidence', () => {
    render(
      <TranscriptViewer
        transcript={createTranscript()}
        onClose={vi.fn()}
        onDecisionChange={vi.fn()}
        decisionDisplayMode="audit"
      />
    );

    expect(screen.getByText('Decision summary:')).toBeInTheDocument();
    expect(screen.getByText(/Strongly favors Benevolence Dependability/)).toBeInTheDocument();
    expect(screen.getByText('Raw Evidence')).toBeInTheDocument();
    expect(screen.getByText('exact')).toBeInTheDocument();
    expect(screen.queryByText('42 tokens')).not.toBeInTheDocument();
    expect(screen.getByText(/Manual override previous value:/i).parentElement).toHaveTextContent('5');
    expect(screen.queryByText('Compatibility Decision Code')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Set decision for transcript transcript-1/i)).not.toBeInTheDocument();
  });
});
