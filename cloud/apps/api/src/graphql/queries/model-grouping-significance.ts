import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { getModelsFromDatabase } from '../../config/models.js';
import { ModelGroupingSignificanceResultRef } from '../types/model-grouping-significance.js';
import {
  classifyEffectSize,
  classifyVerdict,
  exactMcNemar,
  holmBonferroni,
  matchedPairsOddsRatio,
  oddsRatioCI,
} from '../../services/model-grouping-significance/math.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from '../queries/domain/shared.js';
import { getSnapshotValuePair } from '../../services/analysis/transcript-cell-accumulator.js';
import { resolveTranscriptDecisionModel } from '../queries/domain/decision-model.js';
import { assignOwnOpponent } from '../../services/pressure-sensitivity/value-pair.js';
import type { DomainAnalysisScope } from '../../services/analysis/domain-analysis-scope.js';

const ALL_DOMAINS_SCOPE_ID = 'all-domains';
const TRANSCRIPT_BATCH_SIZE = 500;

type TranscriptRecord = {
  id: string;
  runId: string;
  modelId: string;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  deletedAt: Date | null;
  scenario: { id: string; orientationFlipped: boolean; deletedAt: Date | null } | null;
};
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
function getChoice(counts: WinLossCounts | undefined): 0 | 1 { return counts != null && counts.wins > counts.losses ? 1 : 0; }

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
      const countsByDefinitionModel = new Map<string, WinLossCounts>();
      let offset = 0;
      let hasMoreTranscripts = true;

      while (hasMoreTranscripts) {
        const transcripts: TranscriptRecord[] = await db.transcript.findMany({
          where: {
            runId: { in: resolvedSignatureRuns.filteredSourceRunIds },
            modelId: { in: [...selectedModelIdSet] },
            deletedAt: null,
          },
          select: {
            id: true,
            runId: true,
            modelId: true,
            decisionMetadata: true,
            definitionSnapshot: true,
            deletedAt: true,
            scenario: {
              select: {
                id: true,
                orientationFlipped: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { id: 'asc' },
          take: TRANSCRIPT_BATCH_SIZE,
          skip: offset,
        });

        if (transcripts.length === 0) {
          hasMoreTranscripts = false;
          continue;
        }

        for (const transcript of transcripts) {
          if (!selectedModelIdSet.has(transcript.modelId)) continue;
          if (transcript.deletedAt != null) continue;
          if (transcript.scenario == null || transcript.scenario.deletedAt != null) continue;

          const definitionId = resolvedSignatureRuns.filteredSourceRunDefinitionById.get(transcript.runId);
          if (definitionId === undefined) continue;

          const valuePair = getSnapshotValuePair(transcript.definitionSnapshot);
          if (valuePair == null) continue;
          const [firstValueToken, secondValueToken] = valuePair;

          const resolved = resolveTranscriptDecisionModel({
            decisionMetadata: transcript.decisionMetadata,
            definitionSnapshot: transcript.definitionSnapshot,
            orientationFlipped: transcript.scenario.orientationFlipped,
            pairOverride: { valueA: firstValueToken, valueB: secondValueToken },
          });
          if (resolved.canonical.direction === 'unknown') continue;

          const outcome = assignOwnOpponent(firstValueToken, secondValueToken, resolved.canonical.direction);
          if (outcome === 'unscored' || outcome === 'neutral') continue;

          const key = encodeDefinitionModelKey(definitionId, transcript.modelId);
          const counts = countsByDefinitionModel.get(key) ?? { wins: 0, losses: 0 };
          if (outcome === 'own_picked') {
            counts.wins += 1;
          } else {
            counts.losses += 1;
          }
          countsByDefinitionModel.set(key, counts);
        }

        offset += transcripts.length;
        hasMoreTranscripts = transcripts.length === TRANSCRIPT_BATCH_SIZE;
      }

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

      const rows = [];
      for (let leftIndex = 0; leftIndex < sortedModels.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < sortedModels.length; rightIndex += 1) {
          const modelA = sortedModels[leftIndex]!;
          const modelB = sortedModels[rightIndex]!;
          let discordantAtoB = 0;
          let discordantBtoA = 0;

          for (const definitionId of coveredDefinitionIds) {
            const choiceA = getChoice(countsByDefinitionModel.get(encodeDefinitionModelKey(definitionId, modelA.modelId)));
            const choiceB = getChoice(countsByDefinitionModel.get(encodeDefinitionModelKey(definitionId, modelB.modelId)));
            if (choiceA === 1 && choiceB === 0) {
              discordantAtoB += 1;
            } else if (choiceA === 0 && choiceB === 1) {
              discordantBtoA += 1;
            }
          }

          const n = coveredDefinitionIds.size;
          const concordant = n - discordantAtoB - discordantBtoA;
          const rawPValue = exactMcNemar(discordantAtoB, discordantBtoA);
          const oddsRatio = matchedPairsOddsRatio(discordantAtoB, discordantBtoA);
          const { low, high } = oddsRatioCI(discordantAtoB, discordantBtoA, 0.05);
          rows.push({
            modelAId: modelA.modelId,
            modelALabel: modelA.label,
            modelBId: modelB.modelId,
            modelBLabel: modelB.label,
            n,
            agreementRate: n > 0 ? concordant / n : 0,
            discordantAtoB,
            discordantBtoA,
            rawPValue,
            holmCorrectedPValue: null,
            oddsRatio,
            effectLabel: classifyEffectSize(oddsRatio),
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
              oddsRatio: row.oddsRatio,
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
        },
        'Computed model grouping significance report',
      );

      return {
        models: sortedModels,
        rows: sortedRows,
      };
    },
  }),
);
