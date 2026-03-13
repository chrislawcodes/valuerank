type ParseClass = 'exact' | 'fallback_resolved' | 'ambiguous' | 'legacy_numeric';

export type BridgeRunInput = {
  runId: string;
  runName: string | null;
  definitionId: string;
  definitionName: string;
  definitionVersion: number | null;
  scenarioCount: number;
  launchMode: string | null;
  methodologySafe: boolean | null;
  responseScale: string | null;
  family: string | null;
  pairKey: string | null;
  presentationOrder: string | null;
  trialSignature: string;
  transcripts: BridgeTranscriptInput[];
};

export type BridgeTranscriptInput = {
  transcriptId: string;
  scenarioId: string | null;
  scenarioName: string | null;
  modelId: string;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | null;
  matchedLabel: string | null;
  responseExcerpt: string | null;
  parsePath: string | null;
};

export type BridgeCountSummary = {
  totalTranscripts: number;
  scoredTranscripts: number;
  unresolvedTranscripts: number;
  exactCount: number;
  fallbackCount: number;
  ambiguousCount: number;
  manualCount: number;
  legacyNumericCount: number;
};

export type BridgeRunSummary = BridgeCountSummary & {
  runId: string;
  runName: string | null;
  definitionId: string;
  definitionName: string;
  vignetteKey: string;
  responseScale: string | null;
  family: string | null;
  pairKey: string | null;
  presentationOrder: string | null;
  launchMode: string | null;
  methodologySafe: boolean | null;
  trialSignature: string;
  models: string[];
};

export type BridgeVignetteSummary = BridgeCountSummary & {
  vignetteKey: string;
  pairKey: string | null;
  definitionIds: string[];
  definitionNames: string[];
  runIds: string[];
  responseScales: string[];
  models: string[];
};

export type BridgeModelVignetteSummary = BridgeCountSummary & {
  vignetteKey: string;
  modelId: string;
  runIds: string[];
  responseScales: string[];
};

export type BridgeExemplar = {
  transcriptId: string;
  runId: string;
  definitionName: string;
  vignetteKey: string;
  modelId: string;
  scenarioId: string | null;
  scenarioName: string | null;
  parseClass: Exclude<ParseClass, 'legacy_numeric'>;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  matchedLabel: string | null;
  responseExcerpt: string | null;
  parsePath: string | null;
  runUrl: string;
  transcriptUrl: string;
};

export type JobChoiceBridgeReport = {
  generatedAt: string;
  descriptiveOnly: true;
  totalRuns: number;
  totalTranscripts: number;
  runSummaries: BridgeRunSummary[];
  vignetteSummaries: BridgeVignetteSummary[];
  modelVignetteSummaries: BridgeModelVignetteSummary[];
  exemplars: {
    fallback_resolved: BridgeExemplar[];
    ambiguous: BridgeExemplar[];
  };
};

function createEmptyCounts(): BridgeCountSummary {
  return {
    totalTranscripts: 0,
    scoredTranscripts: 0,
    unresolvedTranscripts: 0,
    exactCount: 0,
    fallbackCount: 0,
    ambiguousCount: 0,
    manualCount: 0,
    legacyNumericCount: 0,
  };
}

function toVignetteKey(run: BridgeRunInput): string {
  if (run.pairKey) {
    return run.pairKey;
  }

  return run.definitionId;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function isScored(decisionCode: string | null): boolean {
  return decisionCode === '1' || decisionCode === '2' || decisionCode === '3' || decisionCode === '4' || decisionCode === '5';
}

function getTranscriptParseClass(transcript: BridgeTranscriptInput): ParseClass {
  if (transcript.parseClass === 'exact') {
    return 'exact';
  }
  if (transcript.parseClass === 'fallback_resolved') {
    return 'fallback_resolved';
  }
  if (transcript.parseClass === 'ambiguous') {
    return 'ambiguous';
  }
  return 'legacy_numeric';
}

function applyTranscriptCounts(summary: BridgeCountSummary, transcript: BridgeTranscriptInput): void {
  const parseClass = getTranscriptParseClass(transcript);
  const manual = transcript.decisionCodeSource === 'manual';
  const scored = isScored(transcript.decisionCode);

  summary.totalTranscripts += 1;
  if (scored) {
    summary.scoredTranscripts += 1;
  } else {
    summary.unresolvedTranscripts += 1;
  }

  if (manual) {
    summary.manualCount += 1;
  }

  if (parseClass === 'exact') {
    summary.exactCount += 1;
  } else if (parseClass === 'fallback_resolved') {
    summary.fallbackCount += 1;
  } else if (parseClass === 'ambiguous') {
    summary.ambiguousCount += 1;
  } else if (scored) {
    summary.legacyNumericCount += 1;
  }
}

function addUnique(values: string[], next: string | null | undefined): void {
  if (!next) return;
  if (!values.includes(next)) {
    values.push(next);
  }
}

export function buildJobChoiceBridgeReport(
  runs: BridgeRunInput[],
  baseUrl = '',
): JobChoiceBridgeReport {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl || '');
  const runSummaries: BridgeRunSummary[] = [];
  const vignetteMap = new Map<string, BridgeVignetteSummary>();
  const modelVignetteMap = new Map<string, BridgeModelVignetteSummary>();
  const exemplars: JobChoiceBridgeReport['exemplars'] = {
    fallback_resolved: [],
    ambiguous: [],
  };

  for (const run of runs) {
    const vignetteKey = toVignetteKey(run);
    const runSummary: BridgeRunSummary = {
      ...createEmptyCounts(),
      runId: run.runId,
      runName: run.runName,
      definitionId: run.definitionId,
      definitionName: run.definitionName,
      vignetteKey,
      responseScale: run.responseScale,
      family: run.family,
      pairKey: run.pairKey,
      presentationOrder: run.presentationOrder,
      launchMode: run.launchMode,
      methodologySafe: run.methodologySafe,
      trialSignature: run.trialSignature,
      models: [],
    };

    const vignetteSummary = vignetteMap.get(vignetteKey) ?? {
      ...createEmptyCounts(),
      vignetteKey,
      pairKey: run.pairKey,
      definitionIds: [],
      definitionNames: [],
      runIds: [],
      responseScales: [],
      models: [],
    };

    addUnique(vignetteSummary.definitionIds, run.definitionId);
    addUnique(vignetteSummary.definitionNames, run.definitionName);
    addUnique(vignetteSummary.runIds, run.runId);
    addUnique(vignetteSummary.responseScales, run.responseScale);

    for (const transcript of run.transcripts) {
      applyTranscriptCounts(runSummary, transcript);
      applyTranscriptCounts(vignetteSummary, transcript);
      addUnique(runSummary.models, transcript.modelId);
      addUnique(vignetteSummary.models, transcript.modelId);

      const modelVignetteKey = `${vignetteKey}::${transcript.modelId}`;
      const modelVignetteSummary = modelVignetteMap.get(modelVignetteKey) ?? {
        ...createEmptyCounts(),
        vignetteKey,
        modelId: transcript.modelId,
        runIds: [],
        responseScales: [],
      };
      addUnique(modelVignetteSummary.runIds, run.runId);
      addUnique(modelVignetteSummary.responseScales, run.responseScale);
      applyTranscriptCounts(modelVignetteSummary, transcript);
      modelVignetteMap.set(modelVignetteKey, modelVignetteSummary);

      const parseClass = getTranscriptParseClass(transcript);
      if (parseClass === 'fallback_resolved' || parseClass === 'ambiguous') {
        const transcriptUrlBase = `${normalizedBaseUrl}/analysis/${run.runId}/transcripts`;
        const transcriptUrl = `${transcriptUrlBase}?transcriptId=${encodeURIComponent(transcript.transcriptId)}`;
        exemplars[parseClass].push({
          transcriptId: transcript.transcriptId,
          runId: run.runId,
          definitionName: run.definitionName,
          vignetteKey,
          modelId: transcript.modelId,
          scenarioId: transcript.scenarioId,
          scenarioName: transcript.scenarioName,
          parseClass,
          decisionCode: transcript.decisionCode,
          decisionCodeSource: transcript.decisionCodeSource,
          matchedLabel: transcript.matchedLabel,
          responseExcerpt: transcript.responseExcerpt,
          parsePath: transcript.parsePath,
          runUrl: `${normalizedBaseUrl}/runs/${run.runId}`,
          transcriptUrl,
        });
      }
    }

    vignetteMap.set(vignetteKey, vignetteSummary);
    runSummaries.push(runSummary);
  }

  const sortByName = <T extends { definitionName?: string; vignetteKey?: string; modelId?: string }>(left: T, right: T) => {
    const leftKey = left.definitionName ?? `${left.vignetteKey ?? ''}${left.modelId ?? ''}`;
    const rightKey = right.definitionName ?? `${right.vignetteKey ?? ''}${right.modelId ?? ''}`;
    return leftKey.localeCompare(rightKey);
  };

  return {
    generatedAt: new Date().toISOString(),
    descriptiveOnly: true,
    totalRuns: runs.length,
    totalTranscripts: runSummaries.reduce((sum, summary) => sum + summary.totalTranscripts, 0),
    runSummaries: runSummaries.sort(sortByName),
    vignetteSummaries: [...vignetteMap.values()].sort(sortByName),
    modelVignetteSummaries: [...modelVignetteMap.values()].sort((left, right) => {
      if (left.vignetteKey === right.vignetteKey) {
        return left.modelId.localeCompare(right.modelId);
      }
      return left.vignetteKey.localeCompare(right.vignetteKey);
    }),
    exemplars: {
      fallback_resolved: exemplars.fallback_resolved,
      ambiguous: exemplars.ambiguous,
    },
  };
}

function formatCountCell(value: number, total: number): string {
  if (total === 0) return '0';
  const share = ((value / total) * 100).toFixed(1);
  return `${value} (${share}%)`;
}

export function renderJobChoiceBridgeMarkdown(report: JobChoiceBridgeReport): string {
  const lines: string[] = [];
  lines.push('# Job Choice Bridge Report');
  lines.push('');
  lines.push('This report is descriptive only. It does not claim cross-family equivalence.');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Runs: ${report.totalRuns}`);
  lines.push(`Transcripts: ${report.totalTranscripts}`);
  lines.push('');

  lines.push('## Per-Run Summary');
  lines.push('');
  lines.push('| Run | Vignette | Signature | Models | Exact | Fallback | Ambiguous | Manual | Unresolved |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const run of report.runSummaries) {
    lines.push(
      `| ${run.runId} | ${run.definitionName} | ${run.trialSignature} | ${run.models.length} | ${run.exactCount} | ${run.fallbackCount} | ${run.ambiguousCount} | ${run.manualCount} | ${run.unresolvedTranscripts} |`,
    );
  }
  lines.push('');

  lines.push('## Per-Vignette Summary');
  lines.push('');
  lines.push('| Vignette | Runs | Models | Exact | Fallback | Ambiguous | Manual | Unresolved |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const vignette of report.vignetteSummaries) {
    lines.push(
      `| ${vignette.definitionNames.join('<br/>')} | ${vignette.runIds.length} | ${vignette.models.length} | ${formatCountCell(vignette.exactCount, vignette.totalTranscripts)} | ${formatCountCell(vignette.fallbackCount, vignette.totalTranscripts)} | ${formatCountCell(vignette.ambiguousCount, vignette.totalTranscripts)} | ${formatCountCell(vignette.manualCount, vignette.totalTranscripts)} | ${formatCountCell(vignette.unresolvedTranscripts, vignette.totalTranscripts)} |`,
    );
  }
  lines.push('');

  lines.push('## Per-Model / Per-Vignette Summary');
  lines.push('');
  lines.push('| Vignette | Model | Total | Exact | Fallback | Ambiguous | Manual | Unresolved |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const summary of report.modelVignetteSummaries) {
    lines.push(
      `| ${summary.vignetteKey} | ${summary.modelId} | ${summary.totalTranscripts} | ${summary.exactCount} | ${summary.fallbackCount} | ${summary.ambiguousCount} | ${summary.manualCount} | ${summary.unresolvedTranscripts} |`,
    );
  }
  lines.push('');

  for (const bucket of ['fallback_resolved', 'ambiguous'] as const) {
    lines.push(`## ${bucket === 'fallback_resolved' ? 'Fallback Exemplars' : 'Ambiguous Exemplars'}`);
    lines.push('');
    if (report.exemplars[bucket].length === 0) {
      lines.push('No exemplars in this bucket.');
      lines.push('');
      continue;
    }
    lines.push('| Transcript | Run | Vignette | Model | Scenario | Parse Path | Matched Label | Transcript Link |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const exemplar of report.exemplars[bucket]) {
      lines.push(
        `| ${exemplar.transcriptId} | ${exemplar.runId} | ${exemplar.definitionName} | ${exemplar.modelId} | ${exemplar.scenarioName ?? exemplar.scenarioId ?? '—'} | ${exemplar.parsePath ?? '—'} | ${exemplar.matchedLabel ?? '—'} | [open](${exemplar.transcriptUrl}) |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
