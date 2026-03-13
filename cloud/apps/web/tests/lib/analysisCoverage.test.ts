import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../src/api/operations/runs';
import {
  getCoverageForModel,
  shouldShowDecisionCoverage,
  summarizeDecisionCoverage,
} from '../../src/utils/analysisCoverage';

function createTranscript(overrides: Partial<Transcript>): Transcript {
  return {
    id: 'tx-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'openai:gpt-4.1',
    modelVersion: null,
    content: null,
    decisionCode: null,
    decisionCodeSource: null,
    decisionMetadata: null,
    turnCount: 0,
    tokenCount: 0,
    durationMs: 0,
    estimatedCost: null,
    createdAt: '2026-03-13T12:00:00Z',
    lastAccessedAt: null,
    ...overrides,
  };
}

describe('analysisCoverage', () => {
  it('separates parser, manual, unresolved, and legacy numeric transcripts', () => {
    const coverage = summarizeDecisionCoverage([
      createTranscript({
        id: 'exact',
        decisionCode: '5',
        decisionMetadata: { parseClass: 'exact' },
      }),
      createTranscript({
        id: 'fallback',
        decisionCode: '4',
        decisionMetadata: { parseClass: 'fallback_resolved' },
      }),
      createTranscript({
        id: 'manual',
        decisionCode: '2',
        decisionMetadata: {
          parseClass: 'ambiguous',
          manualOverride: { previousDecisionCode: null, overriddenAt: '2026-03-13T12:05:00Z' },
        },
      }),
      createTranscript({
        id: 'unresolved',
        decisionCode: null,
        decisionMetadata: { parseClass: 'ambiguous' },
      }),
      createTranscript({
        id: 'legacy',
        decisionCode: '3',
      }),
    ]);

    expect(coverage.totalTranscripts).toBe(5);
    expect(coverage.scoredTranscripts).toBe(4);
    expect(coverage.unresolvedTranscripts).toBe(1);
    expect(coverage.parserScoredTranscripts).toBe(2);
    expect(coverage.manuallyAdjudicatedTranscripts).toBe(1);
    expect(coverage.exactMatchTranscripts).toBe(1);
    expect(coverage.fallbackResolvedTranscripts).toBe(1);
    expect(coverage.ambiguousTranscripts).toBe(2);
    expect(coverage.legacyNumericTranscripts).toBe(1);
    expect(coverage.hasMethodologySignals).toBe(true);
    expect(shouldShowDecisionCoverage(coverage)).toBe(true);
  });

  it('fuzzy-matches model ids when analysis keys add provider prefixes', () => {
    const coverage = summarizeDecisionCoverage([
      createTranscript({
        modelId: 'gpt-4.1',
        decisionCode: '5',
        decisionMetadata: { parseClass: 'exact' },
      }),
    ]);

    const resolvedCoverage = getCoverageForModel(coverage, 'openai:gpt-4.1');
    expect(resolvedCoverage?.modelId).toBe('gpt-4.1');
    expect(resolvedCoverage?.parserScoredTranscripts).toBe(1);
  });

  it('stays hidden for pure legacy numeric coverage with no unresolved transcripts', () => {
    const coverage = summarizeDecisionCoverage([
      createTranscript({ decisionCode: '1' }),
      createTranscript({ id: 'legacy-2', decisionCode: '5' }),
    ]);

    expect(coverage.hasMethodologySignals).toBe(false);
    expect(coverage.unresolvedTranscripts).toBe(0);
    expect(shouldShowDecisionCoverage(coverage)).toBe(false);
  });
});
