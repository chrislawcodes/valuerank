import { db } from '@valuerank/db';
import { getModelsFromDatabase } from '../../config/models.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { resolveTranscriptDecisionModel } from './domain/shared.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS, type DomainAnalysisValueKey } from './domain-analysis-values.js';
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

type TranscriptRow = {
  modelId: string;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  scenario: { orientationFlipped: boolean } | null;
};

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

      const runs = await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { some: { tag: { name: 'Aggregate' } } },
        },
        select: { id: true, config: true },
      });

      const scopedRuns = signature != null
        ? runs.filter((run) => runMatchesSignature(run.config, signature))
        : runs;

      const emptyValues = (): ModelsConfidenceValueResultShape[] =>
        DOMAIN_ANALYSIS_VALUE_KEYS.map((k) => ({
          valueKey: k,
          confidence: null,
          strongCount: 0,
          leanCount: 0,
        }));

      if (scopedRuns.length === 0) {
        return {
          models: activeModels.map((m) => ({
            modelId: m.modelId,
            label: m.displayName,
            overallConfidence: null,
            overallStrongCount: 0,
            overallLeanCount: 0,
            values: emptyValues(),
          })),
        };
      }

      const runIds = scopedRuns.map((r) => r.id);
      const transcripts = await db.transcript.findMany({
        where: { runId: { in: runIds }, deletedAt: null },
        select: {
          modelId: true,
          decisionMetadata: true,
          definitionSnapshot: true,
          scenario: { select: { orientationFlipped: true } },
        },
      }) as TranscriptRow[];

      // modelId -> counts
      const countsMap = new Map<string, ModelConfidenceCounts>();
      for (const model of activeModels) {
        const valueMap = new Map<DomainAnalysisValueKey, ConfidenceCounts>();
        for (const key of DOMAIN_ANALYSIS_VALUE_KEYS) {
          valueMap.set(key, { strong: 0, lean: 0 });
        }
        countsMap.set(model.modelId, {
          valueMap,
          rawStrong: 0,
          rawLean: 0,
        });
      }

      for (const transcript of transcripts) {
        const modelCounts = countsMap.get(transcript.modelId);
        if (modelCounts == null) continue;

        const { canonical } = resolveTranscriptDecisionModel({
          decisionMetadata: transcript.decisionMetadata,
          definitionSnapshot: transcript.definitionSnapshot,
          orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
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
