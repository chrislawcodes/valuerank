import { describe, expect, it } from 'vitest';

import {
  collectVisibleDimensionColumns,
  formatDecisionDisplay,
} from '../../../src/services/export/decision-display.js';
import {
  formatCSVRow,
  generateExportFilename,
  transcriptToCSVRow,
  transcriptsToCSV,
  type TranscriptWithScenario,
} from '../../../src/services/export/csv.js';

type ExportTranscript = TranscriptWithScenario & {
  decisionMetadata?: unknown;
  definitionSnapshot?: unknown;
  scenario: NonNullable<TranscriptWithScenario['scenario']> & {
    orientationFlipped?: boolean | null;
  };
};

function createTranscript(overrides: Partial<ExportTranscript> = {}): ExportTranscript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'anthropic:claude-3-5-sonnet-20241022',
    modelVersion: null,
    sampleIndex: 0,
    content: {
      turns: [
        {
          probePrompt: 'What should I do?',
          targetResponse: 'I would choose the safer option.',
        },
      ],
    },
    turnCount: 1,
    tokenCount: 100,
    durationMs: 1000,
    estimatedCost: null,
    decisionText: null,
    costSnapshotId: null,
    createdAt: new Date(),
    scenario: {
      id: 'scenario-1',
      definitionId: 'def-1',
      name: 'Test Scenario',
      body: 'Test body',
      content: {
        dimensions: {
          Stakes: 1,
          Certainty: 2,
        },
      },
      hash: 'abc123',
      createdAt: new Date(),
      deletedAt: null,
      orientationFlipped: false,
    },
    run: {
      name: 'Batch Alpha',
      config: {
        temperature: 0.25,
      },
      definition: {
        version: 7,
      },
    },
    ...overrides,
  } as ExportTranscript;
}

const BASE_SCENARIO = createTranscript().scenario;

describe('decision display export helper', () => {
  it('returns the controlled decision reasons', () => {
    const rendered = formatDecisionDisplay(
      createTranscript({
        decisionMetadata: {
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          matchedLabel: 'Achievement',
        },
        definitionSnapshot: {
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
          methodology: { presentation_order: 'A_first' },
        },
      }),
    );

    const missingMetadata = formatDecisionDisplay(
      createTranscript({
        decisionMetadata: {
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          matchedLabel: 'Achievement',
        },
        definitionSnapshot: {
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
          methodology: { presentation_order: 'A_first' },
        },
        scenario: {
          ...BASE_SCENARIO,
          orientationFlipped: null,
        },
      }),
    );

    const invalidPair = formatDecisionDisplay(
      createTranscript({
        decisionMetadata: {
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          matchedLabel: 'Tradition',
        },
        definitionSnapshot: {
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
          methodology: { presentation_order: 'A_first' },
        },
      }),
    );

    const parseFailed = formatDecisionDisplay(
      createTranscript({
        decisionMetadata: {
          parseClass: 'ambiguous',
          parsePath: 'exact.favor_first.strong',
          matchedLabel: 'Achievement',
        },
        definitionSnapshot: {
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
          methodology: { presentation_order: 'A_first' },
        },
      }),
    );

    const emptyInput = formatDecisionDisplay(
      createTranscript({
        decisionMetadata: null,
        definitionSnapshot: null,
        scenario: {
          ...BASE_SCENARIO,
          orientationFlipped: false,
        },
      }),
    );

    expect(rendered.reason).toBe('rendered');
    expect(rendered.direction).toBe('favor_first');
    expect(rendered.strength).toBe('strong');
    expect(rendered.bucketLabel).toBe('First side strong');
    expect(rendered.preferenceScore).toBe(2);

    expect(missingMetadata.reason).toBe('missing_metadata');
    expect(invalidPair.reason).toBe('invalid_pair');
    expect(parseFailed.reason).toBe('parse_failed');
    expect(emptyInput.reason).toBe('empty_input');
  });

  it('deduplicates blank labels and reserved header collisions deterministically', () => {
    const transcripts = [
      createTranscript({
        id: 't1',
        scenario: {
          ...createTranscript().scenario,
          content: {
            dimensions: {
              '   ': 1,
              'Decision Reason': 2,
              'Decision Reason ': 3,
              Tradition: 4,
            },
          },
        },
      }),
    ];

    const { headers, rawKeyToHeader } = collectVisibleDimensionColumns(transcripts, [
      'AI Model Name',
      'Decision Reason',
      'Transcript ID',
    ]);

    expect(headers).toEqual([
      'Decision Reason (2)',
      'Decision Reason (3)',
      'Tradition',
      'Unnamed Dimension',
    ]);
    expect(rawKeyToHeader.get('   ')).toBe('Unnamed Dimension');
    expect(rawKeyToHeader.get('Decision Reason')).toBe('Decision Reason (2)');
    expect(rawKeyToHeader.get('Decision Reason ')).toBe('Decision Reason (3)');
  });

  it('preserves identity fields when the transcript renders as unknown', () => {
    const row = transcriptToCSVRow(
      createTranscript({
        decisionMetadata: null,
        definitionSnapshot: null,
      }),
    );

    expect(row.batchName).toBe('Batch Alpha');
    expect(row.trialSignature).toBe('v7t0.25');
    expect(row.decisionDirection).toBe('unknown');
    expect(row.decisionStrength).toBe('unknown');
    expect(row.decisionReason).toBe('empty_input');
    expect(row.transcriptId).toBe('transcript-1');
    expect(row.variables).toEqual({ Stakes: 1, Certainty: 2 });

    const formatted = formatCSVRow(row, ['Certainty', 'Stakes']);
    expect(formatted).toContain('Batch Alpha');
    expect(formatted).toContain('v7t0.25');
    expect(formatted).toContain('unknown,unknown,empty_input,transcript-1');
  });

  it('returns BOM plus headers only for an empty CSV export', () => {
    const csv = transcriptsToCSV([]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toContain('AI Model Name,Trial Signature,Batch,Sample Index,Decision Direction,Decision Strength,Decision Reason,Transcript ID,Probe Prompt,Target Response');
  });

  it('preserves prompt, response, model name, and trailing newline for populated CSV exports', () => {
    const row = transcriptToCSVRow(
      createTranscript({
        content: {
          turns: [
            {
              probePrompt: 'First prompt',
              targetResponse: 'First response',
            },
            {
              probePrompt: 'Second prompt',
              targetResponse: 'Second response',
            },
          ],
        },
      }),
    );

    expect(row.modelName).toBe('claude-3-5-sonnet');
    expect(row.probePrompt).toBe('First prompt\n\n---\n\nSecond prompt');
    expect(row.targetResponse).toBe('First response\n\n---\n\nSecond response');

    const csv = transcriptsToCSV([createTranscript()]);
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('generates stable export filenames from the run id prefix', () => {
    const filename = generateExportFilename('run-1234567890');

    expect(filename).toMatch(/^summary_run-1234_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
