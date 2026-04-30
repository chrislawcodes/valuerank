import { db, Prisma } from '@valuerank/db';
import { getModelsFromDatabase } from '../../config/models.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
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

      // Query source runs directly — same approach as circumplexAnalysis.
      // Aggregate run configs have no version/temperature, so signature
      // matching against them is unreliable (vnewtd matches everything).
      const allSourceRuns = await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { none: { tag: { name: 'Aggregate' } } },
        },
        select: { id: true, definitionId: true, config: true },
      });

      const matchingRuns = signature != null
        ? allSourceRuns.filter((r) => runMatchesSignature(r.config, signature))
        : allSourceRuns;

      if (matchingRuns.length === 0) return emptyResult;

      const sourceRunIds = matchingRuns.map((r) => r.id);

      const runToDefinitionId = new Map(
        matchingRuns
          .filter((r): r is typeof r & { definitionId: string } => r.definitionId != null)
          .map((r) => [r.id, r.definitionId]),
      );

      const definitionIds = [...new Set(
        matchingRuns.map((r) => r.definitionId).filter((id): id is string => id != null),
      )];

      // Fetch definition content once per definition to get the value pair.
      const definitions = await db.definition.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true, content: true },
      });

      const defValuePairMap = new Map<string, DomainAnalysisValuePair | null>();
      for (const def of definitions) {
        defValuePairMap.set(def.id, extractValuePair(def.content));
      }

      // SQL aggregation: extract strength directly from the cached canonical decision
      // in the JSONB. This avoids loading full 1KB decisionMetadata blobs for each
      // transcript (313k transcripts × 1KB = 307 MB overflows the Prisma NAPI buffer).
      // 99.99% of transcripts have a cacheVersion=2 canonical decision in summaryCache.
      const rawRows = await db.$queryRaw<Array<{
        model_id: string;
        run_id: string;
        strong_count: bigint;
        lean_count: bigint;
      }>>(Prisma.sql`
        SELECT
          t.model_id,
          t.run_id,
          SUM(CASE WHEN t.decision_metadata #>> '{summaryCache,summary,canonicalDecision,strength}' = 'strong' THEN 1 ELSE 0 END)::int AS strong_count,
          SUM(CASE WHEN t.decision_metadata #>> '{summaryCache,summary,canonicalDecision,strength}' = 'lean'   THEN 1 ELSE 0 END)::int AS lean_count
        FROM transcripts t
        WHERE t.run_id = ANY(${sourceRunIds})
          AND t.deleted_at IS NULL
          AND t.decision_metadata #>> '{summaryCache,summary,canonicalDecision,cacheVersion}' = '2'
        GROUP BY t.model_id, t.run_id
      `);

      // Accumulate per-definition counts (not per-transcript) so that vignettes run
      // many times don't outweigh vignettes run fewer times.
      // Structure: modelId -> definitionId -> { valueKeys, strong, lean }
      type DefData = { valueKeys: DomainAnalysisValueKey[]; strong: number; lean: number };
      const perModelDefs = new Map<string, Map<string, DefData>>();
      for (const model of activeModels) {
        perModelDefs.set(model.modelId, new Map());
      }

      for (const row of rawRows) {
        const modelMap = perModelDefs.get(row.model_id);
        if (modelMap == null) continue;

        const definitionId = runToDefinitionId.get(row.run_id);
        if (definitionId == null) continue;

        let defData = modelMap.get(definitionId);
        if (defData == null) {
          const pair = defValuePairMap.get(definitionId) ?? null;
          const valueKeys: DomainAnalysisValueKey[] = pair != null ? [pair.valueA, pair.valueB] : [];
          defData = { valueKeys, strong: 0, lean: 0 };
          modelMap.set(definitionId, defData);
        }

        // Sum across all runs of the same definition.
        defData.strong += Number(row.strong_count);
        defData.lean += Number(row.lean_count);
      }

      // Per-definition confidence = strong / (strong + lean).
      // Final confidence = mean of per-definition rates (equal weight per vignette).
      function meanConfidence(rates: number[]): number | null {
        if (rates.length === 0) return null;
        return (rates.reduce((a, b) => a + b, 0) / rates.length) * 100;
      }

      const models: ModelsConfidenceModelResultShape[] = activeModels.map((model) => {
        const modelMap = perModelDefs.get(model.modelId) ?? new Map<string, DefData>();
        const defEntries = [...modelMap.values()];

        // Overall: average per-definition strong% across all definitions for this model.
        const overallRates = defEntries
          .map(({ strong, lean }) => {
            const total = strong + lean;
            return total > 0 ? strong / total : null;
          })
          .filter((v): v is number => v != null);
        const overallConfidence = meanConfidence(overallRates);
        const overallStrongCount = defEntries.reduce((s, d) => s + d.strong, 0);
        const overallLeanCount = defEntries.reduce((s, d) => s + d.lean, 0);

        // Per-value: average per-definition strong% across definitions testing that value.
        const values: ModelsConfidenceValueResultShape[] = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
          const relevantDefs = defEntries.filter((d) => d.valueKeys.includes(valueKey));
          const rates = relevantDefs
            .map(({ strong, lean }) => {
              const total = strong + lean;
              return total > 0 ? strong / total : null;
            })
            .filter((v): v is number => v != null);
          return {
            valueKey,
            confidence: meanConfidence(rates),
            strongCount: relevantDefs.reduce((s, d) => s + d.strong, 0),
            leanCount: relevantDefs.reduce((s, d) => s + d.lean, 0),
          };
        });

        return {
          modelId: model.modelId,
          label: model.displayName,
          overallConfidence,
          overallStrongCount,
          overallLeanCount,
          values,
        };
      });

      return { models };
    },
  }),
);
