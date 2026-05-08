import { ValidationError } from '@valuerank/shared';
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
  readValuePairModelVotesFromSnapshot,
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

      // Read pre-computed per-(canonicalValueA::canonicalValueB::modelId) preference scores
      // from the domain-analysis snapshot (v1.11.0+).
      // wins/(wins+losses) = model's true preference for canonicalValueA across both
      // presentation directions, free of the per-definition 50/50 cancellation.
      const snapshotVotes = await readValuePairModelVotesFromSnapshot(
        scope,
        domainId ?? ALL_DOMAINS_SCOPE_ID,
        signature,
      );

      if (snapshotVotes == null) {
        await queueDomainAnalysisRefresh({
          scope,
          domainId: domainId ?? ALL_DOMAINS_SCOPE_ID,
          signature,
          reason: 'significance-page-load-missing',
        });
        ctx.log.info({ scope, domainId, signature }, 'Significance: snapshot not ready — rebuild queued, returning pending');
        return { models: [], rows: [], pending: true };
      }

      // Index votes by (pairKey, modelId) and build coverage sets.
      // pairKey = "canonicalValueA::canonicalValueB" (two parts, alphabetically sorted).
      const votesByPairModel = new Map<string, WinLossCounts>();
      const coverageByModel = new Map(sortedModels.map((model) => [model.modelId, new Set<string>()] as const));

      for (const [key, votes] of Object.entries(snapshotVotes)) {
        const parts = key.split('::');
        // key format: canonicalValueA :: canonicalValueB :: modelId  (3 segments)
        const modelId = parts[2];
        const pairKey = parts[0] !== undefined && parts[1] !== undefined ? `${parts[0]}::${parts[1]}` : undefined;
        if (modelId === undefined || pairKey === undefined || !selectedModelIdSet.has(modelId)) continue;
        votesByPairModel.set(key, { wins: votes.wins, losses: votes.losses });
        if (votes.wins > 0 || votes.losses > 0) {
          coverageByModel.get(modelId)?.add(pairKey);
        }
      }
      ctx.log.debug({ scope, domainId, signature }, 'Significance: used domain-analysis snapshot (fast path)');

      const missingModels = sortedModels.filter((model) => (coverageByModel.get(model.modelId)?.size ?? 0) === 0);
      if (missingModels.length > 0) {
        throw new ValidationError(
          `Pairwise significance could not be computed because the following models have no scored vignette coverage in the selected scope: ${missingModels.map((model) => model.label).join(', ')}.`,
        );
      }

      const coveredPairKeys = intersectCoveredDefinitions(sortedModels, coverageByModel);
      if (coveredPairKeys.size === 0) {
        throw new ValidationError(
          'Pairwise significance could not be computed because there are no vignettes with complete coverage for all selected models in the selected scope.',
        );
      }

      const rows: ModelGroupingSignificanceRowShape[] = [];
      for (let leftIndex = 0; leftIndex < sortedModels.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < sortedModels.length; rightIndex += 1) {
          const modelA = sortedModels[leftIndex]!;
          const modelB = sortedModels[rightIndex]!;

          const differences: number[] = [];
          const winRatesA: number[] = [];
          const winRatesB: number[] = [];

          for (const pairKey of coveredPairKeys) {
            const countsA = votesByPairModel.get(`${pairKey}::${modelA.modelId}`);
            const countsB = votesByPairModel.get(`${pairKey}::${modelB.modelId}`);
            const wrA = countsA != null ? computeWinRate(countsA.wins, countsA.losses) : undefined;
            const wrB = countsB != null ? computeWinRate(countsB.wins, countsB.losses) : undefined;
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
            maxOrderEffect: 0,
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
          coveredValuePairCount: coveredPairKeys.size,
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
