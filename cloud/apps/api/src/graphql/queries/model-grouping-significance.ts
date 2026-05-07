import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { buildAssumptionKey, parseSnapshotOutput } from '../../services/analysis/domain-analysis-snapshot-builder.js';
import { DOMAIN_ANALYSIS_SNAPSHOT_TYPE } from '../../services/analysis/domain-analysis-cache-types.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS } from './domain-analysis-values.js';
import { getModelsFromDatabase } from '../../config/models.js';
import { ModelGroupingSignificanceResultRef } from '../types/model-grouping-significance.js';
import {
  classifyEffectSize,
  classifyVerdict,
  holmBonferroni,
  pairedCohensD,
  pairedMeanConfidenceInterval,
  pairedPermutationPValue,
} from '../../services/model-grouping-significance/math.js';
import type { DomainAnalysisSnapshotOutput } from '../../services/analysis/domain-analysis-cache-types.js';

type SnapshotModel = NonNullable<DomainAnalysisSnapshotOutput['models'][number]>;

function sortModelIds(modelIds: string[]): string[] {
  return [...new Set(modelIds.map((modelId) => modelId.trim()).filter((modelId) => modelId.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function getScopeAssumptionKey(scope: string, domainId: string | null): string {
  if (scope === 'ALL_DOMAINS') {
    return buildAssumptionKey('ALL_DOMAINS', domainId ?? 'all-domains');
  }
  return buildAssumptionKey('DOMAIN', domainId ?? '');
}

function toFiniteRecord(values: SnapshotModel['valueWinRates']): Record<string, number> | null {
  if (values == null) return null;
  const record: Record<string, number> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    const value = values[valueKey];
    if (value == null || !Number.isFinite(value)) return null;
    record[valueKey] = value;
  }
  return record;
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
      const scope = String(args.scope);
      if (scope !== 'DOMAIN' && scope !== 'ALL_DOMAINS') {
        throw new ValidationError(`Unsupported scope: ${scope}`);
      }

      const selectedModelIds = sortModelIds(args.modelIds.map(String));
      if (selectedModelIds.length < 2) {
        return { models: [], rows: [] };
      }

      const domainId = args.domainId != null ? String(args.domainId) : null;
      if (scope === 'DOMAIN' && (domainId == null || domainId.trim() === '')) {
        throw new ValidationError('domainId is required when scope is DOMAIN');
      }

      const signature = String(args.signature).trim();
      if (signature.length === 0) {
        throw new ValidationError('signature is required');
      }

      const assumptionKey = getScopeAssumptionKey(scope, domainId);
      const currentSnapshot = await db.assumptionAnalysisSnapshot.findFirst({
        where: {
          assumptionKey,
          analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
          configSignature: signature,
          status: 'CURRENT',
          deletedAt: null,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        select: {
          output: true,
        },
      });

      if (currentSnapshot == null) {
        throw new ValidationError('Pairwise significance could not be computed because no cached analysis snapshot was found for the selected scope.');
      }

      const parsed = parseSnapshotOutput(currentSnapshot.output);
      if (parsed == null) {
        throw new ValidationError('Pairwise significance could not be computed because the cached analysis snapshot could not be parsed.');
      }

      const activeModels = await getModelsFromDatabase({
        activeOnly: true,
        availableOnly: false,
      });
      const labelByModelId = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));

      const availableModelMap = new Map<string, SnapshotModel>();
      for (const snapshotModel of parsed.models) {
        availableModelMap.set(snapshotModel.model, snapshotModel);
      }

      const selectedModels = selectedModelIds.map((modelId) => {
        const label = labelByModelId.get(modelId) ?? modelId;
        const snapshotModel = availableModelMap.get(modelId) ?? null;
        return { modelId, label, snapshotModel };
      });

      const missingModels = selectedModels.filter((model) => model.snapshotModel == null);
      if (missingModels.length > 0) {
        throw new ValidationError(
          `Pairwise significance could not be computed because ${missingModels.map((model) => model.label).join(', ')} is missing analysis data in the selected scope.`,
        );
      }

      const normalizedModels = selectedModels.map((model) => {
        const values = toFiniteRecord(model.snapshotModel?.valueWinRates);
        if (values == null) {
          throw new ValidationError(
            `Pairwise significance could not be computed because ${model.label} is missing equal-vignette win-rate data in the selected scope.`,
          );
        }
        return {
          modelId: model.modelId,
          label: model.label,
          values,
        };
      });

      const rows = [];
      for (let leftIndex = 0; leftIndex < normalizedModels.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < normalizedModels.length; rightIndex += 1) {
          const left = normalizedModels[leftIndex]!;
          const right = normalizedModels[rightIndex]!;
          const differences = DOMAIN_ANALYSIS_VALUE_KEYS.map(
            (valueKey) => {
              const leftValue = left.values[valueKey];
              const rightValue = right.values[valueKey];
              if (leftValue == null || rightValue == null) {
                throw new ValidationError('Pairwise significance could not be computed because the selected scope has incomplete vignette coverage.');
              }
              return leftValue - rightValue;
            },
          );
          const rawPValue = pairedPermutationPValue(differences);
          const { mean: meanDifference, ciLow, ciHigh, n } = pairedMeanConfidenceInterval(differences);
          const effectSize = pairedCohensD(differences);
          rows.push({
            modelAId: left.modelId,
            modelALabel: left.label,
            modelBId: right.modelId,
            modelBLabel: right.label,
            n,
            meanDifference,
            rawPValue,
            holmCorrectedPValue: null,
            effectSize,
            effectLabel: classifyEffectSize(effectSize),
            confidenceIntervalLow: ciLow,
            confidenceIntervalHigh: ciHigh,
            verdict: 'Not significant' as const,
          });
        }
      }

      const corrected = holmBonferroni(rows.map((row) => row.rawPValue));
      const finalRows = rows.map((row, index) => {
        const holmCorrectedPValue = corrected[index] ?? null;
        return {
          ...row,
          holmCorrectedPValue,
          verdict: classifyVerdict({
            correctedPValue: holmCorrectedPValue,
            effectSize: row.effectSize,
            alpha: 0.05,
          }),
        };
      });

      const sortedModels = normalizedModels.slice().sort((left, right) => {
        const labelDelta = left.label.localeCompare(right.label);
        return labelDelta !== 0 ? labelDelta : left.modelId.localeCompare(right.modelId);
      });

      const sortedRows = finalRows.slice().sort((left, right) => {
        const leftKey = `${left.modelALabel}::${left.modelBLabel}`;
        const rightKey = `${right.modelALabel}::${right.modelBLabel}`;
        return leftKey.localeCompare(rightKey);
      });

      ctx.log.debug(
        { scope, domainId, signature, modelCount: sortedModels.length, pairCount: sortedRows.length },
        'Computed model grouping significance report',
      );

      return {
        models: sortedModels.map((model) => ({
          modelId: model.modelId,
          label: model.label,
        })),
        rows: sortedRows,
      };
    },
  }),
);
