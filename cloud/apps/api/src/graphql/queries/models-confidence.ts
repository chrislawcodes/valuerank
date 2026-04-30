import { db } from '@valuerank/db';
import { getModelsFromDatabase } from '../../config/models.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { resolveTranscriptDecisionModel } from './domain/shared.js';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  extractValuePair,
  type DomainAnalysisValueKey,
  type DomainAnalysisValuePair,
} from './domain-analysis-values.js';
import { builder } from '../builder.js';
import {
  ModelsConfidenceResultRef,
  type ModelsConfidenceModelResultShape,
  type ModelsConfidenceValueResultShape,
} from '../types/models-confidence.js';

type ConfidenceCounts = { strong: number; lean: number };
type ModelConfidenceCounts = {
  valueMap: Map<DomainAnalysisValueKey, ConfidenceCounts>;
  rawStrong: number;
  rawLean: number;
};

function computeConfidence(counts: ConfidenceCounts): number | null {
  const total = counts.strong + counts.lean;
  if (total === 0) return null;
  return (counts.strong / total) * 100;
}

builder.queryField('modelsConfidence', (t) =>
  t.field({
    type: ModelsConfidenceResultRef,
    args: {
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args) => {
      const signature = args.signature != null ? String(args.signature) : null;

      const activeModels = await getModelsFromDatabase({
        activeOnly: true,
        availableOnly: false,
      });

      const emptyValues = (): ModelsConfidenceValueResultShape[] =>
        DOMAIN_ANALYSIS_VALUE_KEYS.map((k) => ({
          valueKey: k,
          confidence: null,
          strongCount: 0,
          leanCount: 0,
        }));

      const emptyResult = {
        models: activeModels.map((m) => ({
          modelId: m.modelId,
          label: m.displayName,
          overallConfidence: null,
          overallStrongCount: 0,
          overallLeanCount: 0,
          values: emptyValues(),
        })),
      };

      // Aggregate runs are pooling views — transcripts live on source runs.
      // Fetch aggregate runs (small set), filter by signature, then follow
      // config.sourceRunIds to reach transcript-bearing source runs.
      const aggregateRuns = await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { some: { tag: { name: 'Aggregate' } } },
        },
        select: { id: true, config: true },
      });

      const scopedAggregateRuns = signature != null
        ? aggregateRuns.filter((run) => runMatchesSignature(run.config, signature))
        : aggregateRuns;

      if (scopedAggregateRuns.length === 0) return emptyResult;

      // sourceRunIds lives in analysisResult.output, not run.config — follow the join.
      const aggregateRunIds = scopedAggregateRuns.map((r) => r.id);
      const aggregateResults = await db.analysisResult.findMany({
        where: { runId: { in: aggregateRunIds }, status: 'CURRENT' },
        select: { output: true },
      });

      const sourceRunIdSet = new Set<string>();
      for (const result of aggregateResults) {
        const output = result.output as { sourceRunIds?: string[] } | null;
        for (const id of output?.sourceRunIds ?? []) {
          sourceRunIdSet.add(id);
        }
      }

      if (sourceRunIdSet.size === 0) return emptyResult;

      const sourceRunIds = Array.from(sourceRunIdSet);

      // Load source runs to get their definitionId — lets us pre-fetch value pairs
      // by definition rather than per-transcript via the expensive definitionSnapshot blob.
      const sourceRuns = await db.run.findMany({
        where: { id: { in: sourceRunIds } },
        select: { id: true, definitionId: true },
      });

      const runToDefinitionId = new Map(
        sourceRuns
          .filter((r): r is typeof r & { definitionId: string } => r.definitionId != null)
          .map((r) => [r.id, r.definitionId]),
      );

      const definitionIds = [...new Set(
        sourceRuns.map((r) => r.definitionId).filter((id): id is string => id != null),
      )];

      // Fetch definition content once per definition (much cheaper than loading
      // definitionSnapshot JSON blob per transcript).
      const definitions = await db.definition.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true, content: true },
      });

      const defValuePairMap = new Map<string, DomainAnalysisValuePair | null>();
      for (const def of definitions) {
        defValuePairMap.set(def.id, extractValuePair(def.content));
      }

      // Fetch transcripts without definitionSnapshot — we supply pairOverride instead,
      // which resolveTranscriptDecisionModel uses directly (skipping snapshot parsing).
      const transcripts = await db.transcript.findMany({
        where: { runId: { in: sourceRunIds }, deletedAt: null },
        select: {
          modelId: true,
          runId: true,
          decisionMetadata: true,
        },
      });

      // modelId -> counts
      const countsMap = new Map<string, ModelConfidenceCounts>();
      for (const model of activeModels) {
        const valueMap = new Map<DomainAnalysisValueKey, ConfidenceCounts>();
        for (const key of DOMAIN_ANALYSIS_VALUE_KEYS) {
          valueMap.set(key, { strong: 0, lean: 0 });
        }
        countsMap.set(model.modelId, { valueMap, rawStrong: 0, rawLean: 0 });
      }

      for (const transcript of transcripts) {
        const modelCounts = countsMap.get(transcript.modelId);
        if (modelCounts == null) continue;

        const definitionId = runToDefinitionId.get(transcript.runId);
        const pairOverride = definitionId != null ? defValuePairMap.get(definitionId) : undefined;

        // orientationFlipped is not needed: both values in a pair receive the same
        // strength count regardless of which was favored, so direction doesn't matter.
        const { canonical } = resolveTranscriptDecisionModel({
          decisionMetadata: transcript.decisionMetadata,
          orientationFlipped: null,
          pairOverride: pairOverride ?? undefined,
        });

        if (canonical.direction !== 'favor_first' && canonical.direction !== 'favor_second') continue;
        if (canonical.strength !== 'strong' && canonical.strength !== 'lean') continue;

        if (canonical.strength === 'strong') modelCounts.rawStrong += 1;
        else modelCounts.rawLean += 1;

        // Both values in the pair receive the strength count — confidence is
        // about how decisively the model engages with a value, regardless of direction.
        const valueKeys = [canonical.favoredValueKey, canonical.opposedValueKey].filter(
          (k): k is DomainAnalysisValueKey => k != null,
        );
        for (const valueKey of valueKeys) {
          const counts = modelCounts.valueMap.get(valueKey);
          if (counts == null) continue;
          if (canonical.strength === 'strong') counts.strong += 1;
          else counts.lean += 1;
        }
      }

      const models: ModelsConfidenceModelResultShape[] = activeModels.map((model) => {
        const modelCounts = countsMap.get(model.modelId);
        const valueMap = modelCounts?.valueMap ?? new Map<DomainAnalysisValueKey, ConfidenceCounts>();
        const rawStrong = modelCounts?.rawStrong ?? 0;
        const rawLean = modelCounts?.rawLean ?? 0;

        const values: ModelsConfidenceValueResultShape[] = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
          const counts = valueMap.get(valueKey) ?? { strong: 0, lean: 0 };
          return {
            valueKey,
            confidence: computeConfidence(counts),
            strongCount: counts.strong,
            leanCount: counts.lean,
          };
        });

        return {
          modelId: model.modelId,
          label: model.displayName,
          overallConfidence: computeConfidence({ strong: rawStrong, lean: rawLean }),
          overallStrongCount: rawStrong,
          overallLeanCount: rawLean,
          values,
        };
      });

      return { models };
    },
  }),
);
