import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { extractValuePair, type DomainAnalysisValueKey, type DomainAnalysisValuePair } from './domain-analysis-values.js';
import { isDomainAnalysisValueKey } from './domain/shared.js';
import { DomainAnalysisConditionTranscriptRef } from './domain/types.js';

builder.queryField('confidenceTranscripts', (t) =>
  t.field({
    type: [DomainAnalysisConditionTranscriptRef],
    args: {
      modelId: t.arg.string({ required: true }),
      valueKey: t.arg.string({ required: true }),
      signature: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      definitionId: t.arg.string({ required: false }),
      scenarioId: t.arg.string({ required: false }),
    },
    resolve: async (_root, args) => {
      const modelId = args.modelId;
      const rawValueKey = args.valueKey;
      const filterDefinitionId =
        typeof args.definitionId === 'string' && args.definitionId.trim() !== ''
          ? args.definitionId.trim()
          : null;
      const filterScenarioId =
        typeof args.scenarioId === 'string' && args.scenarioId.trim() !== ''
          ? args.scenarioId.trim()
          : null;
      if (!isDomainAnalysisValueKey(rawValueKey)) {
        throw new ValidationError(`Unsupported value key: ${rawValueKey}`);
      }
      const valueKey: DomainAnalysisValueKey = rawValueKey;
      const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;

      const runs = await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { none: { tag: { name: 'Aggregate' } } },
        },
        select: {
          id: true,
          definitionId: true,
          config: true,
        },
      });

      const matchingRuns = requestedSignature == null
        ? runs
        : runs.filter((run) => runMatchesSignature(run.config, requestedSignature));

      const definitionIds = [
        ...new Set(
          matchingRuns
            .map((run) => run.definitionId)
            .filter((id): id is string => id !== null),
        ),
      ];

      if (definitionIds.length === 0) {
        return [];
      }

      const definitions = await db.definition.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true, content: true },
      });

      const defValuePairMap = new Map<string, DomainAnalysisValuePair | null>();
      for (const definition of definitions) {
        defValuePairMap.set(definition.id, extractValuePair(definition.content));
      }

      const matchingDefIds = new Set(
        definitions
          .filter((definition) => {
            // When a specific definitionId filter is requested, respect it.
            if (filterDefinitionId !== null && definition.id !== filterDefinitionId) return false;
            const pair = defValuePairMap.get(definition.id) ?? null;
            return pair?.valueA === valueKey || pair?.valueB === valueKey;
          })
          .map((definition) => definition.id),
      );

      if (matchingDefIds.size === 0) {
        return [];
      }

      const relevantRunIds: string[] = [];
      const runToDefId = new Map<string, string>();
      for (const run of matchingRuns) {
        if (run.definitionId == null || !matchingDefIds.has(run.definitionId)) {
          continue;
        }
        relevantRunIds.push(run.id);
        runToDefId.set(run.id, run.definitionId);
      }

      if (relevantRunIds.length === 0) {
        return [];
      }

      const transcripts = await db.transcript.findMany({
        where: {
          runId: { in: relevantRunIds },
          modelId,
          deletedAt: null,
          ...(filterScenarioId !== null ? { scenarioId: filterScenarioId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          runId: true,
          scenarioId: true,
          modelId: true,
          decisionMetadata: true,
          turnCount: true,
          tokenCount: true,
          durationMs: true,
          createdAt: true,
          content: true,
        },
      });

      return transcripts.map((transcript) => {
        const defId = runToDefId.get(transcript.runId);
        const pair = defId != null ? (defValuePairMap.get(defId) ?? null) : null;
        return {
          ...transcript,
          pairOverride: pair ?? undefined,
        };
      });
    },
  }),
);
