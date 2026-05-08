import { ValidationError } from '@valuerank/shared';
import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { getModelsFromDatabase } from '../../config/models.js';
import {
  ModelGroupingSignificanceResultRef,
  type ModelGroupingSignificanceRowShape,
} from '../types/model-grouping-significance.js';
import {
  classifyEffectSize,
  classifyVerdict,
  holmBonferroni,
  bootstrapMeanDiffCI,
  rankBiserialCorrelation,
  wilcoxonSignedRank,
} from '../../services/model-grouping-significance/math.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from '../queries/domain/shared.js';
import {
  readDefinitionModelVotesFromSnapshot,
  queueDomainAnalysisRefresh,
} from '../../services/analysis/domain-analysis-cache.js';
import type { DomainAnalysisScope } from '../../services/analysis/domain-analysis-scope.js';

const ALL_DOMAINS_SCOPE_ID = 'all-domains';
type ModelSummary = { modelId: string; label: string };
type WinLossCounts = { wins: number; losses: number };

function normalizeModelIds(modelIds: ReadonlyArray<string>): string[] {
  return [...new Set(modelIds.map((modelId) => modelId.trim()).filter((modelId) => modelId.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function sortModels(models: ReadonlyArray<ModelSummary>): ModelSummary[] {
  return [...models].sort((left, right) => {
    const labelDelta = left.label.localeCompare(right.label);
    return labelDelta !== 0 ? labelDelta : left.modelId.localeCompare(right.modelId);
  });
}

function encodeDefinitionModelKey(definitionId: string, modelId: string): string { return `${definitionId}::${modelId}`; }

function computeWinRate(wins: number, losses: number): number | undefined {
  const total = wins + losses;
  if (total === 0) return undefined;
  return wins / total;
}

function intersectCoveredDefinitions(models: ReadonlyArray<ModelSummary>, coverageByModel: Map<string, Set<string>>): Set<string> {
  const firstCoverage = coverageByModel.get(models[0]!.modelId) ?? new Set<string>();
  const intersection = new Set(firstCoverage);

  for (const model of models.slice(1)) {
    const currentCoverage = coverageByModel.get(model.modelId) ?? new Set<string>();
    for (const definitionId of [...intersection]) {
      if (!currentCoverage.has(definitionId)) {
        intersection.delete(definitionId);
      }
    }
  }

  return intersection;
}

builder.queryField('modelGroupingSignificance', (t) =>
  t.field({
    type: ModelGroupingSignificanceResultRef,
    args: {
      modelIds: t.arg.stringList({ required: true }),
      domainId: t.arg.id({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const scopeValue = String(args.scope);
      if (scopeValue !== 'DOMAIN' && scopeValue !== 'ALL_DOMAINS') {
        throw new ValidationError(`Unsupported scope: ${scopeValue}`);
      }
      const scope: DomainAnalysisScope = scopeValue;

      const domainId = args.domainId != null ? String(args.domainId).trim() : null;
      if (scope === 'DOMAIN' && (domainId == null || domainId.length === 0)) {
        throw new ValidationError('domainId is required when scope is DOMAIN');
      }

      const signature = String(args.signature).trim();
      if (signature.length === 0) {
        throw new ValidationError('signature is required');
      }

      const selectedModelIds = normalizeModelIds(args.modelIds.map(String));
      if (selectedModelIds.length < 2) {
        throw new ValidationError('At least two distinct modelIds are required.');
      }

      const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });
      const labelByModelId = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
      const sortedModels = sortModels(
        selectedModelIds.map((modelId) => ({
          modelId,
          label: labelByModelId.get(modelId) ?? modelId,
        })),
      );

      const scopeData = await resolveDomainAnalysisScopeDefinitions({
        scope,
        domainId: domainId ?? ALL_DOMAINS_SCOPE_ID,
      });
      const defaultModelIds = scopeData.domain.defaultModelIds;
      const resolvedSignatureRuns = await resolveSignatureRuns(scopeData.latestDefinitionIds, signature, defaultModelIds);

      if (resolvedSignatureRuns.filteredSourceRunIds.length === 0) {
        throw new ValidationError(
          'Pairwise significance could not be computed because no completed runs were found for the selected scope.',
        );
      }

      const selectedModelIdSet = new Set(sortedModels.map((model) => model.modelId));

      // Fast path: read pre-computed per-(definitionId::modelId) vote counts from the
      // domain-analysis snapshot (built by v1.10.0+). Falls back to the two-query DB
      // scan when the snapshot is absent or pre-dates v1.10.0.
      const snapshotVotes = await readDefinitionModelVotesFromSnapshot(
        scope,
        domainId ?? ALL_DOMAINS_SCOPE_ID,
        signature,
      );

      const countsByDefinitionModel = new Map<string, WinLossCounts>();

      if (snapshotVotes == null) {
        // Snapshot not yet available for this scope/signature. Queue a rebuild of
        // the domain-analysis snapshot (which will populate definitionModelVotes)
        // and return a pending result immediately so the client can retry.
        await queueDomainAnalysisRefresh({
          scope,
          domainId: domainId ?? ALL_DOMAINS_SCOPE_ID,
          signature,
          reason: 'significance-page-load-missing',
        });
        ctx.log.info({ scope, domainId, signature }, 'Significance: snapshot not ready — rebuild queued, returning pending');
        return { models: [], rows: [], pending: true };
      }

      // Snapshot fast path: populate counts directly, no transcript queries needed.
      for (const [key, votes] of Object.entries(snapshotVotes)) {
        const parts = key.split('::');
        const modelId = parts[1];
        if (modelId !== undefined && selectedModelIdSet.has(modelId)) {
          countsByDefinitionModel.set(key, { wins: votes.wins, losses: votes.losses });
        }
      }
      ctx.log.debug({ scope, domainId, signature }, 'Significance: used domain-analysis snapshot (fast path)');

      const coverageByModel = new Map(sortedModels.map((model) => [model.modelId, new Set<string>()] as const));
      for (const [key, counts] of countsByDefinitionModel.entries()) {
        if (counts.wins <= 0 && counts.losses <= 0) continue;
        const [definitionId, modelId] = key.split('::');
        if (definitionId === undefined || modelId === undefined) continue;
        coverageByModel.get(modelId)?.add(definitionId);
      }

      const missingModels = sortedModels.filter((model) => (coverageByModel.get(model.modelId)?.size ?? 0) === 0);
      if (missingModels.length > 0) {
        throw new ValidationError(
          `Pairwise significance could not be computed because the following models have no scored vignette coverage in the selected scope: ${missingModels.map((model) => model.label).join(', ')}.`,
        );
      }

      const coveredDefinitionIds = intersectCoveredDefinitions(sortedModels, coverageByModel);
      if (coveredDefinitionIds.size === 0) {
        throw new ValidationError(
          'Pairwise significance could not be computed because there are no vignettes with complete coverage for all selected models in the selected scope.',
        );
      }

      // Fetch definition names for pairing
      const coveredIdsArray = [...coveredDefinitionIds];
      const definitionRows = await db.definition.findMany({
        where: { id: { in: coveredIdsArray }, deletedAt: null },
        select: { id: true, name: true },
      });
      const nameById = new Map(definitionRows.map((def) => [def.id, def.name]));

      // Pair definitions: "A -> B" pairs with "B -> A"
      type ValuePair = { ids: [string] | [string, string] };
      const valuePairs: ValuePair[] = [];
      const paired = new Set<string>();

      for (const idA of coveredIdsArray) {
        if (paired.has(idA)) continue;
        const nameA = nameById.get(idA);
        if (nameA == null) {
          valuePairs.push({ ids: [idA] });
          paired.add(idA);
          continue;
        }
        const parts = nameA.split(' -> ');
        const reversedName =
          parts.length === 2 ? `${parts[1]!.trim()} -> ${parts[0]!.trim()}` : null;

        let partnerId: string | undefined;
        if (reversedName != null) {
          partnerId = coveredIdsArray.find(
            (idB) => !paired.has(idB) && idB !== idA && nameById.get(idB) === reversedName,
          );
        }

        if (partnerId != null) {
          valuePairs.push({ ids: [idA, partnerId] });
          paired.add(idA);
          paired.add(partnerId);
        } else {
          valuePairs.push({ ids: [idA] });
          paired.add(idA);
        }
      }

      // Compute avgWinRate per (valuePair, model) and track maxOrderEffect
      let maxOrderEffect = 0;
      const avgWinRateByPair: Array<Map<string, number | undefined>> = valuePairs.map((pair) => {
        const byModel = new Map<string, number | undefined>();
        for (const model of sortedModels) {
          if (pair.ids.length === 1) {
            const counts = countsByDefinitionModel.get(encodeDefinitionModelKey(pair.ids[0], model.modelId));
            byModel.set(model.modelId, counts != null ? computeWinRate(counts.wins, counts.losses) : undefined);
          } else {
            const [idA, idB] = pair.ids as [string, string];
            const countsA = countsByDefinitionModel.get(encodeDefinitionModelKey(idA, model.modelId));
            const countsB = countsByDefinitionModel.get(encodeDefinitionModelKey(idB, model.modelId));
            const wrA = countsA != null ? computeWinRate(countsA.wins, countsA.losses) : undefined;
            const wrB = countsB != null ? computeWinRate(countsB.wins, countsB.losses) : undefined;
            if (wrA !== undefined && wrB !== undefined) {
              byModel.set(model.modelId, (wrA + wrB) / 2);
              const orderEffect = Math.abs(wrA - wrB);
              if (orderEffect > maxOrderEffect) maxOrderEffect = orderEffect;
            } else {
              byModel.set(model.modelId, undefined);
            }
          }
        }
        return byModel;
      });

      const rows: ModelGroupingSignificanceRowShape[] = [];
      for (let leftIndex = 0; leftIndex < sortedModels.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < sortedModels.length; rightIndex += 1) {
          const modelA = sortedModels[leftIndex]!;
          const modelB = sortedModels[rightIndex]!;

          const differences: number[] = [];
          const winRatesA: number[] = [];
          const winRatesB: number[] = [];
          for (const pairMap of avgWinRateByPair) {
            const wrA = pairMap.get(modelA.modelId);
            const wrB = pairMap.get(modelB.modelId);
            if (wrA !== undefined && wrB !== undefined) {
              differences.push(wrA - wrB);
              winRatesA.push(wrA);
              winRatesB.push(wrB);
            }
          }

          const n = differences.length;
          const { statistic, pValue: rawPValue, nEff } = wilcoxonSignedRank(differences);
          const effectSize = nEff > 0 ? rankBiserialCorrelation(statistic, nEff) : 0;
          const { low, high } = bootstrapMeanDiffCI(differences);
          const meanDifference = n > 0 ? differences.reduce((sum, d) => sum + d, 0) / n : 0;
          const winRateA = winRatesA.length > 0 ? winRatesA.reduce((sum, v) => sum + v, 0) / winRatesA.length : 0;
          const winRateB = winRatesB.length > 0 ? winRatesB.reduce((sum, v) => sum + v, 0) / winRatesB.length : 0;

          rows.push({
            modelAId: modelA.modelId,
            modelALabel: modelA.label,
            modelBId: modelB.modelId,
            modelBLabel: modelB.label,
            n,
            rawPValue,
            holmCorrectedPValue: null,
            meanDifference,
            effectSize,
            effectLabel: classifyEffectSize(effectSize),
            winRateA,
            winRateB,
            maxOrderEffect,
            confidenceIntervalLow: low,
            confidenceIntervalHigh: high,
            verdict: 'Not significant' as const,
          });
        }
      }

      const correctedPValues = holmBonferroni(rows.map((row) => row.rawPValue));
      const sortedRows = rows
        .map((row, index) => {
          const holmCorrectedPValue = correctedPValues[index] ?? null;
          return {
            ...row,
            holmCorrectedPValue,
            verdict: classifyVerdict({
              correctedPValue: holmCorrectedPValue,
              effectSize: row.effectSize,
              alpha: 0.05,
            }),
          };
        })
        .sort((left, right) => {
          const leftKey = `${left.modelALabel}::${left.modelBLabel}`;
          const rightKey = `${right.modelALabel}::${right.modelBLabel}`;
          return leftKey.localeCompare(rightKey);
        });

      ctx.log.debug(
        {
          scope,
          domainId,
          signature,
          modelCount: sortedModels.length,
          pairCount: sortedRows.length,
          coveredDefinitionCount: coveredDefinitionIds.size,
          valuePairCount: valuePairs.length,
          maxOrderEffect,
        },
        'Computed model grouping significance report',
      );

      return {
        models: sortedModels,
        rows: sortedRows,
        pending: false,
      };
    },
  }),
);
