import { createLogger } from '@valuerank/shared';
import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { resolveTranscriptDecisionModel } from './domain/shared.js';
import {
  PressureSensitivityResultRef,
  type DirectionalSanityCheckEntryShape,
  type DirectionalSanityCheckShape,
  type ExcludedDefinitionShape,
  type InsufficientPressureSensitivityModelShape,
  type PressureSensitivityModelShape,
  type PressureSensitivityResultShape,
  type PressureSensitivityValuePairShape,
  type SensitivityCellShape,
} from '../types/pressure-sensitivity.js';
import { buildSafeLevelLookup, type DefinitionDimension } from './scenarios-utils.js';
import { normalizeScenarioAnalysisMetadata } from '../../services/analysis/scenario-metadata.js';
import {
  buildVignetteWeightedCellMetrics,
  pooledDirectionalReduction,
  summarizePressureResponse,
  FLAT_DELTA_THRESHOLD,
  type Observation,
} from '../../services/pressure-sensitivity/aggregation.js';
import {
  validateDefinitionForPressureSensitivity,
  type ValidationResult,
} from '../../services/pressure-sensitivity/definition-validation.js';
import {
  assignOwnOpponent,
  assignOwnOpponentLevels,
  canonicalOwnOpponent,
  canonicalValuePairKey,
  type CanonicalDirection,
} from '../../services/pressure-sensitivity/value-pair.js';
import {
  buildPressureSensitivityDecisionSnapshot,
  type PressureSensitivityDecisionSnapshot,
} from '../../services/pressure-sensitivity/decision-snapshot.js';

const log = createLogger('pressure-sensitivity');
const MIN_N = 3;
const TRANSCRIPT_PAGE_SIZE = 5_000;
const TRANSCRIPT_FETCH_LIMIT = 500_000;

type ModelRow = {
  id: string;
  modelId: string;
  displayName: string;
  providerId: string;
  provider: { id: string; name: string; displayName: string | null };
};

type RunRow = {
  id: string;
  config: unknown;
  definitionId: string;
  definition: { id: string; name: string; domainId: string | null } | null;
};

type TranscriptRow = {
  id: string;
  modelId: string;
  runId: string;
  scenarioId: string | null;
  decisionMetadata: unknown;
};

type ScenarioRow = {
  id: string;
  definitionId: string;
  content: unknown;
  orientationFlipped: boolean;
};

type DefinitionMetadata = {
  id: string;
  name: string;
  /** Definition's stored value_first.token (used to remap canonical direction). */
  valueFirstToken: string;
  /** Definition's stored value_second.token (used to remap canonical direction). */
  valueSecondToken: string;
  /** Alphabetical canonical first value (sortedTokens[0]). */
  firstValueToken: string;
  /** Alphabetical canonical second value (sortedTokens[1]). */
  secondValueToken: string;
  pairKey: string;
  decisionSnapshot: PressureSensitivityDecisionSnapshot;
  ownLookup: (raw: unknown) => number | null;
  opponentLookup: (raw: unknown) => number | null;
  dimensions: ReadonlyArray<DefinitionDimension>;
};

type CellAccumulator = {
  ownLevel: number;
  opponentLevel: number;
  observationsByDefinition: Map<string, Observation[]>;
};

type PairAccumulator = {
  pairKey: string;
  firstValueToken: string;
  secondValueToken: string;
  cells: Map<string, CellAccumulator>;
  definitionsMeasured: Set<string>;
};

type PressureConditionExclusionBreakdown = {
  sourceRunMapping: number;
  definitionMetadata: number;
  missingScenario: number;
  invalidMetadata: number;
  levelAssignment: number;
};

function cellKey(ownLevel: number, opponentLevel: number): string {
  return `${ownLevel}::${opponentLevel}`;
}

function strengthFromCanonical(strength: 'strong' | 'lean' | 'neutral' | 'unknown'): 'strong' | 'lean' | null {
  if (strength === 'strong') return 'strong';
  if (strength === 'lean') return 'lean';
  return null;
}

/**
 * Aggregate-tagged runs are pooling views over a set of source runs; transcripts live on
 * the source runs, not the aggregate run itself. Pull the source-run IDs out of the aggregate
 * run's config (`config.sourceRunIds`) so we can fetch transcripts from the right place.
 */
function extractSourceRunIds(config: unknown): string[] {
  if (config === null || typeof config !== 'object') return [];
  const sourceRunIds = (config as { sourceRunIds?: unknown }).sourceRunIds;
  if (!Array.isArray(sourceRunIds)) return [];
  return sourceRunIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

type WarningLogger = {
  warn: (data: Record<string, unknown>, message: string) => void;
};

type TranscriptPage = {
  rows: TranscriptRow[];
  hasMore: boolean;
};

type TranscriptPageFetcher = (cursor: { id: string } | undefined) => Promise<TranscriptPage>;

export function buildSourceRunToDefIdMap(
  eligibleRuns: ReadonlyArray<RunRow>,
  definitionMeta: ReadonlyMap<string, DefinitionMetadata>,
  warningLogger: WarningLogger,
): Map<string, string> {
  const map = new Map<string, string>();
  const orderedRuns = [...eligibleRuns].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const run of orderedRuns) {
    const defId = run.definition?.id ?? run.definitionId;
    if (!definitionMeta.has(defId)) continue;
    for (const sourceRunId of extractSourceRunIds(run.config)) {
      const existingDefinitionId = map.get(sourceRunId);
      if (existingDefinitionId !== undefined && existingDefinitionId !== defId) {
        warningLogger.warn(
          {
            sourceRunId,
            existingDefinitionId,
            newDefinitionId: defId,
            code: 'source_run_collision',
          },
          'sourceRunId mapped to multiple definitions; last write wins',
        );
      }
      map.set(sourceRunId, defId);
    }
  }
  return map;
}

function formatValueLabel(token: string): string {
  return token.replaceAll('_', ' ').trim();
}

function emptyPressureConditionExclusionBreakdown(): PressureConditionExclusionBreakdown {
  return {
    sourceRunMapping: 0,
    definitionMetadata: 0,
    missingScenario: 0,
    invalidMetadata: 0,
    levelAssignment: 0,
  };
}

function totalPressureConditionExclusions(
  breakdown: PressureConditionExclusionBreakdown,
): number {
  return (
    breakdown.sourceRunMapping
    + breakdown.definitionMetadata
    + breakdown.missingScenario
    + breakdown.invalidMetadata
    + breakdown.levelAssignment
  );
}

/** Exported for testing the defense-in-depth exclusion paths (SC-010). */
export function emptyPressureConditionExclusionBreakdownForTest(): PressureConditionExclusionBreakdown {
  return emptyPressureConditionExclusionBreakdown();
}

export async function fetchTranscriptsFromSourceRuns(
  sourceRunIds: ReadonlyArray<string>,
  rosterModelIds: ReadonlyArray<string>,
  fetchPage: TranscriptPageFetcher,
  warningLogger: WarningLogger,
  limit = TRANSCRIPT_FETCH_LIMIT,
): Promise<{ transcripts: TranscriptRow[]; transcriptCapHit: boolean }> {
  const transcripts: TranscriptRow[] = [];
  let cursor: { id: string } | undefined;
  let transcriptCapHit = false;

  if (sourceRunIds.length === 0 || rosterModelIds.length === 0) {
    return { transcripts, transcriptCapHit: false };
  }

  while (transcripts.length < limit) {
    const page = await fetchPage(cursor);
    if (page.rows.length === 0) break;

    const remaining = limit - transcripts.length;
    if (page.rows.length > remaining) {
      transcripts.push(...page.rows.slice(0, remaining));
      transcriptCapHit = true;
      break;
    }

    transcripts.push(...page.rows);
    if (page.hasMore && transcripts.length >= limit) {
      transcriptCapHit = true;
      break;
    }
    if (!page.hasMore) break;

    cursor = { id: page.rows[page.rows.length - 1]!.id };
  }

  if (transcriptCapHit) {
    warningLogger.warn(
      {
        sourceRunIds: [...sourceRunIds],
        scanned: transcripts.length,
        limit,
        code: 'transcript_cap_hit',
      },
      'Transcript fetch hit cap; results may be biased',
    );
  }

  return { transcripts, transcriptCapHit };
}

builder.queryField('pressureSensitivity', (t) =>
  t.field({
    type: PressureSensitivityResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      modelIds: t.arg.stringList({ required: false }),
      providerId: t.arg.id({ required: false }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args): Promise<PressureSensitivityResultShape> => {
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const modelIds = args.modelIds != null ? [...new Set(args.modelIds.map((value) => String(value)).filter((value) => value.length > 0))] : null;
      const providerId = args.providerId != null ? String(args.providerId) : null;
      const signature = String(args.signature);

      // 1. Roster
      const activeModels = (await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        include: { provider: true },
      })) as ModelRow[];

      const models = activeModels.filter((m) => {
        const matchesModelIds =
          modelIds == null
          || (modelIds.length > 0 && (modelIds.includes(m.modelId) || modelIds.includes(m.id)));
        const matchesProvider =
          providerId == null
          || m.providerId === providerId
          || m.provider.id === providerId
          || m.provider.name === providerId
          || m.provider.displayName === providerId;
        return matchesModelIds && matchesProvider;
      });

      // 2. Aggregate runs
      // orderBy id:asc makes sourceRunToDefId Map.set "last write wins" deterministic
      // across queries; without it the collision warning would point to a different
      // winner each run (Slice A diff review finding).
      const runs = (await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { some: { tag: { name: 'Aggregate' } } },
          ...(domainId != null ? { definition: { domainId } } : {}),
        },
        include: {
          definition: { select: { id: true, name: true, domainId: true } },
        },
        orderBy: { id: 'asc' },
      })) as RunRow[];

      // 3. Signature filter
      const eligibleRuns = runs.filter((r) => runMatchesSignature(r.config, signature));
      if (eligibleRuns.length === 0) {
        return buildEmptyResult(models);
      }

      // 4. Distinct definitions → validation
      const distinctDefIds = new Set<string>();
      const defNames = new Map<string, string>();
      for (const r of eligibleRuns) {
        if (r.definition?.id != null) {
          distinctDefIds.add(r.definition.id);
          defNames.set(r.definition.id, r.definition.name);
        } else {
          distinctDefIds.add(r.definitionId);
        }
      }

      const definitionMeta = new Map<string, DefinitionMetadata>();
      const excludedDefinitions: ExcludedDefinitionShape[] = [];

      for (const defId of distinctDefIds) {
        const validation: ValidationResult = await validateDefinitionForPressureSensitivity(defId);
        if (validation.status === 'excluded') {
          excludedDefinitions.push({
            definitionId: defId,
            name: defNames.get(defId) ?? defId,
            reason: validation.reason,
          });
          continue;
        }

        const content = validation.resolvedContent;
        const components = content.components;
        if (!components) {
          excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-self-pair-tokens' });
          continue;
        }
        const pairKey = canonicalValuePairKey(components.value_first.token, components.value_second.token);
        if (pairKey === null) {
          excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-self-pair-tokens' });
          continue;
        }
        const [firstValueToken, secondValueToken] = canonicalOwnOpponent(
          components.value_first.token,
          components.value_second.token,
        );

        const dimensions: DefinitionDimension[] = (content.dimensions ?? []).map((d) => ({
          name: d.name,
          levels: d.levels,
          values: d.values,
        }));

        const ownDim = dimensions.find(
          (d) => typeof d.name === 'string' && d.name.trim() === firstValueToken,
        );
        const opponentDim = dimensions.find(
          (d) => typeof d.name === 'string' && d.name.trim() === secondValueToken,
        );
        if (!ownDim || !opponentDim) {
          excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-empty-levels' });
          continue;
        }

        const ownLookupResult = buildSafeLevelLookup(ownDim);
        const opponentLookupResult = buildSafeLevelLookup(opponentDim);
        if (ownLookupResult.exclusionReason !== null || opponentLookupResult.exclusionReason !== null) {
          const reason = ownLookupResult.exclusionReason ?? opponentLookupResult.exclusionReason;
          const mapped =
            reason === 'collision' ? 'normalization-collision'
            : reason === 'out-of-range' ? 'score-out-of-range'
            : reason === 'legacy-values-only' ? 'legacy-single-dimension'
            : 'missing-or-empty-levels';
          excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: mapped });
          continue;
        }

        const decisionSnapshot = buildPressureSensitivityDecisionSnapshot(content);
        if (decisionSnapshot === null) {
          excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-self-pair-tokens' });
          continue;
        }

        definitionMeta.set(defId, {
          id: defId,
          name: defNames.get(defId) ?? defId,
          valueFirstToken: components.value_first.token,
          valueSecondToken: components.value_second.token,
          firstValueToken,
          secondValueToken,
          pairKey,
          decisionSnapshot,
          ownLookup: ownLookupResult.lookup,
          opponentLookup: opponentLookupResult.lookup,
          dimensions,
        });
      }

      // 5. Stream transcripts from the SOURCE runs of each Aggregate-tagged run.
      // Aggregate runs are pooling views — they own metadata (perScenario summaries) but
      // the raw transcripts live on the runs listed in `config.sourceRunIds`. Fetching
      // transcripts WHERE runId IN aggregateRunIds returns 0 rows; the production smoke
      // test on PR #770 caught this.
      const sourceRunToDefId = buildSourceRunToDefIdMap(eligibleRuns, definitionMeta, log);
      const sourceRunIds = [...sourceRunToDefId.keys()];
      const rosterModelIds = models.map((m) => m.modelId);
      const pressureConditionExclusionBreakdown = emptyPressureConditionExclusionBreakdown();

      // Pre-fetch the scenarios for eligible Definitions ONCE into a map. Each scenario's
      // content + orientationFlipped is the same across thousands of transcripts, so joining
      // on transcript blew up the response payload past Prisma's napi String limit.
      const eligibleDefIds = [...definitionMeta.keys()];
      const scenarioRows = eligibleDefIds.length === 0
        ? []
        : ((await db.scenario.findMany({
          where: { definitionId: { in: eligibleDefIds }, deletedAt: null },
          select: { id: true, definitionId: true, content: true, orientationFlipped: true },
        })) as ScenarioRow[]);
      const scenarioById = new Map<string, ScenarioRow>();
      for (const s of scenarioRows) scenarioById.set(s.id, s);

      const { transcripts, transcriptCapHit } = await fetchTranscriptsFromSourceRuns(
        sourceRunIds,
        rosterModelIds,
        async (cursor) => {
          const page = (await db.transcript.findMany({
            where: {
              runId: { in: sourceRunIds },
              modelId: { in: rosterModelIds },
              deletedAt: null,
            },
            select: {
              id: true,
              modelId: true,
              runId: true,
              scenarioId: true,
              decisionMetadata: true,
            },
            orderBy: { id: 'asc' },
            take: TRANSCRIPT_PAGE_SIZE + 1,
            ...(cursor ? { skip: 1, cursor } : {}),
          })) as TranscriptRow[];
          // Fetch one extra row to detect "more available" without false-positives
          // on exact-multiple page boundaries (Slice A diff review finding).
          const hasMore = page.length > TRANSCRIPT_PAGE_SIZE;
          return { rows: hasMore ? page.slice(0, TRANSCRIPT_PAGE_SIZE) : page, hasMore };
        },
        log,
      );

      // 6-8. Bucket transcripts via the sourceRun → definitionId map built above.
      const perModel = new Map<string, Map<string, PairAccumulator>>();
      for (const m of models) perModel.set(m.modelId, new Map());

      for (const tx of transcripts) {
        const defId = sourceRunToDefId.get(tx.runId);
        if (defId == null) {
          pressureConditionExclusionBreakdown.sourceRunMapping += 1;
          continue;
        }
        const meta = definitionMeta.get(defId);
        if (!meta) {
          pressureConditionExclusionBreakdown.definitionMetadata += 1;
          continue;
        }
        const scenario = tx.scenarioId != null ? scenarioById.get(tx.scenarioId) ?? null : null;

        const decision = resolveTranscriptDecisionModel({
          decisionMetadata: tx.decisionMetadata,
          definitionSnapshot: meta.decisionSnapshot,
          orientationFlipped: scenario?.orientationFlipped ?? null,
        });
        const direction = decision.canonical.direction as CanonicalDirection;

        const outcome = assignOwnOpponent(
          meta.valueFirstToken,
          meta.valueSecondToken,
          direction,
        );

        const strength = strengthFromCanonical(decision.canonical.strength);

        const pairAcc = ensurePairAccumulator(perModel, tx.modelId, meta);
        pairAcc.definitionsMeasured.add(defId);

        if (outcome === 'unscored') {
          const unscoredCell = ensureUnscoredCell(pairAcc);
          const observations = unscoredCell.observationsByDefinition.get(defId);
          if (observations) {
            observations.push({ outcome, strength });
          } else {
            unscoredCell.observationsByDefinition.set(defId, [{ outcome, strength }]);
          }
          continue;
        }

        if (scenario == null) {
          pressureConditionExclusionBreakdown.missingScenario += 1;
          continue;
        }
        const normalized = normalizeScenarioAnalysisMetadata(scenario.content);
        if (normalized === null) {
          pressureConditionExclusionBreakdown.invalidMetadata += 1;
          continue;
        }

        const levels = assignOwnOpponentLevels(
          meta.dimensions,
          normalized.groupingDimensions,
          meta.ownLookup,
          meta.opponentLookup,
          meta.firstValueToken,
          meta.secondValueToken,
        );
        if (levels === null) {
          pressureConditionExclusionBreakdown.levelAssignment += 1;
          continue;
        }

        const key = cellKey(levels.ownLevel, levels.opponentLevel);
        let cell = pairAcc.cells.get(key);
        if (!cell) {
          cell = {
            ownLevel: levels.ownLevel,
            opponentLevel: levels.opponentLevel,
            observationsByDefinition: new Map(),
          };
          pairAcc.cells.set(key, cell);
        }
        const observations = cell.observationsByDefinition.get(defId);
        if (observations) {
          observations.push({ outcome, strength });
        } else {
          cell.observationsByDefinition.set(defId, [{ outcome, strength }]);
        }
      }

      // 9-13. Build per-model output.
      const outputModels: PressureSensitivityModelShape[] = [];
      const insufficient: InsufficientPressureSensitivityModelShape[] = [];
      const sanityBreakdown: DirectionalSanityCheckEntryShape[] = [];
      let sanityPositive = 0;
      let sanityFlat = 0;
      let sanityNegative = 0;
      let sanityUnmeasurable = 0;

      for (const model of models) {
        const pairs = perModel.get(model.modelId) ?? new Map<string, PairAccumulator>();
        const valuePairs: PressureSensitivityValuePairShape[] = [];
        let modelUnscored = 0;
        const perPairPressureResponses: number[] = [];

        for (const acc of pairs.values()) {
          const grid: SensitivityCellShape[] = [];
          let pairN = 0;
          let pairUnscored = 0;
          for (const [, cellAcc] of acc.cells) {
            const metrics = buildVignetteWeightedCellMetrics(
              [...cellAcc.observationsByDefinition.values()],
              MIN_N,
            );

            pairN += metrics.n;
            pairUnscored += metrics.unscoredCount;
            grid.push({
              ownLevel: cellAcc.ownLevel,
              opponentLevel: cellAcc.opponentLevel,
              n: metrics.n,
              successes: metrics.successes,
              opponentSuccesses: metrics.opponentSuccesses,
              unscoredCount: metrics.unscoredCount,
              winRate: metrics.winRate,
              opponentWinRate: metrics.opponentWinRate,
              conviction: metrics.conviction,
              netScore: metrics.netScore,
              lowData: metrics.lowData,
            });
          }
          modelUnscored += pairUnscored;

          const pressureResponse = pooledDirectionalReduction(grid, MIN_N);
          valuePairs.push({
            pairKey: acc.pairKey,
            firstValueToken: acc.firstValueToken,
            firstValueLabel: formatValueLabel(acc.firstValueToken),
            secondValueToken: acc.secondValueToken,
            secondValueLabel: formatValueLabel(acc.secondValueToken),
            pressureResponse: {
              value: pressureResponse.value,
              ciLow: pressureResponse.ciLow,
              ciHigh: pressureResponse.ciHigh,
              baselineRate: pressureResponse.baselineRate,
              pushTowardFirstRate: pressureResponse.pushTowardFirstRate,
              pushTowardSecondRate: pressureResponse.pushTowardSecondRate,
              qualifyingTrials: pressureResponse.qualifyingTrials,
              reason: pressureResponse.reason,
            },
            n: pairN,
            unscoredCount: pairUnscored,
            grid,
            definitionsMeasured: acc.definitionsMeasured.size,
          });

          if (pressureResponse.value !== null) {
            perPairPressureResponses.push(pressureResponse.value);

            const classification: 'positive' | 'flat' | 'negative' =
              Math.abs(pressureResponse.value) < FLAT_DELTA_THRESHOLD
                ? 'flat'
                : pressureResponse.value > 0
                  ? 'positive'
                  : 'negative';
            if (classification === 'positive') sanityPositive += 1;
            else if (classification === 'flat') sanityFlat += 1;
            else sanityNegative += 1;
            sanityBreakdown.push({
              modelId: model.modelId,
              pairKey: acc.pairKey,
              pressureResponse: pressureResponse.value,
              classification,
            });
          } else {
            sanityUnmeasurable += 1;
          }
        }

        const pressureResponseSummary = summarizePressureResponse(perPairPressureResponses);

        if (valuePairs.length === 0 || pressureResponseSummary.pairsMeasured === 0) {
          insufficient.push({
            modelId: model.modelId,
            label: model.displayName,
            providerName: model.provider.displayName ?? model.provider.name,
            reason: 'no-coverage',
          });
          continue;
        }

        outputModels.push({
          modelId: model.modelId,
          label: model.displayName,
          providerName: model.provider.displayName ?? model.provider.name,
          pressureResponseSummary,
          valuePairs: valuePairs.sort((a, b) => a.pairKey.localeCompare(b.pairKey)),
          unscoredCount: modelUnscored,
        });
      }

      const measuredCount = sanityPositive + sanityFlat + sanityNegative;
      const directionalSanityCheck: DirectionalSanityCheckShape = {
        positivePct: measuredCount === 0 ? 0 : (sanityPositive / measuredCount) * 100,
        flatPct: measuredCount === 0 ? 0 : (sanityFlat / measuredCount) * 100,
        negativePct: measuredCount === 0 ? 0 : (sanityNegative / measuredCount) * 100,
        measuredCount,
        unmeasurableCount: sanityUnmeasurable,
        breakdown: sanityBreakdown,
      };

      return {
        models: outputModels.sort((a, b) => {
          const aMean = a.pressureResponseSummary.mean;
          const bMean = b.pressureResponseSummary.mean;
          if (aMean === null && bMean === null) {
            return a.label.localeCompare(b.label);
          }
          if (aMean === null) return 1;
          if (bMean === null) return -1;
          if (bMean !== aMean) return bMean - aMean;
          return a.label.localeCompare(b.label);
        }),
        insufficient,
        excludedDefinitions,
        pressureConditionExcludedCount: totalPressureConditionExclusions(
          pressureConditionExclusionBreakdown,
        ),
        pressureConditionExclusionBreakdown,
        directionalSanityCheck,
        transcriptCapHit,
      };
    },
  }),
);

function ensurePairAccumulator(
  perModel: Map<string, Map<string, PairAccumulator>>,
  modelId: string,
  meta: DefinitionMetadata,
): PairAccumulator {
  let pairs = perModel.get(modelId);
  if (!pairs) {
    pairs = new Map();
    perModel.set(modelId, pairs);
  }
  let acc = pairs.get(meta.pairKey);
  if (!acc) {
    acc = {
      pairKey: meta.pairKey,
      firstValueToken: meta.firstValueToken,
      secondValueToken: meta.secondValueToken,
      cells: new Map(),
      definitionsMeasured: new Set(),
    };
    pairs.set(meta.pairKey, acc);
  }
  return acc;
}

function ensureUnscoredCell(pairAcc: PairAccumulator): CellAccumulator {
  // Unscored observations don't have a meaningful (ownLevel, opponentLevel); we use level 0/0
  // which is outside the 1..5 range and is filtered out of band reduction and baseline.
  const key = cellKey(0, 0);
  let cell = pairAcc.cells.get(key);
  if (!cell) {
    cell = {
      ownLevel: 0,
      opponentLevel: 0,
      observationsByDefinition: new Map(),
    };
    pairAcc.cells.set(key, cell);
  }
  return cell;
}

export function buildEmptyResult(
  models: ModelRow[],
  transcriptCapHit = false,
): PressureSensitivityResultShape {
  return {
    models: [],
    insufficient: models.map((m) => ({
      modelId: m.modelId,
      label: m.displayName,
      providerName: m.provider.displayName ?? m.provider.name,
      reason: 'no-coverage',
    })),
    excludedDefinitions: [],
    pressureConditionExcludedCount: 0,
    pressureConditionExclusionBreakdown: emptyPressureConditionExclusionBreakdown(),
    directionalSanityCheck: {
      positivePct: 0,
      flatPct: 0,
      negativePct: 0,
      measuredCount: 0,
      unmeasurableCount: 0,
      breakdown: [],
    },
    transcriptCapHit,
  };
}
