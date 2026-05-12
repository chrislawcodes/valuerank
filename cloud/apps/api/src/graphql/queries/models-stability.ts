import { db } from '@valuerank/db';
import { getModelsFromDatabase } from '../../config/models.js';
import { zAnalysisOutput } from '../../services/analysis/aggregate/contracts.js';
import { normalizeAnalysisArtifacts } from '../../services/analysis/normalize-analysis-output.js';
import { builder } from '../builder.js';
import { ModelsStabilityResultRef, type ModelsStabilityResultShape } from '../types/models-stability.js';
import { formatRunSignature, runMatchesSignature } from './domain-coverage-gql-types.js';
import { normalizeDomainIds, resolveDomainAnalysisSelection } from '../../services/analysis/domain-analysis-scope.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import {
  resolveDimensionKeys,
  buildConditionGroups,
  computeVignetteStability,
  averageVignetteStability,
  type VignetteStabilityStats,
} from './models-stability-math.js';

type RunRow = {
  id: string;
  definitionId: string;
  createdAt: Date;
  config: unknown;
  definition: { name: string };
  analysisResults: Array<{ analysisType: string; output: unknown }>;
};

type VignetteEntry = {
  definitionId: string;
  vignetteName: string;
  stats: VignetteStabilityStats;
};

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

builder.queryField('modelsWinRateStability', (t) =>
  t.field({
    type: ModelsStabilityResultRef,
    args: {
      signature: t.arg.string({ required: false }),
      domainId: t.arg.id({ required: false }),
      domainIds: t.arg.idList({ required: false }),
    },
    resolve: async (_root, args) => {
      const signature = args.signature != null ? String(args.signature) : null;
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const domainIds = normalizeDomainIds(args.domainIds?.map(String) ?? null);
      const selection = resolveDomainAnalysisSelection({ domainId, domainIds });
      const scopeData = await resolveDomainAnalysisScopeDefinitions({
        scope: selection.scope,
        domainId: selection.domainId,
        domainIds: selection.domainIds,
      });

      const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });

      const runs = await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { some: { tag: { name: 'Aggregate' } } },
          ...(scopeData.domains.length > 0 ? { definition: { domainId: { in: scopeData.domains.map((domain) => domain.id) } } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          definitionId: true,
          createdAt: true,
          config: true,
          definition: { select: { name: true } },
          analysisResults: {
            where: { status: 'CURRENT' },
            select: { analysisType: true, output: true },
          },
        },
      }) as RunRow[];

      const scopedRuns = signature != null
        ? runs.filter((run) => runMatchesSignature(run.config, signature))
        : runs;

      // Dedup: keep most-recent run per (definitionId, resolvedSignature)
      const seenKeys = new Set<string>();
      const dedupedRuns: RunRow[] = [];
      for (const run of scopedRuns) {
        const resolvedSignature = signature ?? formatRunSignature(run.config);
        const key = `${run.definitionId}::${resolvedSignature}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        dedupedRuns.push(run);
      }

      if (dedupedRuns.length === 0) {
        return { models: [], skippedVignettes: [] };
      }

      // Batch-fetch scenarios for all unique definitionIds
      const definitionIds = [...new Set(dedupedRuns.map((r) => r.definitionId))];
      const allScenarios = await db.scenario.findMany({
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

      for (const run of dedupedRuns) {
        const vignetteName = run.definition.name;
        const definitionId = run.definitionId;

        const analysis = run.analysisResults.find((ar) => ar.analysisType === 'AGGREGATE');
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
        } catch (err) {
          skippedVignettes.push({ definitionId, vignetteName, reason: 'unexpected-error' });
        }
      }

      if (validRunCount === 0) {
        return { models: [], skippedVignettes };
      }

      const outputModels: ModelsStabilityResultShape['models'] = activeModels.map((model) => {
        const entries = vignetteEntriesByModel.get(model.modelId) ?? [];
        const avg = averageVignetteStability(entries.map((e) => e.stats));

        return {
          modelId: model.modelId,
          label: model.displayName,
          qualifyingVignetteCount: entries.length,
          avgDirectionalAgreement: avg?.avgDirectionalAgreement ?? null,
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
          })),
        };
      });

      return { models: outputModels, skippedVignettes };
    },
  }),
);
