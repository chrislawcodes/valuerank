import { db } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';
import { builder } from '../../../builder.js';
import { buildOrderedPairCell } from '../../../../services/circumplex/aggregation.js';
import {
  hydrateDefinitionAncestors,
  isDomainAnalysisValueKey,
  resolveSignatureRuns,
  resolveTranscriptDecisionModel,
  resolveValuePairsInChunks,
  selectLatestDefinitionPerLineage,
} from '../shared.js';
import { computeISquared, computePairwiseWinRate } from '../../../../utils/pairwise-math.js';
import { wilsonCI95 } from '../../../../utils/binomial-ci.js';
import {
  DomainAnalysisPairDetailResultRef,
  type DomainAnalysisPairDetailResult,
  type DomainAnalysisPairFramingDirection,
  type DomainAnalysisPairVignetteDetail,
  PooledMeanDivergenceError,
} from './pair-detail-types.js';

type MatchedDefinition = {
  definitionId: string;
  definitionName: string;
  framingDirection: DomainAnalysisPairFramingDirection;
};

const MATRIX_MEAN_TOLERANCE = 1e-9;

function canonicalPairKey(valueA: string, valueB: string): string {
  return [valueA, valueB].sort().join('|');
}

function inferFramingDirection(
  pairValueFirst: string | undefined,
  rowValueKey: string,
  columnValueKey: string,
): DomainAnalysisPairFramingDirection | null {
  if (pairValueFirst === rowValueKey) return 'A_TO_B';
  if (pairValueFirst === columnValueKey) return 'B_TO_A';
  return null;
}

builder.queryField('domainAnalysisPairDetail', (t) =>
  t.field({
    type: DomainAnalysisPairDetailResultRef,
    args: {
      valueA: t.arg.string({ required: true }),
      valueB: t.arg.string({ required: true }),
      modelId: t.arg.string({ required: true }),
      domainId: t.arg.id({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx): Promise<DomainAnalysisPairDetailResult> => {
      const rawValueA = args.valueA;
      const rawValueB = args.valueB;
      const modelId = args.modelId;
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const requestedSignature =
        typeof args.signature === 'string' && args.signature.trim() !== ''
          ? args.signature.trim()
          : null;

      if (!isDomainAnalysisValueKey(rawValueA)) {
        throw new ValidationError(`Unsupported value key: ${rawValueA}`);
      }
      if (!isDomainAnalysisValueKey(rawValueB)) {
        throw new ValidationError(`Unsupported value key: ${rawValueB}`);
      }

      const rowValueKey = rawValueA;
      const columnValueKey = rawValueB;

      if (requestedSignature === null) {
        ctx.log.warn(
          { domainId, modelId, rowValueKey, columnValueKey },
          'domainAnalysisPairDetail called without signature; defaulting to first available signature',
        );
      }

      let domainName: string | null = null;
      if (domainId !== null) {
        const domain = await db.domain.findUnique({
          where: { id: domainId },
          select: { id: true, name: true },
        });
        if (!domain) throw new NotFoundError('Domain', domainId);
        domainName = domain.name;
      }

      const definitions = await db.definition.findMany({
        where: {
          deletedAt: null,
          ...(domainId === null ? {} : { domainId }),
        },
        select: {
          id: true,
          name: true,
          parentId: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const modelMeta = await db.llmModel.findFirst({
        where: { modelId, status: 'ACTIVE' },
        select: { displayName: true },
      });
      const modelLabel = modelMeta?.displayName ?? modelId;

      if (definitions.length === 0) {
        return {
          rowValueKey,
          columnValueKey,
          modelId,
          modelLabel,
          domainId,
          domainName,
          vignettes: [],
          pooledMin: null,
          pooledMean: null,
          pooledMax: null,
          iSquared: null,
          vignetteCount: 0,
          validEstimateCount: 0,
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
      const definitionNameById = new Map(definitions.map((definition) => [definition.id, definition.name]));
      const valuePairByDefinition = await resolveValuePairsInChunks(latestDefinitionIds);
      const canonicalRequestedPairKey = canonicalPairKey(rowValueKey, columnValueKey);

      const matchedDefinitions: MatchedDefinition[] = [];
      const definitionIdsByDirection = new Map<DomainAnalysisPairFramingDirection, string[]>();

      for (const definitionId of latestDefinitionIds) {
        const pair = valuePairByDefinition.get(definitionId);
        const definitionName = definitionNameById.get(definitionId);
        if (!pair || definitionName == null) continue;

        if (canonicalPairKey(pair.valueA, pair.valueB) !== canonicalRequestedPairKey) {
          continue;
        }

        const framingDirection = inferFramingDirection(pair.valueFirst, rowValueKey, columnValueKey);
        if (framingDirection === null) continue;

        matchedDefinitions.push({
          definitionId,
          definitionName,
          framingDirection,
        });

        const directionDefinitionIds = definitionIdsByDirection.get(framingDirection) ?? [];
        directionDefinitionIds.push(definitionId);
        definitionIdsByDirection.set(framingDirection, directionDefinitionIds);
      }

      for (const [direction, definitionIds] of definitionIdsByDirection.entries()) {
        if (definitionIds.length > 1) {
          ctx.log.warn(
            {
              pairKey: canonicalRequestedPairKey,
              direction,
              definitionIds,
              modelId,
              domainId,
            },
            'Multiple vignettes found for (pair, direction); aggregating across them. Original spec assumed 1:1 mapping; production data has cases where it does not hold.',
          );
        }
      }

      if (matchedDefinitions.length === 0) {
        return {
          rowValueKey,
          columnValueKey,
          modelId,
          modelLabel,
          domainId,
          domainName,
          vignettes: [],
          pooledMin: null,
          pooledMean: null,
          pooledMax: null,
          iSquared: null,
          vignetteCount: 0,
          validEstimateCount: 0,
        };
      }

      const targetDefinitionIds = matchedDefinitions.map((definition) => definition.definitionId);

      const resolvedSignatureRuns = await resolveSignatureRuns(targetDefinitionIds, requestedSignature);
      const filteredSourceRunIds = resolvedSignatureRuns.filteredSourceRunIds;
      const filteredSourceRunDefinitionById = resolvedSignatureRuns.filteredSourceRunDefinitionById;

      const vignetteByDefinitionId = new Map<string, DomainAnalysisPairVignetteDetail>();
      for (const matchedDefinition of matchedDefinitions) {
        vignetteByDefinitionId.set(matchedDefinition.definitionId, {
          definitionId: matchedDefinition.definitionId,
          definitionName: matchedDefinition.definitionName,
          prioritized: 0,
          deprioritized: 0,
          neutral: 0,
          totalTrials: 0,
          selectedValueWinRate: null,
          winRateCI95Low: null,
          winRateCI95High: null,
          refusalRate: null,
          framingDirection: matchedDefinition.framingDirection,
        });
      }

      if (filteredSourceRunIds.length > 0) {
        const transcripts = await db.transcript.findMany({
          where: {
            runId: { in: filteredSourceRunIds },
            modelId,
            deletedAt: null,
          },
          select: {
            runId: true,
            decisionMetadata: true,
            scenario: {
              select: {
                orientationFlipped: true,
              },
            },
          },
        });

        for (const transcript of transcripts) {
          const definitionId = filteredSourceRunDefinitionById.get(transcript.runId);
          if (definitionId == null || definitionId === '') continue;

          const pair = valuePairByDefinition.get(definitionId);
          const vignette = vignetteByDefinitionId.get(definitionId);
          if (!pair || !vignette) continue;

          const canon = resolveTranscriptDecisionModel({
            decisionMetadata: transcript.decisionMetadata,
            orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
            pairOverride: pair,
          }).canonical;

          if (canon.direction === 'unknown') {
            continue;
          }

          if (canon.direction === 'neutral') {
            vignette.neutral += 1;
          } else if (canon.favoredValueKey === rowValueKey) {
            vignette.prioritized += 1;
          } else {
            vignette.deprioritized += 1;
          }
          vignette.totalTrials += 1;
        }
      }

      const vignettes = Array.from(vignetteByDefinitionId.values())
        .map((vignette) => {
          const selectedValueWinRate = computePairwiseWinRate(
            vignette.prioritized,
            vignette.deprioritized,
            vignette.neutral,
          );
          const ci = wilsonCI95(vignette.prioritized, vignette.totalTrials);

          return {
            ...vignette,
            selectedValueWinRate,
            winRateCI95Low: ci?.[0] ?? null,
            winRateCI95High: ci?.[1] ?? null,
            refusalRate: vignette.totalTrials === 0 ? null : vignette.neutral / vignette.totalTrials,
          };
        })
        .sort((left, right) => left.definitionName.localeCompare(right.definitionName));

      const validVignettes = vignettes.filter(
        (
          vignette,
        ): vignette is DomainAnalysisPairVignetteDetail & {
          selectedValueWinRate: number;
        } => vignette.totalTrials > 0 && vignette.selectedValueWinRate !== null,
      );
      const validEstimateCount = validVignettes.length;
      const pooledMean =
        validEstimateCount === 0
          ? null
          : validVignettes.reduce((sum, vignette) => sum + vignette.selectedValueWinRate, 0) /
            validEstimateCount;
      const pooledMin =
        validEstimateCount === 0
          ? null
          : Math.min(...validVignettes.map((vignette) => vignette.selectedValueWinRate));
      const pooledMax =
        validEstimateCount === 0
          ? null
          : Math.max(...validVignettes.map((vignette) => vignette.selectedValueWinRate));
      const iSquared = computeISquared(
        validVignettes.map((vignette) => ({
          winRate: vignette.selectedValueWinRate,
          totalTrials: vignette.totalTrials,
        })),
      );

      // Share the exact matrix-side cell aggregation helper so the drawer and
      // the existing pairwise matrix cannot drift on how they average vignette rates.
      const sortedPair =
        rowValueKey < columnValueKey
          ? { valueA: rowValueKey, valueB: columnValueKey }
          : { valueA: columnValueKey, valueB: rowValueKey };
      const matrixCell = buildOrderedPairCell({
        pair: sortedPair,
        left: rowValueKey,
        vignettes: validVignettes.map((vignette) => {
          if (rowValueKey === sortedPair.valueA) {
            return {
              prioritizedA: vignette.prioritized,
              prioritizedB: vignette.deprioritized,
              neutrals: vignette.neutral,
            };
          }

          return {
            prioritizedA: vignette.deprioritized,
            prioritizedB: vignette.prioritized,
            neutrals: vignette.neutral,
          };
        }),
      });

      if (
        pooledMean !== null &&
        matrixCell.winRate !== null &&
        Math.abs(pooledMean - matrixCell.winRate) > MATRIX_MEAN_TOLERANCE
      ) {
        throw new PooledMeanDivergenceError(
          pooledMean,
          matrixCell.winRate,
          MATRIX_MEAN_TOLERANCE,
        );
      }

      return {
        rowValueKey,
        columnValueKey,
        modelId,
        modelLabel,
        domainId,
        domainName,
        vignettes,
        pooledMin,
        pooledMean,
        pooledMax,
        iSquared,
        vignetteCount: vignettes.length,
        validEstimateCount,
      };
    },
  }),
);
