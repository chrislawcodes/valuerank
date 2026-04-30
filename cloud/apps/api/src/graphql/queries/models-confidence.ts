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

      // Query source runs directly — the same approach circumplexAnalysis uses.
      // Going through aggregate runs is wrong because aggregate run configs have
      // no version/temperature, so runMatchesSignature('vnewtd') matches ALL of
      // them (null === null), pulling every sourceRunId in the system at once.
      // Source runs store their actual signature in config, so filtering works correctly.
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

      // Accumulate per-definition counts to avoid unequal weighting.
      // A vignette run 10× would swamp one run once in a flat sum.
      // Instead: compute strong% per definition, then average across definitions.
      //
      // Structure: modelId -> definitionId -> { valueKeys, strong, lean }
      // All runs of the same definition collapse into one DefData entry.
      type DefData = { valueKeys: DomainAnalysisValueKey[]; strong: number; lean: number };
      const perModelDefs = new Map<string, Map<string, DefData>>();
      for (const model of activeModels) {
        perModelDefs.set(model.modelId, new Map());
      }

      for (const transcript of transcripts) {
        const modelMap = perModelDefs.get(transcript.modelId);
        if (modelMap == null) continue;

        const definitionId = runToDefinitionId.get(transcript.runId);
        if (definitionId == null) continue;

        const pairOverride = defValuePairMap.get(definitionId);

        // orientationFlipped is not needed: both values in a pair receive the same
        // strength count regardless of which was favored, so direction doesn't matter.
        const { canonical } = resolveTranscriptDecisionModel({
          decisionMetadata: transcript.decisionMetadata,
          orientationFlipped: null,
          pairOverride: pairOverride ?? undefined,
        });

        if (canonical.direction !== 'favor_first' && canonical.direction !== 'favor_second') continue;
        if (canonical.strength !== 'strong' && canonical.strength !== 'lean') continue;

        let defData = modelMap.get(definitionId);
        if (defData == null) {
          // Derive the two values tested by this definition from the pair, not from the
          // canonical decision, so the value association is stable across all transcripts.
          const pair = defValuePairMap.get(definitionId) ?? null;
          const valueKeys: DomainAnalysisValueKey[] = pair != null ? [pair.valueA, pair.valueB] : [];
          defData = { valueKeys, strong: 0, lean: 0 };
          modelMap.set(definitionId, defData);
        }

        if (canonical.strength === 'strong') defData.strong += 1;
        else defData.lean += 1;
      }

      // Per-definition confidence = strong / (strong + lean) for that definition.
      // Final confidence = mean of per-definition confidences (equal weight per vignette).
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

        // Per-value: average per-definition strong% across definitions that test that value.
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
