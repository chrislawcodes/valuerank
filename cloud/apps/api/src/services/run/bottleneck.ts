import { db } from '@valuerank/db';

export type TimingSummary = {
  sampleCount: number;
  averageMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type StageSummary = {
  totalCount: number;
  failedCount: number;
  queueWait: TimingSummary;
  execution: TimingSummary;
};

export type BottleneckStage =
  | 'insufficient_data'
  | 'probe_queue'
  | 'probe_execution'
  | 'summarize_queue'
  | 'summarize_execution'
  | 'mixed';

export type BottleneckAction =
  | 'increase_probe_parallelism'
  | 'increase_summarize_parallelism'
  | 'investigate_worker_latency'
  | 'hold';

export type BottleneckConfidence = 'low' | 'medium' | 'high';

export type RunExecutionBottleneck = {
  stage: BottleneckStage;
  action: BottleneckAction;
  confidence: BottleneckConfidence;
  recommendation: string;
  probe: StageSummary;
  summarize: StageSummary;
};

export type ModelExecutionBottleneck = {
  modelId: string;
  displayName: string | null;
  providerName: string | null;
  pressureMs: number;
  stage: BottleneckStage;
  action: BottleneckAction;
  confidence: BottleneckConfidence;
  recommendation: string;
  probe: StageSummary;
  summarize: StageSummary;
};

type ProbeResultRow = {
  modelId: string;
  status: 'SUCCESS' | 'FAILED';
  queuedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
};

type TranscriptRow = {
  modelId: string;
  summarizeQueuedAt: Date | null;
  summarizedAt: Date | null;
  summarizeFailedAt: Date | null;
  summarizeDurationMs: number | null;
};

type ModelMetaRow = {
  modelId: string;
  displayName: string | null;
  providerName: string | null;
};

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

function summarizeNumbers(values: number[]): TimingSummary {
  if (values.length === 0) {
    return {
      sampleCount: 0,
      averageMs: null,
      p95Ms: null,
      maxMs: null,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: values.length,
    averageMs: Math.round(total / values.length),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
  };
}

function classifyStage(
  stage: 'probe' | 'summarize',
  summary: StageSummary,
): { stage: BottleneckStage; action: BottleneckAction; pressureMs: number; confidence: BottleneckConfidence } | null {
  const queuePressure = summary.queueWait.p95Ms ?? summary.queueWait.averageMs;
  const executionPressure = summary.execution.p95Ms ?? summary.execution.averageMs;

  if (queuePressure == null && executionPressure == null) {
    return null;
  }

  const queueCount = summary.queueWait.sampleCount;
  const executionCount = summary.execution.sampleCount;
  const sampleCount = Math.max(queueCount, executionCount);
  const confidence: BottleneckConfidence = sampleCount >= 20 ? 'high' : sampleCount >= 5 ? 'medium' : 'low';

  if (queuePressure != null && executionPressure != null) {
    if (queuePressure >= executionPressure * 2) {
      return {
        stage: stage === 'probe' ? 'probe_queue' : 'summarize_queue',
        action: stage === 'probe' ? 'increase_probe_parallelism' : 'increase_summarize_parallelism',
        pressureMs: queuePressure,
        confidence,
      };
    }

    if (executionPressure >= queuePressure * 2) {
      return {
        stage: stage === 'probe' ? 'probe_execution' : 'summarize_execution',
        action: 'investigate_worker_latency',
        pressureMs: executionPressure,
        confidence,
      };
    }

    return {
      stage: 'mixed',
      action: 'hold',
      pressureMs: Math.max(queuePressure, executionPressure),
      confidence,
    };
  }

  if (queuePressure != null) {
    return {
      stage: stage === 'probe' ? 'probe_queue' : 'summarize_queue',
      action: stage === 'probe' ? 'increase_probe_parallelism' : 'increase_summarize_parallelism',
      pressureMs: queuePressure,
      confidence,
    };
  }

  return {
    stage: stage === 'probe' ? 'probe_execution' : 'summarize_execution',
    action: 'investigate_worker_latency',
    pressureMs: executionPressure ?? 0,
    confidence,
  };
}

function buildStageSummary<T>(
  rows: T[],
  getQueueWaitMs: (row: T) => number | null,
  getExecutionMs: (row: T) => number | null,
  getFailed: (row: T) => boolean,
): StageSummary {
  const queueWaitValues: number[] = [];
  const executionValues: number[] = [];
  let failedCount = 0;

  for (const row of rows) {
    const queueWaitMs = getQueueWaitMs(row);
    if (queueWaitMs != null) {
      queueWaitValues.push(queueWaitMs);
    }

    const executionMs = getExecutionMs(row);
    if (executionMs != null) {
      executionValues.push(executionMs);
    }

    if (getFailed(row)) {
      failedCount++;
    }
  }

  return {
    totalCount: rows.length,
    failedCount,
    queueWait: summarizeNumbers(queueWaitValues),
    execution: summarizeNumbers(executionValues),
  };
}

function formatRecommendation(
  label: string | null,
  probeSummary: StageSummary,
  summarizeSummary: StageSummary,
  stage: BottleneckStage,
): string {
  const prefix = label != null && label.trim() !== '' ? `${label.trim()}: ` : '';
  switch (stage) {
    case 'probe_queue':
      return `${prefix}probe queue wait is dominating probe execution time. Increase probe parallelism or provider capacity.`;
    case 'probe_execution':
      return `${prefix}probe execution time is dominating queue wait. More threads are unlikely to help; investigate provider latency or model slowness.`;
    case 'summarize_queue':
      return `${prefix}summarize queue wait is dominating summarize execution time. Increase summarize parallelism or worker capacity.`;
    case 'summarize_execution':
      return `${prefix}summarize execution time is dominating queue wait. More threads are unlikely to help; investigate summarizer latency or batch size.`;
    case 'mixed':
      return `${prefix}probe and summarize both show pressure. Probe queue p95=${probeSummary.queueWait.p95Ms ?? 'n/a'}ms, summarize queue p95=${summarizeSummary.queueWait.p95Ms ?? 'n/a'}ms.`;
    case 'insufficient_data':
    default:
      return `${prefix}not enough completed timing data yet to identify a bottleneck.`;
  }
}

function summarizeRunExecutionBottleneckFromSummaries(
  probeSummary: StageSummary,
  summarizeSummary: StageSummary,
): Omit<RunExecutionBottleneck, 'recommendation'> & { pressureMs: number } {
  const probeCandidate = classifyStage('probe', probeSummary);
  const summarizeCandidate = classifyStage('summarize', summarizeSummary);

  const candidates = [probeCandidate, summarizeCandidate].filter(
    (candidate): candidate is NonNullable<typeof candidate> => candidate !== null,
  );

  const actionableCandidates = candidates.filter((candidate) => candidate.stage !== 'mixed');
  const rankedCandidates = actionableCandidates.length > 0 ? actionableCandidates : candidates;

  let chosen = rankedCandidates[0] ?? null;
  for (const candidate of rankedCandidates.slice(1)) {
    if (chosen === null || candidate.pressureMs > chosen.pressureMs) {
      chosen = candidate;
    }
  }

  return {
    stage: chosen?.stage ?? 'insufficient_data',
    action: chosen?.action ?? 'hold',
    confidence: chosen?.confidence ?? 'low',
    pressureMs: chosen?.pressureMs ?? 0,
    probe: probeSummary,
    summarize: summarizeSummary,
  };
}

function summarizeModelExecutionBottleneckFromSummaries(
  modelId: string,
  displayName: string | null,
  providerName: string | null,
  probeSummary: StageSummary,
  summarizeSummary: StageSummary,
): ModelExecutionBottleneck {
  const runSummary = summarizeRunExecutionBottleneckFromSummaries(probeSummary, summarizeSummary);
  const label = displayName ?? modelId;
  return {
    modelId,
    displayName: label,
    providerName,
    pressureMs: runSummary.pressureMs,
    stage: runSummary.stage,
    action: runSummary.action,
    confidence: runSummary.confidence,
    recommendation: formatRecommendation(label, probeSummary, summarizeSummary, runSummary.stage),
    probe: probeSummary,
    summarize: summarizeSummary,
  };
}

function buildModelExecutionBottlenecks(
  probeRows: ProbeResultRow[],
  transcriptRows: TranscriptRow[],
  modelMetadata: Map<string, ModelMetaRow>,
): ModelExecutionBottleneck[] {
  const modelBuckets = new Map<string, { probeRows: ProbeResultRow[]; transcriptRows: TranscriptRow[] }>();

  const ensureBucket = (modelId: string) => {
    const bucket = modelBuckets.get(modelId);
    if (bucket !== undefined) {
      return bucket;
    }

    const newBucket = { probeRows: [] as ProbeResultRow[], transcriptRows: [] as TranscriptRow[] };
    modelBuckets.set(modelId, newBucket);
    return newBucket;
  };

  for (const row of probeRows) {
    ensureBucket(row.modelId).probeRows.push(row);
  }

  for (const row of transcriptRows) {
    ensureBucket(row.modelId).transcriptRows.push(row);
  }

  const bottlenecks: ModelExecutionBottleneck[] = [];
  for (const [modelId, bucket] of modelBuckets.entries()) {
    const metadata = modelMetadata.get(modelId) ?? null;
    const probeSummary = buildStageSummary(
      bucket.probeRows,
      (row) => {
        const completedAt = row.completedAt ?? row.createdAt;
        if (row.queuedAt == null) {
          return null;
        }
        return completedAt.getTime() - row.queuedAt.getTime();
      },
      (row) => (row.status === 'SUCCESS' && row.durationMs != null ? row.durationMs : null),
      (row) => row.status === 'FAILED',
    );

    const summarizeSummary = buildStageSummary(
      bucket.transcriptRows,
      (row) => {
        const completedAt = row.summarizedAt ?? row.summarizeFailedAt;
        if (row.summarizeQueuedAt == null || completedAt == null) {
          return null;
        }
        return completedAt.getTime() - row.summarizeQueuedAt.getTime();
      },
      (row) => row.summarizeDurationMs,
      (row) => row.summarizeFailedAt != null,
    );

    bottlenecks.push(
      summarizeModelExecutionBottleneckFromSummaries(
        modelId,
        metadata?.displayName ?? null,
        metadata?.providerName ?? null,
        probeSummary,
        summarizeSummary,
      ),
    );
  }

  return bottlenecks.sort((a, b) => {
    if (b.pressureMs !== a.pressureMs) {
      return b.pressureMs - a.pressureMs;
    }
    if (b.probe.totalCount !== a.probe.totalCount) {
      return b.probe.totalCount - a.probe.totalCount;
    }
    return a.modelId.localeCompare(b.modelId);
  });
}

function summarizeRunExecutionBottleneck(
  probeRows: ProbeResultRow[],
  transcriptRows: TranscriptRow[],
): RunExecutionBottleneck {
  const probeSummary = buildStageSummary(
    probeRows,
    (row) => {
      const completedAt = row.completedAt ?? row.createdAt;
      if (row.queuedAt == null) {
        return null;
      }
      return completedAt.getTime() - row.queuedAt.getTime();
    },
    (row) => (row.status === 'SUCCESS' && row.durationMs != null ? row.durationMs : null),
    (row) => row.status === 'FAILED',
  );

  const summarizeSummary = buildStageSummary(
    transcriptRows,
    (row) => {
      const completedAt = row.summarizedAt ?? row.summarizeFailedAt;
      if (row.summarizeQueuedAt == null || completedAt == null) {
        return null;
      }
      return completedAt.getTime() - row.summarizeQueuedAt.getTime();
    },
    (row) => row.summarizeDurationMs,
    (row) => row.summarizeFailedAt != null,
  );

  const summarized = summarizeRunExecutionBottleneckFromSummaries(probeSummary, summarizeSummary);
  return {
    stage: summarized.stage,
    action: summarized.action,
    confidence: summarized.confidence,
    recommendation: formatRecommendation(null, probeSummary, summarizeSummary, summarized.stage),
    probe: summarized.probe,
    summarize: summarized.summarize,
  };
}

async function loadRunExecutionTimingRows(runId: string): Promise<{ probeRows: ProbeResultRow[]; transcriptRows: TranscriptRow[] }> {
  const [probeRows, transcriptRows] = await Promise.all([
    db.probeResult.findMany({
      where: { runId, deletedAt: null },
      select: {
        modelId: true,
        status: true,
        queuedAt: true,
        createdAt: true,
        completedAt: true,
        durationMs: true,
      },
    }),
    db.transcript.findMany({
      where: { runId, deletedAt: null },
      select: {
        modelId: true,
        summarizeQueuedAt: true,
        summarizedAt: true,
        summarizeFailedAt: true,
        summarizeDurationMs: true,
      },
    }),
  ]);
  return { probeRows: probeRows as ProbeResultRow[], transcriptRows: transcriptRows as TranscriptRow[] };
}

export async function getRunExecutionBottleneck(runId: string): Promise<RunExecutionBottleneck> {
  const { probeRows, transcriptRows } = await loadRunExecutionTimingRows(runId);
  return summarizeRunExecutionBottleneck(probeRows, transcriptRows);
}

export async function getRunModelExecutionBottlenecks(runId: string): Promise<ModelExecutionBottleneck[]> {
  const { probeRows, transcriptRows } = await loadRunExecutionTimingRows(runId);
  const modelIds = new Set<string>();
  for (const row of probeRows) {
    modelIds.add(row.modelId);
  }
  for (const row of transcriptRows) {
    modelIds.add(row.modelId);
  }

  if (modelIds.size === 0) {
    return [];
  }

  const metadataRows = await db.llmModel.findMany({
    where: { modelId: { in: [...modelIds] } },
    select: {
      modelId: true,
      displayName: true,
      provider: {
        select: {
          name: true,
          displayName: true,
        },
      },
    },
  });

  const metadataMap = new Map<string, ModelMetaRow>();
  for (const row of metadataRows) {
    if (!metadataMap.has(row.modelId)) {
      metadataMap.set(row.modelId, {
        modelId: row.modelId,
        displayName: row.displayName,
        providerName: row.provider.displayName ?? row.provider.name,
      });
    }
  }

  return buildModelExecutionBottlenecks(probeRows, transcriptRows, metadataMap);
}
