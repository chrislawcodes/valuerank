import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { resolveTranscriptDecisionModel } from './domain/shared.js';
import {
  PressureSensitivityResultRef,
  type BandStatShape,
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
  aggregateSensitivity,
  applyBandReduction,
  buildCellMetrics,
  computeBaselineWinRate,
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

const MIN_N = 3;
const FLAT_DELTA_THRESHOLD = 0.02;

type ModelRow = {
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
  definitionSnapshot: unknown;
  scenario: { content: unknown; orientationFlipped: boolean } | null;
};

type DefinitionMetadata = {
  id: string;
  name: string;
  /** Definition's stored value_first.token (used to remap canonical direction). */
  valueFirstToken: string;
  /** Definition's stored value_second.token (used to remap canonical direction). */
  valueSecondToken: string;
  /** Alphabetical canonical own (sortedTokens[0]). */
  ownToken: string;
  /** Alphabetical canonical opponent (sortedTokens[1]). */
  opponentToken: string;
  pairKey: string;
  ownLookup: (raw: unknown) => number | null;
  opponentLookup: (raw: unknown) => number | null;
  dimensions: ReadonlyArray<DefinitionDimension>;
};

type CellAccumulator = {
  ownLevel: number;
  opponentLevel: number;
  observations: Observation[];
};

type PairAccumulator = {
  pairKey: string;
  ownToken: string;
  opponentToken: string;
  cells: Map<string, CellAccumulator>;
  definitionsMeasured: Set<string>;
  definitionsExcluded: Set<string>;
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

builder.queryField('pressureSensitivity', (t) =>
  t.field({
    type: PressureSensitivityResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      providerId: t.arg.id({ required: false }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args): Promise<PressureSensitivityResultShape> => {
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const providerId = args.providerId != null ? String(args.providerId) : null;
      const signature = String(args.signature);

      // 1. Roster
      const activeModels = (await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        include: { provider: true },
      })) as ModelRow[];

      const models = providerId == null
        ? activeModels
        : activeModels.filter((m) =>
          m.providerId === providerId
          || m.provider.id === providerId
          || m.provider.name === providerId
          || m.provider.displayName === providerId,
        );

      // 2. Aggregate runs
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
        const [ownToken, opponentToken] = canonicalOwnOpponent(
          components.value_first.token,
          components.value_second.token,
        );

        const dimensions: DefinitionDimension[] = (content.dimensions ?? []).map((d) => ({
          name: d.name,
          levels: d.levels,
          values: d.values,
        }));

        const ownDim = dimensions.find((d) => typeof d.name === 'string' && d.name.trim() === ownToken);
        const opponentDim = dimensions.find((d) => typeof d.name === 'string' && d.name.trim() === opponentToken);
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

        definitionMeta.set(defId, {
          id: defId,
          name: defNames.get(defId) ?? defId,
          valueFirstToken: components.value_first.token,
          valueSecondToken: components.value_second.token,
          ownToken,
          opponentToken,
          pairKey,
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
      const sourceRunToDefId = new Map<string, string>();
      for (const r of eligibleRuns) {
        const defId = r.definition?.id ?? r.definitionId;
        if (!definitionMeta.has(defId)) continue;
        for (const sourceRunId of extractSourceRunIds(r.config)) {
          sourceRunToDefId.set(sourceRunId, defId);
        }
      }
      const sourceRunIds = [...sourceRunToDefId.keys()];
      const rosterModelIds = models.map((m) => m.modelId);
      let excludedScenariosCount = 0;

      // Defensive cap: pressure-sensitivity reads raw transcripts (no pooling per FR-022)
      // bounded by signature-filtered Aggregate-tagged runs' source runs. At current scale
      // (~270 definitions × ~8 models × few transcripts each) the volume is comfortable,
      // but the cap prevents an unrelated runaway dataset from OOMing the API. Adjust
      // upward intentionally if real coverage grows past this threshold.
      const TRANSCRIPT_FETCH_LIMIT = 200_000;
      const transcripts = sourceRunIds.length === 0 || rosterModelIds.length === 0
        ? []
        : ((await db.transcript.findMany({
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
            definitionSnapshot: true,
            scenario: { select: { content: true, orientationFlipped: true } },
          },
          take: TRANSCRIPT_FETCH_LIMIT,
        })) as TranscriptRow[]);

      // 6-8. Bucket transcripts via the sourceRun → definitionId map built above.
      const perModel = new Map<string, Map<string, PairAccumulator>>();
      for (const m of models) perModel.set(m.modelId, new Map());

      for (const tx of transcripts) {
        const defId = sourceRunToDefId.get(tx.runId);
        if (defId == null) continue;
        const meta = definitionMeta.get(defId);
        if (!meta) continue;

        const decision = resolveTranscriptDecisionModel({
          decisionMetadata: tx.decisionMetadata,
          definitionSnapshot: tx.definitionSnapshot,
          orientationFlipped: tx.scenario?.orientationFlipped ?? null,
        });
        const direction = decision.canonical.direction as CanonicalDirection;

        // The transcript's canonical direction is relative to the Definition's stored
        // value_first / value_second order. assignOwnOpponent remaps it to canonical
        // (alphabetical) own/opponent so mirrored Definitions don't end up with inverted Δ.
        const outcome = assignOwnOpponent(
          meta.valueFirstToken,
          meta.valueSecondToken,
          direction,
        );

        const strength = strengthFromCanonical(decision.canonical.strength);

        const pairAcc = ensurePairAccumulator(perModel, tx.modelId, meta);
        pairAcc.definitionsMeasured.add(defId);

        if (outcome === 'unscored') {
          // unscored doesn't go into a cell (no level resolution needed)
          const unscoredCell = ensureUnscoredCell(pairAcc);
          unscoredCell.observations.push({ outcome, strength });
          continue;
        }

        if (tx.scenario == null) continue;
        const normalized = normalizeScenarioAnalysisMetadata(tx.scenario.content);
        if (normalized === null) {
          excludedScenariosCount += 1;
          continue;
        }

        const levels = assignOwnOpponentLevels(
          meta.dimensions,
          normalized.groupingDimensions,
          meta.ownLookup,
          meta.opponentLookup,
          meta.ownToken,
          meta.opponentToken,
        );
        if (levels === null) continue;

        const key = cellKey(levels.ownLevel, levels.opponentLevel);
        let cell = pairAcc.cells.get(key);
        if (!cell) {
          cell = { ownLevel: levels.ownLevel, opponentLevel: levels.opponentLevel, observations: [] };
          pairAcc.cells.set(key, cell);
        }
        cell.observations.push({ outcome, strength });
      }

      // 9-13. Build per-model output
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

        for (const acc of pairs.values()) {
          const grid: SensitivityCellShape[] = [];
          let pairN = 0;
          let pairUnscored = 0;
          for (const [, cellAcc] of acc.cells) {
            const metrics = buildCellMetrics(cellAcc.observations);
            pairN += metrics.n;
            pairUnscored += metrics.unscoredCount;
            grid.push({
              ownLevel: cellAcc.ownLevel,
              opponentLevel: cellAcc.opponentLevel,
              n: metrics.n,
              unscoredCount: metrics.unscoredCount,
              winRate: metrics.winRate,
              conviction: metrics.conviction,
              netScore: metrics.netScore,
              lowData: metrics.n < MIN_N,
            });
          }
          modelUnscored += pairUnscored;

          const reduction = applyBandReduction(grid, MIN_N);
          const baseline = computeBaselineWinRate(grid, MIN_N);

          const directionDelta: BandStatShape = {
            value: reduction.directionDelta,
            lowBandMean: reduction.lowBandWinRate,
            highBandMean: reduction.highBandWinRate,
          };
          const convictionDelta: BandStatShape = {
            value: reduction.convictionDelta,
            lowBandMean: reduction.lowBandConviction,
            highBandMean: reduction.highBandConviction,
          };
          const netScoreDelta: BandStatShape = {
            value: reduction.netScoreDelta,
            lowBandMean: reduction.lowBandNetScore,
            highBandMean: reduction.highBandNetScore,
          };

          valuePairs.push({
            pairKey: acc.pairKey,
            ownToken: acc.ownToken,
            opponentToken: acc.opponentToken,
            directionDelta,
            convictionDelta,
            netScoreDelta,
            baselineWinRate: baseline,
            n: pairN,
            unscoredCount: pairUnscored,
            grid,
            definitionsMeasured: acc.definitionsMeasured.size,
            definitionsExcluded: acc.definitionsExcluded.size,
          });

          if (reduction.directionDelta !== null) {
            const delta = reduction.directionDelta;
            const classification: 'positive' | 'flat' | 'negative' =
              Math.abs(delta) < FLAT_DELTA_THRESHOLD ? 'flat' : delta > 0 ? 'positive' : 'negative';
            if (classification === 'positive') sanityPositive += 1;
            else if (classification === 'flat') sanityFlat += 1;
            else sanityNegative += 1;
            sanityBreakdown.push({
              modelId: model.modelId,
              pairKey: acc.pairKey,
              directionDelta: delta,
              classification,
            });
          } else {
            sanityUnmeasurable += 1;
          }
        }

        const aggregate = aggregateSensitivity(valuePairs.map((vp) => ({ netScoreDelta: vp.netScoreDelta.value })));
        const valuePairsExcluded = valuePairs.filter((vp) => vp.netScoreDelta.value === null).length;

        if (valuePairs.length === 0 || aggregate.valuePairsMeasured === 0) {
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
          aggregateSensitivity: { ...aggregate, valuePairsExcluded },
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
        models: outputModels.sort((a, b) =>
          (b.aggregateSensitivity.value ?? -1) - (a.aggregateSensitivity.value ?? -1),
        ),
        insufficient,
        excludedDefinitions,
        excludedScenariosCount,
        directionalSanityCheck,
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
      ownToken: meta.ownToken,
      opponentToken: meta.opponentToken,
      cells: new Map(),
      definitionsMeasured: new Set(),
      definitionsExcluded: new Set(),
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
    cell = { ownLevel: 0, opponentLevel: 0, observations: [] };
    pairAcc.cells.set(key, cell);
  }
  return cell;
}

function buildEmptyResult(models: ModelRow[]): PressureSensitivityResultShape {
  return {
    models: [],
    insufficient: models.map((m) => ({
      modelId: m.modelId,
      label: m.displayName,
      providerName: m.provider.displayName ?? m.provider.name,
      reason: 'no-coverage',
    })),
    excludedDefinitions: [],
    excludedScenariosCount: 0,
    directionalSanityCheck: {
      positivePct: 0,
      flatPct: 0,
      negativePct: 0,
      measuredCount: 0,
      unmeasurableCount: 0,
      breakdown: [],
    },
  };
}
