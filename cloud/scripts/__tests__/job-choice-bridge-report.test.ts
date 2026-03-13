import { describe, expect, it } from 'vitest';

import {
  buildJobChoiceBridgeReport,
  renderJobChoiceBridgeMarkdown,
  type BridgeRunInput,
} from '../job-choice-bridge-report-lib.js';

const sampleRuns: BridgeRunInput[] = [
  {
    runId: 'run-a',
    runName: 'Bridge A',
    definitionId: 'def-a',
    definitionName: 'Jobs (Achievement vs Hedonism) [Job Choice A First]',
    definitionVersion: 1,
    scenarioCount: 2,
    launchMode: 'PAIRED_BATCH',
    methodologySafe: true,
    responseScale: 'option_text',
    family: 'job-choice',
    pairKey: 'job-choice:def-a',
    presentationOrder: 'A_first',
    trialSignature: 'v1t0',
    transcripts: [
      {
        transcriptId: 'tx-1',
        scenarioId: 's-1',
        scenarioName: 'Scenario 1',
        modelId: 'model-1',
        decisionCode: '5',
        decisionCodeSource: 'summary',
        parseClass: 'exact',
        matchedLabel: 'Strongly support taking the job with substantial recognition for expertise',
        responseExcerpt: 'Strongly support taking the job with substantial recognition for expertise.',
        parsePath: 'deterministic_exact',
      },
      {
        transcriptId: 'tx-2',
        scenarioId: 's-2',
        scenarioName: 'Scenario 2',
        modelId: 'model-1',
        decisionCode: '4',
        decisionCodeSource: 'summary',
        parseClass: 'fallback_resolved',
        matchedLabel: 'Somewhat support taking the job with moderate personal enjoyment',
        responseExcerpt: 'I somewhat support the second job.',
        parsePath: 'fallback_semantic',
      },
    ],
  },
  {
    runId: 'run-b',
    runName: 'Bridge B',
    definitionId: 'def-b',
    definitionName: 'Jobs (Achievement vs Hedonism) [Job Choice B First]',
    definitionVersion: 1,
    scenarioCount: 2,
    launchMode: 'PAIRED_BATCH',
    methodologySafe: true,
    responseScale: 'option_text',
    family: 'job-choice',
    pairKey: 'job-choice:def-a',
    presentationOrder: 'B_first',
    trialSignature: 'v1t0',
    transcripts: [
      {
        transcriptId: 'tx-3',
        scenarioId: 's-1',
        scenarioName: 'Scenario 1',
        modelId: 'model-2',
        decisionCode: null,
        decisionCodeSource: null,
        parseClass: 'ambiguous',
        matchedLabel: null,
        responseExcerpt: 'I can see both sides here.',
        parsePath: 'ambiguous_conflict',
      },
      {
        transcriptId: 'tx-4',
        scenarioId: 's-2',
        scenarioName: 'Scenario 2',
        modelId: 'model-2',
        decisionCode: '2',
        decisionCodeSource: 'manual',
        parseClass: 'ambiguous',
        matchedLabel: null,
        responseExcerpt: 'Leaning to the second role.',
        parsePath: 'ambiguous_conflict',
      },
    ],
  },
];

describe('buildJobChoiceBridgeReport', () => {
  it('rolls up run, vignette, model, and exemplar data across bridge runs', () => {
    const report = buildJobChoiceBridgeReport(sampleRuns, 'http://localhost:3030');

    expect(report.descriptiveOnly).toBe(true);
    expect(report.totalRuns).toBe(2);
    expect(report.totalTranscripts).toBe(4);
    expect(report.vignetteSummaries).toHaveLength(1);
    expect(report.vignetteSummaries[0]).toMatchObject({
      vignetteKey: 'job-choice:def-a',
      fallbackCount: 1,
      ambiguousCount: 2,
      manualCount: 1,
      unresolvedTranscripts: 1,
    });
    expect(report.modelVignetteSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vignetteKey: 'job-choice:def-a',
          modelId: 'model-1',
          exactCount: 1,
          fallbackCount: 1,
        }),
        expect.objectContaining({
          vignetteKey: 'job-choice:def-a',
          modelId: 'model-2',
          ambiguousCount: 2,
          manualCount: 1,
        }),
      ]),
    );
    expect(report.exemplars.fallback_resolved[0]?.transcriptUrl).toBe(
      'http://localhost:3030/analysis/run-a/transcripts?transcriptId=tx-2',
    );
    expect(report.exemplars.ambiguous[0]?.runUrl).toBe('http://localhost:3030/runs/run-b');
  });

  it('renders descriptive markdown with exemplar links', () => {
    const report = buildJobChoiceBridgeReport(sampleRuns, 'http://localhost:3030');
    const markdown = renderJobChoiceBridgeMarkdown(report);

    expect(markdown).toContain('This report is descriptive only. It does not claim cross-family equivalence.');
    expect(markdown).toContain('## Per-Vignette Summary');
    expect(markdown).toContain('## Fallback Exemplars');
    expect(markdown).toContain('[open](http://localhost:3030/analysis/run-a/transcripts?transcriptId=tx-2)');
  });
});
