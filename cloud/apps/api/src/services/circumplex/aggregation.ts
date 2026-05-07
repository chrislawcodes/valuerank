import { db as defaultDb } from '@valuerank/db';
import { SCHWARTZ_CIRCULAR_ORDER, type ValueKey } from '@valuerank/shared/schwartz';
import { extractValuePair, type DomainAnalysisValuePair } from '../../graphql/queries/domain-analysis-values.js';
import { runMatchesSignature } from '../../graphql/queries/domain-coverage-gql-types.js';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/decision-model.js';
import { computePairwiseWinRate } from '../../utils/pairwise-math.js';

export type CircumplexPairCell = {
  winRate: number | null;
  trials: number;
  neutrals: number;
};

export type CircumplexPairMatrix = CircumplexPairCell[][];

type RunRow = {
  id: string;
  config: unknown;
  status: string;
  deletedAt: Date | null;
  definitionId: string;
};

type TranscriptRow = {
  runId: string;
  modelId: string;
  scenarioId: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  scenario: {
    orientationFlipped: boolean | null;
    deletedAt: Date | null;
  } | null;
  deletedAt: Date | null;
};

type CircumplexDb = Pick<typeof defaultDb, 'run' | 'transcript'>;

export type PairwiseVignetteStats = {
  prioritizedA: number;
  prioritizedB: number;
  neutrals: number;
};

type PairStats = {
  pair: DomainAnalysisValuePair;
  vignettes: Map<string, PairwiseVignetteStats>;
};

function createEmptyCell(): CircumplexPairCell {
  return { winRate: null, trials: 0, neutrals: 0 };
}

function createEmptyMatrix(): CircumplexPairMatrix {
  return SCHWARTZ_CIRCULAR_ORDER.map(() => SCHWARTZ_CIRCULAR_ORDER.map(() => createEmptyCell()));
}

function pairKey(pair: DomainAnalysisValuePair): string {
  // Canonicalize: always sort alphabetically so both ingest and lookup
  // produce the same key regardless of whether extractValuePair returns
  // (A, B) or (B, A) for the same underlying scenario. This prevents
  // silent split of counts across two keys.
  const [first, second] = pair.valueA < pair.valueB
    ? [pair.valueA, pair.valueB]
    : [pair.valueB, pair.valueA];
  return `${first}::${second}`;
}

export function buildOrderedPairCell(args: {
  pair: DomainAnalysisValuePair;
  left: ValueKey;
  vignettes: Iterable<PairwiseVignetteStats>;
}): CircumplexPairCell {
  const vignetteRates: number[] = [];
  let totalTrials = 0;
  let totalNeutrals = 0;

  for (const vigStats of args.vignettes) {
    const wins = args.left === args.pair.valueA ? vigStats.prioritizedA : vigStats.prioritizedB;
    const losses = args.left === args.pair.valueA ? vigStats.prioritizedB : vigStats.prioritizedA;
    const rate = computePairwiseWinRate(wins, losses, vigStats.neutrals);
    if (rate !== null) {
      vignetteRates.push(rate);
    }
    totalTrials += wins + losses + vigStats.neutrals;
    totalNeutrals += vigStats.neutrals;
  }

  if (vignetteRates.length === 0) return createEmptyCell();

  const winRate = vignetteRates.reduce((sum, r) => sum + r, 0) / vignetteRates.length;
  return {
    winRate,
    trials: totalTrials,
    neutrals: totalNeutrals,
  };
}

function buildOrderedCell(stats: PairStats | undefined, left: ValueKey): CircumplexPairCell {
  if (stats == null) return createEmptyCell();
  return buildOrderedPairCell({
    pair: stats.pair,
    left,
    vignettes: stats.vignettes.values(),
  });
}

export async function aggregatePairwiseWinRates(args: {
  modelIds: string[];
  signature: string;
  /**
   * When provided, only transcripts from runs whose definition belongs to this
   * domain are included. Resolve definition IDs for the domain before calling.
   */
  domainDefinitionIds?: Set<string> | null;
  db?: CircumplexDb;
}): Promise<Map<string, CircumplexPairMatrix>> {
  const db = args.db ?? defaultDb;
  const modelIdSet = new Set(args.modelIds);
  const scopedRunIdSet = new Set<string>();
  const output = new Map<string, CircumplexPairMatrix>();
  const statsByModel = new Map<string, Map<string, PairStats>>();

  for (const modelId of args.modelIds) {
    output.set(modelId, createEmptyMatrix());
    statsByModel.set(modelId, new Map<string, PairStats>());
  }

  if (args.modelIds.length === 0) {
    return output;
  }

  // Circumplex needs raw transcripts. Aggregate-tagged runs are rollups that
  // reference sourceRunIds — they don't have transcripts directly. We need
  // the PRIMARY runs that actually produced transcripts. We filter out the
  // aggregate rollups (config.isAggregate === true) to avoid double-counting
  // their source data, then pick the ones that match the requested signature.
  const runs = (await db.run.findMany({
    where: {
      status: 'COMPLETED',
      deletedAt: null,
    },
    select: {
      id: true,
      config: true,
      status: true,
      deletedAt: true,
      definitionId: true,
    },
  })) as RunRow[];

  const scopedRunIds = runs
    .filter((run) => {
      if (run.status !== 'COMPLETED' || run.deletedAt != null) return false;
      const config = run.config as { isAggregate?: boolean } | null;
      if (config?.isAggregate === true) return false;
      if (args.domainDefinitionIds != null && !args.domainDefinitionIds.has(run.definitionId)) return false;
      return runMatchesSignature(run.config, args.signature);
    })
    .map((run) => run.id);
  for (const runId of scopedRunIds) {
    scopedRunIdSet.add(runId);
  }
  if (scopedRunIds.length === 0) {
    return output;
  }

  // Query transcripts per-model instead of one big IN clause. Each transcript
  // row carries a large JSON blob (definitionSnapshot + decisionMetadata), so
  // fetching 20+ models × thousands of trials in one shot blows past Prisma's
  // napi-to-rust string buffer limit and crashes. Per-model keeps each query's
  // result set bounded. Parallelize across models so wall-clock stays under
  // browser timeout — at ~6-8s per model, 20 serial = ~2 min (timeout),
  // parallel = ~8-10s (limited by connection pool).
  const transcriptBatches = await Promise.all(
    args.modelIds.map(async (modelId) => (await db.transcript.findMany({
      where: {
        runId: { in: scopedRunIds },
        modelId,
        deletedAt: null,
      },
      select: {
        runId: true,
        modelId: true,
        scenarioId: true,
        decisionMetadata: true,
        definitionSnapshot: true,
        deletedAt: true,
        scenario: {
          select: {
            orientationFlipped: true,
            deletedAt: true,
          },
        },
      },
    })) as TranscriptRow[]),
  );

  for (const transcripts of transcriptBatches) {
    for (const transcript of transcripts) {
      if (!scopedRunIdSet.has(transcript.runId)) continue;
      if (!modelIdSet.has(transcript.modelId)) continue;
      if (transcript.deletedAt != null || transcript.scenario?.deletedAt != null) continue;

      const pair = extractValuePair(transcript.definitionSnapshot);
      if (pair == null) continue;

      const resolved = resolveTranscriptDecisionModel({
        decisionMetadata: transcript.decisionMetadata,
        definitionSnapshot: transcript.definitionSnapshot,
        orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
        pairOverride: pair,
      });

      if (resolved.canonical.direction === 'unknown') {
        continue;
      }

      const statsMap = statsByModel.get(transcript.modelId);
      if (statsMap == null) continue;

      // Canonicalize the pair orientation so prioritizedA always refers to the
      // lexicographically-smaller value, regardless of which orientation the
      // transcript's definitionSnapshot used. Without this, transcripts from
      // different orientation conventions merge their counts incorrectly.
      const canonicalPair: DomainAnalysisValuePair = pair.valueA < pair.valueB
        ? pair
        : { valueA: pair.valueB, valueB: pair.valueA };

      const key = pairKey(canonicalPair);
      let stats = statsMap.get(key);
      if (stats == null) {
        stats = { pair: canonicalPair, vignettes: new Map() };
        statsMap.set(key, stats);
      }

      // Group by vignette so each scenario contributes equally regardless of
      // how many transcripts it produced. Legacy transcripts without a
      // scenarioId are pooled into a single '__legacy__' bucket per pair.
      const vignetteKey = transcript.scenarioId ?? '__legacy__';
      const vigStats = stats.vignettes.get(vignetteKey) ?? { prioritizedA: 0, prioritizedB: 0, neutrals: 0 };

      if (resolved.canonical.direction === 'neutral') {
        vigStats.neutrals += 1;
      } else if (resolved.canonical.favoredValueKey === canonicalPair.valueA) {
        vigStats.prioritizedA += 1;
      } else if (resolved.canonical.favoredValueKey === canonicalPair.valueB) {
        vigStats.prioritizedB += 1;
      } else {
        continue;
      }

      stats.vignettes.set(vignetteKey, vigStats);
    }
  }

  for (const [modelId, statsMap] of statsByModel.entries()) {
    const matrix = createEmptyMatrix();

    for (let row = 0; row < SCHWARTZ_CIRCULAR_ORDER.length; row += 1) {
      const left = SCHWARTZ_CIRCULAR_ORDER[row]!;
      for (let col = 0; col < SCHWARTZ_CIRCULAR_ORDER.length; col += 1) {
        const right = SCHWARTZ_CIRCULAR_ORDER[col]!;
        if (row === col) {
          matrix[row]![col] = createEmptyCell();
          continue;
        }
        const sortedPair = left < right
          ? { valueA: left, valueB: right }
          : { valueA: right, valueB: left };
        matrix[row]![col] = buildOrderedCell(statsMap.get(pairKey(sortedPair)), left);
      }
    }

    output.set(modelId, matrix);
  }

  return output;
}
