/**
 * get_transcript_summary Tool Tests
 *
 * Tests the formatTranscriptSummary function with mock data.
 * The actual database interaction is tested via integration tests.
 */

import { describe, it, expect } from 'vitest';
import { formatTranscriptSummary } from '../../../src/mcp/tools/get-transcript-summary.js';

describe('get_transcript_summary tool', () => {
  const testRunId = 'test-run-123';
  const testScenarioId = 'test-scenario-456';
  const testModel = 'openai:gpt-4';

  function buildResolvedTranscript(overrides: Record<string, unknown> = {}) {
    return {
      content: { turns: [] },
      decisionCode: null,
      decisionMetadata: {
        manualOverride: {
          appliedDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'strong',
          },
          previousValue: '4',
          overriddenAt: '2024-01-15T10:00:00Z',
          overriddenByUserId: 'test-user',
        },
      },
      definitionSnapshot: {
        dimensions: [
          { name: 'Achievement' },
          { name: 'Benevolence_Dependability' },
        ],
        methodology: {
          presentation_order: 'A_first',
        },
      },
      decisionText: 'Prioritize safety over efficiency',
      keyReasoning: [],
      createdAt: new Date(),
      ...overrides,
    };
  }

  describe('formatTranscriptSummary', () => {
    it('formats transcript with full data correctly', () => {
      const transcript = buildResolvedTranscript({
        content: {
          turns: [
            { role: 'user', content: 'What would you do?' },
            { role: 'assistant', content: 'I would prioritize safety.' },
          ],
        },
        keyReasoning: ['Safety is paramount', 'Ethics matter'],
        createdAt: new Date('2024-01-15T10:00:00Z'),
      });

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.runId).toBe(testRunId);
      expect(result.scenarioId).toBe(testScenarioId);
      expect(result.model).toBe(testModel);
      expect(result.status).toBe('found');
      expect(result.summary).toBeDefined();
    });

    it('includes correct turn count', () => {
      const transcript = {
        content: {
          turns: [
            { role: 'user', content: 'Question 1' },
            { role: 'assistant', content: 'Answer 1' },
            { role: 'user', content: 'Question 2' },
            { role: 'assistant', content: 'Answer 2' },
          ],
        },
        decisionCode: null,
        decisionMetadata: null,
        definitionSnapshot: null,
        decisionText: null,
        keyReasoning: [],
        createdAt: new Date(),
      };

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.turnCount).toBe(4);
    });

    it('includes word count estimate', () => {
      const transcript = {
        content: {
          turns: [
            { role: 'user', content: 'What would you do in this situation?' },
            { role: 'assistant', content: 'I would prioritize safety while considering ethical implications.' },
          ],
        },
        decisionCode: null,
        decisionMetadata: null,
        definitionSnapshot: null,
        decisionText: null,
        keyReasoning: [],
        createdAt: new Date(),
      };

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      // Should have some words counted (at least 10 words in the messages above)
      expect(result.summary?.wordCount).toBeGreaterThan(10);
    });

    it('includes canonical decision and text', () => {
      const transcript = buildResolvedTranscript({
        content: { turns: [] },
      });

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.decision.direction).toBe('favor_first');
      expect(result.summary?.decision.strength).toBe('strong');
      expect(result.summary?.decision.favoredValueKey).toBe('Achievement');
      expect(result.summary?.decision.text).toBe('Prioritize safety over efficiency');
    });

    it('includes key reasoning points', () => {
      const transcript = buildResolvedTranscript({
        content: { turns: [] },
        decisionText: 'Test decision',
        keyReasoning: ['Safety is paramount', 'Ethical considerations matter', 'Human welfare first'],
      });

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.keyReasoning).toContain('Safety is paramount');
      expect(result.summary?.keyReasoning.length).toBe(3);
    });

    it('includes ISO timestamp', () => {
      const transcript = {
        content: { turns: [] },
        decisionCode: null,
        decisionMetadata: null,
        definitionSnapshot: null,
        decisionText: null,
        keyReasoning: [],
        createdAt: new Date('2024-01-15T10:30:00Z'),
      };

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.timestamp).toBe('2024-01-15T10:30:00.000Z');
    });

    it('returns not_found status when transcript is null', () => {
      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        null
      );

      expect(result.status).toBe('not_found');
      expect(result.summary).toBeUndefined();
    });

    it('handles missing decision gracefully', () => {
      const transcript = {
        content: { turns: [] },
        decisionCode: null,
        decisionMetadata: null,
        definitionSnapshot: null,
        decisionText: null,
        keyReasoning: [],
        createdAt: new Date(),
      };

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.decision.direction).toBe('unknown');
      expect(result.summary?.decision.strength).toBe('unknown');
      expect(result.summary?.decision.favoredValueKey).toBeNull();
      expect(result.summary?.decision.text).toBe('No decision recorded');
    });

    it('truncates key reasoning to 5 points', () => {
      const transcript = buildResolvedTranscript({
        content: { turns: [] },
        decisionText: 'Test',
        keyReasoning: ['Point 1', 'Point 2', 'Point 3', 'Point 4', 'Point 5', 'Point 6', 'Point 7'],
      });

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.keyReasoning.length).toBe(5);
    });

    it('handles content with messages instead of turns', () => {
      const transcript = {
        content: {
          messages: [
            { role: 'user', text: 'Hello there' },
            { role: 'assistant', text: 'Hi how can I help' },
          ],
        },
        decisionCode: null,
        decisionMetadata: null,
        definitionSnapshot: null,
        decisionText: null,
        keyReasoning: [],
        createdAt: new Date(),
      };

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.turnCount).toBe(2);
      expect(result.summary?.wordCount).toBeGreaterThan(0);
    });

    it('handles empty content gracefully', () => {
      const transcript = {
        content: {},
        decisionCode: null,
        decisionText: null,
        keyReasoning: [],
        createdAt: new Date(),
      };

      const result = formatTranscriptSummary(
        testRunId,
        testScenarioId,
        testModel,
        transcript
      );

      expect(result.summary?.turnCount).toBe(0);
      expect(result.summary?.wordCount).toBe(0);
    });
  });
});
