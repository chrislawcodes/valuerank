import { formatTrialSignature, formatVnewLabel, formatVnewSignature, isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { parseTemperature } from '../../../utils/temperature.js';
import { parseDefinitionVersion } from '../../../utils/definition-version.js';

export type DomainAvailableSignatureOption = {
  signature: string;
  label: string;
  isVirtual: boolean;
  temperature: number | null;
};

type RunConfigLike = {
  config: unknown;
};

type ExistingRunLike = {
  definitionId: string;
  status: string;
  runCategory: string;
  config: unknown;
};

type TrialRunRowLike = {
  id: string;
  definitionId: string;
  status: string;
  updatedAt: Date;
  stalledModels: string[] | null;
  config: unknown;
};

type TrialRunGroupByRowLike = {
  runId: string;
  modelId: string;
  status?: string;
  count: number;
};

type FailedProbeRowLike = {
  runId: string;
  modelId: string;
  errorCode: string | null;
  errorMessage: string | null;
};

type TrialRunModelStatus = {
  modelId: string;
  generationCompleted: number;
  generationFailed: number;
  generationTotal: number;
  summarizationCompleted: number;
  summarizationFailed: number;
  summarizationTotal: number;
  latestErrorMessage: string | null;
};

export type TrialRunStatusRow = {
  runId: string;
  definitionId: string;
  status: string;
  updatedAt: Date;
  stalledModels: string[];
  analysisStatus: string | null;
  modelStatuses: TrialRunModelStatus[];
};

function formatRunSignature(config: unknown): string {
  const runConfig = config as {
    definitionSnapshot?: {
      _meta?: { definitionVersion?: unknown };
      version?: unknown;
    };
    temperature?: unknown;
  } | null;
  const definitionVersion =
    parseDefinitionVersion(runConfig?.definitionSnapshot?._meta?.definitionVersion) ??
    parseDefinitionVersion(runConfig?.definitionSnapshot?.version);
  const temperature = parseTemperature(runConfig?.temperature);
  return formatTrialSignature(definitionVersion, temperature);
}

export function selectDefaultVnewSignature(completedRuns: RunConfigLike[]): string | null {
  if (completedRuns.length === 0) return null;
  const temperatureCounts = new Map<string, { temperature: number | null; count: number }>();

  for (const run of completedRuns) {
    const runConfig = run.config as { temperature?: unknown } | null;
    const temperature = parseTemperature(runConfig?.temperature);
    const key = temperature === null ? 'd' : temperature.toString();
    const existing = temperatureCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      temperatureCounts.set(key, { temperature, count: 1 });
    }
  }

  const winner = Array.from(temperatureCounts.values())
    .sort((left, right) => {
      const leftIsZero = left.temperature === 0;
      const rightIsZero = right.temperature === 0;
      if (leftIsZero !== rightIsZero) return leftIsZero ? -1 : 1;
      if (left.count !== right.count) return right.count - left.count;
      if (left.temperature === null) return 1;
      if (right.temperature === null) return -1;
      return left.temperature - right.temperature;
    })[0];

  if (!winner) return null;
  return formatVnewSignature(winner.temperature);
}

export function runMatchesSignature(runConfig: unknown, signature: string): boolean {
  if (isVnewSignature(signature)) {
    return parseTemperature((runConfig as { temperature?: unknown } | null)?.temperature) === parseVnewTemperature(signature);
  }
  return formatRunSignature(runConfig) === signature;
}

export function buildAvailableSignatureOptions(completedRuns: RunConfigLike[]): DomainAvailableSignatureOption[] {
  const exactSignatureSet = new Set<string>();
  const temperatureCounts = new Map<string, { temperature: number | null; count: number }>();

  for (const run of completedRuns) {
    exactSignatureSet.add(formatRunSignature(run.config));
    const runConfig = run.config as { temperature?: unknown } | null;
    const temperature = parseTemperature(runConfig?.temperature);
    const key = temperature === null ? 'd' : temperature.toString();
    const existing = temperatureCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      temperatureCounts.set(key, { temperature, count: 1 });
    }
  }

  const vnewCandidates = Array.from(temperatureCounts.values())
    .sort((left, right) => {
      const leftIsZero = left.temperature === 0;
      const rightIsZero = right.temperature === 0;
      if (leftIsZero !== rightIsZero) return leftIsZero ? -1 : 1;
      if (left.count !== right.count) return right.count - left.count;
      if (left.temperature === null) return 1;
      if (right.temperature === null) return -1;
      return left.temperature - right.temperature;
    });

  const virtualSignatures = vnewCandidates.map((entry) => ({
    signature: formatVnewSignature(entry.temperature),
    label: formatVnewLabel(entry.temperature),
    isVirtual: true,
    temperature: entry.temperature,
  }));
  const exactSignatures = Array.from(exactSignatureSet.values())
    .sort((left, right) => left.localeCompare(right))
    .map((signature) => ({
      signature,
      label: signature,
      isVirtual: false,
      temperature: null,
    }));

  return [...virtualSignatures, ...exactSignatures];
}

export function buildExistingBatchCountByDefinitionId(
  existingRuns: ExistingRunLike[],
  effectiveScopeCategory: string,
  temperature: number | null,
): Map<string, number> {
  const countableStatuses = new Set(['COMPLETED', 'PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING']);
  const counts = new Map<string, number>();

  for (const run of existingRuns) {
    if (!countableStatuses.has(run.status)) continue;
    if (run.runCategory !== effectiveScopeCategory) continue;
    const runConfig = run.config as { temperature?: unknown } | null;
    const runTemperature = parseTemperature(runConfig?.temperature);
    if (runTemperature !== temperature) continue;
    const prev = counts.get(run.definitionId) ?? 0;
    counts.set(run.definitionId, prev + 1);
  }

  return counts;
}

export function buildTrialRunStatusRows(
  runIds: string[],
  runs: TrialRunRowLike[],
  probeRows: TrialRunGroupByRowLike[],
  transcriptRows: TrialRunGroupByRowLike[],
  summarizedRows: TrialRunGroupByRowLike[],
  summarizeFailedRows: TrialRunGroupByRowLike[],
  selectedScenarioCounts: Array<{ runId: string; count: number }>,
  failedProbeRows: FailedProbeRowLike[],
  analysisStatusByRunId: Map<string, string | null>,
): TrialRunStatusRow[] {
  const probeByKey = new Map<string, { completed: number; failed: number }>();
  for (const row of probeRows) {
    const key = `${row.runId}::${row.modelId}`;
    const existing = probeByKey.get(key) ?? { completed: 0, failed: 0 };
    if (row.status === 'SUCCESS') {
      existing.completed = row.count;
    } else if (row.status === 'FAILED') {
      existing.failed = row.count;
    }
    probeByKey.set(key, existing);
  }

  const transcriptTotalByKey = new Map<string, number>();
  for (const row of transcriptRows) {
    transcriptTotalByKey.set(`${row.runId}::${row.modelId}`, row.count);
  }

  const summarizedByKey = new Map<string, number>();
  for (const row of summarizedRows) {
    summarizedByKey.set(`${row.runId}::${row.modelId}`, row.count);
  }

  const summarizeFailedByKey = new Map<string, number>();
  for (const row of summarizeFailedRows) {
    summarizeFailedByKey.set(`${row.runId}::${row.modelId}`, row.count);
  }

  const latestErrorByKey = new Map<string, string>();
  for (const row of failedProbeRows) {
    const key = `${row.runId}::${row.modelId}`;
    if (latestErrorByKey.has(key)) continue;
    const messageParts = [row.errorCode, row.errorMessage].filter(
      (part): part is string => typeof part === 'string' && part.trim() !== '',
    );
    latestErrorByKey.set(key, messageParts.length > 0 ? messageParts.join(' - ') : 'Model probe failed.');
  }

  const scenarioCountByRun = new Map(selectedScenarioCounts.map((row) => [row.runId, row.count]));
  const runById = new Map(runs.map((run) => [run.id, run]));

  return runIds
    .map((runId) => {
      const run = runById.get(runId);
      if (run === undefined) return null;

      const runConfig = run.config as { models?: unknown; samplesPerScenario?: unknown } | null;
      const models = Array.isArray(runConfig?.models)
        ? runConfig.models.filter((model): model is string => typeof model === 'string')
        : [];
      const samplesPerScenario = typeof runConfig?.samplesPerScenario === 'number' && Number.isFinite(runConfig.samplesPerScenario)
        ? runConfig.samplesPerScenario
        : 1;
      const generationTotal = (scenarioCountByRun.get(run.id) ?? 0) * samplesPerScenario;

      const modelStatuses = models.map((modelId) => {
        const key = `${run.id}::${modelId}`;
        const probe = probeByKey.get(key) ?? { completed: 0, failed: 0 };
        const summarizationTotal = transcriptTotalByKey.get(key) ?? 0;
        return {
          modelId,
          generationCompleted: probe.completed,
          generationFailed: probe.failed,
          generationTotal,
          summarizationCompleted: summarizedByKey.get(key) ?? 0,
          summarizationFailed: summarizeFailedByKey.get(key) ?? 0,
          summarizationTotal,
          latestErrorMessage: latestErrorByKey.get(key) ?? null,
        };
      });

      return {
        runId: run.id,
        definitionId: run.definitionId,
        status: run.status,
        updatedAt: run.updatedAt,
        stalledModels: run.stalledModels ?? [],
        analysisStatus: analysisStatusByRunId.get(run.id) ?? null,
        modelStatuses,
      };
    })
    .filter((row): row is TrialRunStatusRow => row !== null);
}
