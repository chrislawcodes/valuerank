import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { extractValuePair, type DomainAnalysisValuePair } from './domain-analysis-values.js';
import { isDomainAnalysisValueKey } from './domain/shared.js';
import { resolveTranscriptDecisionModel } from './domain/decision-model.js';
import { mapVignette, type MutableVignette, type MutableCondition } from './domain/analysis/value-detail-types.js';
import { buildScenarioAnalysisDimensionRecord, normalizeScenarioAnalysisMetadata } from '../../services/analysis/scenario-metadata.js';
import { ConfidenceValueDetailResultRef } from '../types/confidence-value-detail.js';

builder.queryField('confidenceValueDetail', (t) =>
  t.field({
    type: ConfidenceValueDetailResultRef,
    args: {
      modelId: t.arg.string({ required: true }),
      valueKey: t.arg.string({ required: true }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args) => {
      const modelId = args.modelId;
      const rawValueKey = args.valueKey;
      if (!isDomainAnalysisValueKey(rawValueKey)) {
        throw new ValidationError(`Unsupported value key: ${rawValueKey}`);
      }
      const valueKey = rawValueKey;
      const requestedSignature =
        typeof args.signature === 'string' && args.signature.trim() !== ''
          ? args.signature.trim()
          : null;

      // Resolve model display name.
      const modelMeta = await db.llmModel.findFirst({
        where: { modelId, status: 'ACTIVE' },
        select: { displayName: true },
      });
      const modelLabel = modelMeta?.displayName ?? modelId;

      // Fetch all completed non-Aggregate source runs (same as confidenceTranscripts).
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

      const matchingRuns =
        requestedSignature == null
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
        return { modelLabel, valueKey, vignettes: [] };
      }

      // Find definitions that have this valueKey in their pair.
      const definitions = await db.definition.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true, name: true, version: true, content: true },
      });

      const defValuePairMap = new Map<string, DomainAnalysisValuePair | null>();
      for (const definition of definitions) {
        defValuePairMap.set(definition.id, extractValuePair(definition.content));
      }

      const matchingDefs = definitions.filter((definition) => {
        const pair = defValuePairMap.get(definition.id) ?? null;
        return pair?.valueA === valueKey || pair?.valueB === valueKey;
      });

      if (matchingDefs.length === 0) {
        return { modelLabel, valueKey, vignettes: [] };
      }

      const matchingDefIds = new Set(matchingDefs.map((d) => d.id));

      // Map run → definitionId for matching definitions only.
      const relevantRunIds: string[] = [];
      const runToDefId = new Map<string, string>();
      for (const run of matchingRuns) {
        if (run.definitionId == null || !matchingDefIds.has(run.definitionId)) continue;
        relevantRunIds.push(run.id);
        runToDefId.set(run.id, run.definitionId);
      }

      if (relevantRunIds.length === 0) {
        return { modelLabel, valueKey, vignettes: [] };
      }

      // Build per-definition vignette accumulators.
      const vignetteByDefinitionId = new Map<string, MutableVignette>();
      for (const definition of matchingDefs) {
        const pair = defValuePairMap.get(definition.id);
        if (!pair) continue;
        const otherValueKey = pair.valueA === valueKey ? pair.valueB : pair.valueA;
        vignetteByDefinitionId.set(definition.id, {
          definitionId: definition.id,
          definitionName: definition.name,
          definitionVersion: definition.version,
          aggregateRunId: null,
          otherValueKey,
          prioritized: 0,
          deprioritized: 0,
          neutral: 0,
          totalTrials: 0,
          conditions: new Map(),
        });
      }

      // Fetch transcripts for the model across all relevant runs.
      const transcripts = await db.transcript.findMany({
        where: {
          runId: { in: relevantRunIds },
          modelId,
          deletedAt: null,
        },
        select: {
          runId: true,
          scenarioId: true,
          decisionMetadata: true,
          scenario: {
            select: { orientationFlipped: true },
          },
        },
      });

      // Pre-fetch scenario names and dimensions.
      const scenarioIds = [
        ...new Set(
          transcripts
            .map((t) => t.scenarioId)
            .filter((id): id is string => id !== null && id !== ''),
        ),
      ];

      const scenarios =
        scenarioIds.length === 0
          ? []
          : await db.scenario.findMany({
              where: { id: { in: scenarioIds } },
              select: { id: true, name: true, content: true },
            });

      const scenarioNameById = new Map(scenarios.map((s) => [s.id, s.name]));
      const scenarioDimensionsById = new Map<string, Record<string, string | number>>();
      for (const scenario of scenarios) {
        const metadata = normalizeScenarioAnalysisMetadata(scenario.content);
        if (metadata === null) continue;
        const dimensions = buildScenarioAnalysisDimensionRecord(metadata);
        if (Object.keys(dimensions).length > 0) {
          scenarioDimensionsById.set(scenario.id, dimensions);
        }
      }

      // Accumulate counts per vignette + condition.
      for (const transcript of transcripts) {
        const definitionId = runToDefId.get(transcript.runId);
        if (definitionId == null) continue;
        const pair = defValuePairMap.get(definitionId);
        const vignette = vignetteByDefinitionId.get(definitionId);
        if (!pair || !vignette) continue;

        const canon = resolveTranscriptDecisionModel({
          decisionMetadata: transcript.decisionMetadata,
          orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
          pairOverride: pair,
        }).canonical;

        const scenarioKey = transcript.scenarioId ?? '__unknown__';
        const hasScenarioId = transcript.scenarioId !== null && transcript.scenarioId !== '';
        const scenarioId = hasScenarioId ? transcript.scenarioId : null;
        const conditionName =
          scenarioId === null ? 'Unknown Condition' : (scenarioNameById.get(scenarioId) ?? scenarioId);

        let existingCondition = vignette.conditions.get(scenarioKey);
        if (!existingCondition) {
          existingCondition = {
            scenarioId,
            conditionName,
            dimensions: scenarioId === null ? null : (scenarioDimensionsById.get(scenarioId) ?? null),
            prioritized: 0,
            deprioritized: 0,
            neutral: 0,
            totalTrials: 0,
            strongly: 0,
            somewhat: 0,
            opponentSomewhat: 0,
            opponentStrongly: 0,
            unknownCount: 0,
          } satisfies MutableCondition;
          vignette.conditions.set(scenarioKey, existingCondition);
        }

        if (canon.direction === 'unknown') {
          existingCondition.unknownCount += 1;
          continue;
        }

        const outcome =
          canon.direction === 'neutral'
            ? 'neutral'
            : canon.favoredValueKey === valueKey
              ? 'prioritized'
              : 'deprioritized';

        if (outcome === 'prioritized') {
          vignette.prioritized += 1;
          existingCondition.prioritized += 1;
          if (canon.strength === 'strong') {
            existingCondition.strongly += 1;
          } else if (canon.strength === 'lean') {
            existingCondition.somewhat += 1;
          }
        } else if (outcome === 'deprioritized') {
          vignette.deprioritized += 1;
          existingCondition.deprioritized += 1;
          if (canon.strength === 'strong') {
            existingCondition.opponentStrongly += 1;
          } else if (canon.strength === 'lean') {
            existingCondition.opponentSomewhat += 1;
          }
        } else {
          vignette.neutral += 1;
          existingCondition.neutral += 1;
        }
        vignette.totalTrials += 1;
        existingCondition.totalTrials += 1;
      }

      const vignettes = Array.from(vignetteByDefinitionId.values())
        .filter((v) => v.totalTrials > 0 || v.conditions.size > 0)
        .sort((a, b) => a.definitionName.localeCompare(b.definitionName))
        .map(mapVignette);

      return { modelLabel, valueKey, vignettes };
    },
  }),
);
