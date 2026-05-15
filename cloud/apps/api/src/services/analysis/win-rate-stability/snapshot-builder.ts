import { db } from '@valuerank/db';
import { getModelsFromDatabase } from '../../../config/models.js';
import { zAnalysisOutput } from '../aggregate/contracts.js';
import { normalizeAnalysisArtifacts } from '../normalize-analysis-output.js';
import { computeAggregateFingerprint } from '../aggregate/aggregate-helpers.js';
import { formatRunSignature, runMatchesSignature } from '../../../graphql/queries/domain-coverage-gql-types.js';
import {
  resolveDimensionKeys,
  buildConditionGroups,
  computeVignetteStability,
  averageVignetteStability,
  type VignetteStabilityStats,
} from '../../../graphql/queries/models-stability-math.js';
import type { ModelsStabilityResultShape } from '../../../graphql/types/models-stability.js';
import { resolveDomainAnalysisScopeDefinitions } from '../domain-analysis-scope-loader.js';
import type { DomainAnalysisSelection } from '../domain-analysis-scope.js';
import {
  WIN_RATE_STABILITY_ASSUMPTION_PREFIX,
  WIN_RATE_STABILITY_NONE_SIGNATURE,
  WIN_RATE_STABILITY_SNAPSHOT_CODE_VERSION,
  WIN_RATE_STABILITY_SNAPSHOT_TYPE,
  type WinRateStabilitySnapshotOutput,
} from './snapshot-types.js';

export type WinRateStabilityPreparedState = {
  selection: DomainAnalysisSelection;
  signature: string | null;
  configSignature: string;
  // Most-recent run per (definitionId, resolvedSignature), in display order.
  dedupedRunIds: string[];
  inputHash: string;
};

type PrepareRunRow = {
  id: string;
  definitionId: string;
  config: unknown;
  analysisResults: Array<{ id: string; analysisType: string }>;
};

type BuildRunRow = {
  id: string;
  definitionId: string;
  definition: { name: string };
  analysisResults: Array<{ analysisType: string; output: unknown }>;
};

type VignetteEntry = {
  definitionId: string;
  vignetteName: string;
  stats: VignetteStabilityStats;
};

export function buildWinRateStabilityAssumptionKey(scopeId: string): string {
  return `${WIN_RATE_STABILITY_ASSUMPTION_PREFIX}::${scopeId}`;
}

export function normalizeWinRateStabilitySignature(signature: string | null): string {
  return signature ?? WIN_RATE_STABILITY_NONE_SIGNATURE;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractScenarioDimensions(
  visualizationData: Record<string, unknown> | null,
): Record<string, Record<string, number | string>> {
  if (visualizationData == null) return {};
  const raw = visualizationData.scenarioDimensions;
  if (!isPlainObject(raw)) return {};
  const result: Record<string, Record<string, number | string>> = {};
  for (const [scenarioId, dims] of Object.entries(raw)) {
    if (!isPlainObject(dims)) continue;
    const sanitized: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(dims)) {
      if (typeof value === 'number' || typeof value === 'string') {
        sanitized[key] = value;
      }
    }
    if (Object.keys(sanitized).length > 0) {
      result[scenarioId] = sanitized;
    }
  }
  return result;
}

function extractPerScenario(
  varianceAnalysis: Record<string, unknown> | null,
  modelId: string,
): Record<string, unknown> | null {
  if (varianceAnalysis == null) return null;
  const perModel = varianceAnalysis.perModel;
  if (!isPlainObject(perModel)) return null;
  const modelStats = perModel[modelId];
  if (!isPlainObject(modelStats)) return null;
  const perScenario = modelStats.perScenario;
  if (!isPlainObject(perScenario)) return null;
  return perScenario;
}

// Keep the most-recent run per (definitionId, resolvedSignature). `runs` must be
// pre-sorted newest-first so the first occurrence per key wins.
export function dedupeRunsBySignature<T extends { id: string; definitionId: string; config: unknown }>(
  runs: T[],
  signature: string | null,
): T[] {
  const seenKeys = new Set<string>();
  const deduped: T[] = [];
  for (const run of runs) {
    const resolvedSignature = signature ?? formatRunSignature(run.config);
    const key = `${run.definitionId}::${resolvedSignature}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(run);
  }
  return deduped;
}

export async function prepareWinRateStabilityState(params: {
  selection: DomainAnalysisSelection;
  signature: string | null;
}): Promise<WinRateStabilityPreparedState> {
  const { selection, signature } = params;
  const scopeData = await resolveDomainAnalysisScopeDefinitions({
    scope: selection.scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
  });

  const runs = (await db.run.findMany({
    where: {
      status: 'COMPLETED',
      deletedAt: null,
      tags: { some: { tag: { name: 'Aggregate' } } },
      ...(scopeData.domains.length > 0
        ? { definition: { domainId: { in: scopeData.domains.map((domain) => domain.id) } } }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      definitionId: true,
      config: true,
      analysisResults: {
        where: { status: 'CURRENT' },
        select: { id: true, analysisType: true },
      },
    },
  })) as PrepareRunRow[];

  const scopedRuns = signature != null
    ? runs.filter((run) => runMatchesSignature(run.config, signature))
    : runs;
  const dedupedRuns = dedupeRunsBySignature(scopedRuns, signature);

  const definitionIds = [...new Set(dedupedRuns.map((run) => run.definitionId))];
  const definitionRows = definitionIds.length === 0
    ? []
    : await db.definition.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true, updatedAt: true },
      });

  const inputHash = computeAggregateFingerprint({
    codeVersion: WIN_RATE_STABILITY_SNAPSHOT_CODE_VERSION,
    scope: selection.scope,
    domainIds: selection.domainIds.slice().sort(),
    signature: normalizeWinRateStabilitySignature(signature),
    // A re-summarize supersedes the old AGGREGATE analysis and creates a new
    // row with a fresh id, so fingerprinting the CURRENT AGGREGATE id per run
    // invalidates the cache exactly when the underlying analysis changes.
    runs: dedupedRuns
      .map((run) => ({
        runId: run.id,
        aggregateAnalysisId:
          run.analysisResults.find((result) => result.analysisType === 'AGGREGATE')?.id ?? null,
      }))
      .sort((left, right) => left.runId.localeCompare(right.runId)),
    definitions: definitionRows
      .map((definition) => ({ id: definition.id, updatedAt: definition.updatedAt.toISOString() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }).slice(0, 16);

  return {
    selection,
    signature,
    configSignature: normalizeWinRateStabilitySignature(signature),
    dedupedRunIds: dedupedRuns.map((run) => run.id),
    inputHash,
  };
}

export async function buildWinRateStabilityOutput(
  state: WinRateStabilityPreparedState,
): Promise<WinRateStabilitySnapshotOutput> {
  if (state.dedupedRunIds.length === 0) {
    return { models: [], skippedVignettes: [] };
  }

  const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });

  const runs = (await db.run.findMany({
    where: { id: { in: state.dedupedRunIds } },
    select: {
      id: true,
      definitionId: true,
      definition: { select: { name: true } },
      analysisResults: {
        where: { status: 'CURRENT' },
        select: { analysisType: true, output: true },
      },
    },
  })) as BuildRunRow[];

  const definitionIds = [...new Set(runs.map((run) => run.definitionId))];
  const allScenarios = definitionIds.length === 0
    ? []
    : await db.scenario.findMany({
        where: { definitionId: { in: definitionIds }, deletedAt: null },
        select: { id: true, name: true, content: true, definitionId: true },
      });
  const scenariosByDefinition = new Map<string, typeof allScenarios>();
  for (const scenario of allScenarios) {
    const list = scenariosByDefinition.get(scenario.definitionId) ?? [];
    list.push(scenario);
    scenariosByDefinition.set(scenario.definitionId, list);
  }

  const skippedVignettes: ModelsStabilityResultShape['skippedVignettes'] = [];
  const vignetteEntriesByModel = new Map<string, VignetteEntry[]>();
  let validRunCount = 0;

  for (const run of runs) {
    const vignetteName = run.definition.name;
    const definitionId = run.definitionId;

    const analysis = run.analysisResults.find((result) => result.analysisType === 'AGGREGATE');
    if (analysis == null) continue;

    try {
      const parsed = zAnalysisOutput.safeParse(analysis.output);
      if (!parsed.success) {
        skippedVignettes.push({ definitionId, vignetteName, reason: 'normalization-failed' });
        continue;
      }

      const scenarios = scenariosByDefinition.get(definitionId) ?? [];
      const normalized = normalizeAnalysisArtifacts({
        visualizationData: parsed.data.visualizationData ?? null,
        varianceAnalysis: parsed.data.varianceAnalysis ?? null,
        scenarios,
      });

      const scenarioDimensions = extractScenarioDimensions(normalized.visualizationData);
      const dimKeys = resolveDimensionKeys(scenarioDimensions);

      if (dimKeys == null) continue;
      if (dimKeys.inconsistent) {
        skippedVignettes.push({ definitionId, vignetteName, reason: 'inconsistent-dimension-keys' });
        continue;
      }

      validRunCount++;
      const conditionGroups = buildConditionGroups(scenarioDimensions, dimKeys.keys[0], dimKeys.keys[1]);

      for (const model of activeModels) {
        const rawPerScenario = extractPerScenario(normalized.varianceAnalysis, model.modelId);
        if (rawPerScenario == null) continue;

        // Safe cast: data was validated by zAnalysisOutput above
        const vignetteStability = computeVignetteStability(
          conditionGroups,
          rawPerScenario as Parameters<typeof computeVignetteStability>[1],
        );
        if (vignetteStability == null) continue;

        const list = vignetteEntriesByModel.get(model.modelId) ?? [];
        list.push({ definitionId, vignetteName, stats: vignetteStability });
        vignetteEntriesByModel.set(model.modelId, list);
      }
    } catch {
      skippedVignettes.push({ definitionId, vignetteName, reason: 'unexpected-error' });
    }
  }

  if (validRunCount === 0) {
    return { models: [], skippedVignettes };
  }

  const models: ModelsStabilityResultShape['models'] = activeModels.map((model) => {
    const entries = vignetteEntriesByModel.get(model.modelId) ?? [];
    const avg = averageVignetteStability(entries.map((entry) => entry.stats));

    return {
      modelId: model.modelId,
      label: model.displayName,
      qualifyingVignetteCount: entries.length,
      totalTranscriptCount: entries.reduce((sum, entry) => sum + entry.stats.totalTranscriptCount, 0),
      avgDirectionalAgreement: avg?.avgDirectionalAgreement ?? null,
      avgExactAgreement: avg?.avgExactAgreement ?? null,
      stableShare: avg?.stableShare ?? null,
      softLeanShare: avg?.softLeanShare ?? null,
      tornShare: avg?.tornShare ?? null,
      unstableShare: avg?.unstableShare ?? null,
      vignettes: entries.map((entry) => ({
        definitionId: entry.definitionId,
        vignetteName: entry.vignetteName,
        classifiedConditionCount: entry.stats.classifiedCount,
        stableShare: entry.stats.stableShare,
        softLeanShare: entry.stats.softLeanShare,
        tornShare: entry.stats.tornShare,
        unstableShare: entry.stats.unstableShare,
        avgDirectionalAgreement: entry.stats.avgDirectionalAgreement,
        avgExactAgreement: entry.stats.avgExactAgreement,
      })),
    };
  });

  return { models, skippedVignettes };
}

export async function writeWinRateStabilitySnapshot(params: {
  scopeId: string;
  configSignature: string;
  inputHash: string;
  output: WinRateStabilitySnapshotOutput;
}) {
  const assumptionKey = buildWinRateStabilityAssumptionKey(params.scopeId);

  await db.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey,
      analysisType: WIN_RATE_STABILITY_SNAPSHOT_TYPE,
      status: 'CURRENT',
      deletedAt: null,
      OR: [{ configSignature: params.configSignature }, { inputHash: params.inputHash }],
    },
    data: { status: 'SUPERSEDED' },
  });

  return db.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey,
      analysisType: WIN_RATE_STABILITY_SNAPSHOT_TYPE,
      inputHash: params.inputHash,
      codeVersion: WIN_RATE_STABILITY_SNAPSHOT_CODE_VERSION,
      configSignature: params.configSignature,
      config: { scopeId: params.scopeId, signature: params.configSignature },
      output: params.output as object,
      status: 'CURRENT',
      lastValidatedAt: new Date(),
    },
  });
}
