import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError, bucketDecisionDirection } from '@valuerank/shared';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../assumptions-constants.js';
import { parseTemperature } from '../../utils/temperature.js';

type OrderInvarianceStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';
type OrderInvarianceMismatchType = 'direction_flip' | 'exact_flip' | 'missing_pair' | null;

type OrderInvarianceExclusionCount = {
  reason: string;
  count: number;
};

type OrderInvarianceSummary = {
  status: OrderInvarianceStatus;
  matchRate: number | null;
  exactMatchRate: number | null;
  totalCandidatePairs: number;
  qualifyingPairs: number;
  missingPairs: number;
  comparablePairs: number;
  sensitiveModelCount: number;
  sensitiveVignetteCount: number;
  excludedPairs: OrderInvarianceExclusionCount[];
};

type OrderInvarianceRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  majorityVoteBaseline: number | null;
  majorityVoteFlipped: number | null;
  mismatchType: OrderInvarianceMismatchType;
  ordinalDistance: number | null;
  isMatch: boolean | null;
};

type OrderInvarianceResult = {
  generatedAt: Date;
  summary: OrderInvarianceSummary;
  rows: OrderInvarianceRow[];
};

type OrderInvarianceReviewStatus = 'APPROVED' | 'REJECTED' | 'PENDING';

type OrderInvarianceReviewSummary = {
  totalPairs: number;
  reviewedPairs: number;
  approvedPairs: number;
  rejectedPairs: number;
  pendingPairs: number;
  launchReady: boolean;
};

type OrderInvarianceReviewPair = {
  pairId: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  sourceScenarioId: string;
  variantScenarioId: string;
  baselineName: string;
  flippedName: string;
  baselineText: string;
  flippedText: string;
  reviewStatus: OrderInvarianceReviewStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
};

type OrderInvarianceReviewResult = {
  generatedAt: Date;
  summary: OrderInvarianceReviewSummary;
  pairs: OrderInvarianceReviewPair[];
};

type PairScenario = {
  id: string;
  name: string;
  definitionId: string;
  orientationFlipped: boolean;
  content?: unknown;
};

type PairRecord = {
  id?: string;
  equivalenceReviewStatus?: string | null;
  equivalenceReviewedBy?: string | null;
  equivalenceReviewedAt?: Date | null;
  equivalenceReviewNotes?: string | null;
  sourceScenario: PairScenario;
  variantScenario: PairScenario;
};

type CandidateTranscript = {
  id: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  decision: number;
  createdAt: Date;
};

type CandidateTranscriptRecord = {
  id: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  decisionCode: string | null;
  createdAt: Date;
  run: {
    deletedAt: Date | null;
    config: unknown;
    tags: Array<{ tag: { name: string } }>;
  };
};

type PickResult =
  | {
    kind: 'selected';
    selected: CandidateTranscript[];
    modelVersion: string | null;
  }
  | {
    kind: 'insufficient';
  }
  | {
    kind: 'fragmented';
  };

const ORDER_INVARIANCE_KEY = 'order_invariance';
const BASELINE_ASSUMPTION_KEYS = new Set(['temp_zero_determinism', ORDER_INVARIANCE_KEY]);
const VALID_DECISIONS = new Set(['1', '2', '3', '4', '5']);

function getRunAssumptionKey(config: unknown): string | null {
  if (!config || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value !== '' ? value : null;
}

function isAssumptionRun(record: CandidateTranscriptRecord): boolean {
  return record.run.tags.some((tag) => tag.tag.name === 'assumption-run');
}

function isTempZeroRun(record: CandidateTranscriptRecord): boolean {
  const config = record.run.config as { temperature?: unknown } | null;
  return parseTemperature(config?.temperature) === 0;
}

function buildConditionKey(name: string): string {
  const match = name.match(/_(\d+)\s*\/.*_(\d+)$/);
  if (!match) {
    return name;
  }
  return `${match[1] ?? '?'}x${match[2] ?? '?'}`;
}

function parseDecision(decisionCode: string | null): number | null {
  if (decisionCode == null || !VALID_DECISIONS.has(decisionCode)) {
    return null;
  }
  return Number(decisionCode);
}

function normalizeDecision(decision: number, orientationFlipped: boolean): number {
  return orientationFlipped ? 6 - decision : decision;
}

function pickStableTranscripts(
  candidates: CandidateTranscript[],
  requiredCount: number
): PickResult {
  if (candidates.length < requiredCount) {
    return { kind: 'insufficient' };
  }

  const sorted = [...candidates].sort((left, right) => (
    right.createdAt.getTime() - left.createdAt.getTime()
  ));
  const groups = new Map<string, CandidateTranscript[]>();
  const versionOrder: string[] = [];

  for (const candidate of sorted) {
    const key = candidate.modelVersion ?? '__NULL__';
    const existing = groups.get(key);
    if (existing != null) {
      existing.push(candidate);
      continue;
    }
    groups.set(key, [candidate]);
    versionOrder.push(key);
  }

  for (const versionKey of versionOrder) {
    const group = groups.get(versionKey) ?? [];
    if (group.length >= requiredCount) {
      return {
        kind: 'selected',
        selected: group.slice(0, requiredCount),
        modelVersion: versionKey === '__NULL__' ? null : versionKey,
      };
    }
  }

  return groups.size > 1 ? { kind: 'fragmented' } : { kind: 'insufficient' };
}

function computeMajorityVote(values: number[], trimOutliers: boolean): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const considered = trimOutliers && sorted.length >= 3
    ? sorted.slice(1, sorted.length - 1)
    : sorted;

  if (considered.length === 0) {
    return null;
  }

  const counts = new Map<number, number>();
  let maxCount = 0;
  for (const value of considered) {
    const nextCount = (counts.get(value) ?? 0) + 1;
    counts.set(value, nextCount);
    maxCount = Math.max(maxCount, nextCount);
  }

  const modes = Array.from(counts.entries())
    .filter(([, count]) => count === maxCount)
    .map(([value]) => value)
    .sort((left, right) => left - right);

  if (modes.length === 1) {
    return modes[0] ?? null;
  }

  return considered[Math.floor(considered.length / 2)] ?? null;
}

function valuesMatch(left: number, right: number, directionOnly: boolean): boolean {
  if (!directionOnly) {
    return left === right;
  }
  return bucketDecisionDirection(String(left)) === bucketDecisionDirection(String(right));
}

function normalizeReviewStatus(status: string | null | undefined): OrderInvarianceReviewStatus {
  if (status === 'APPROVED' || status === 'REJECTED') {
    return status;
  }
  return 'PENDING';
}

function extractScenarioText(content: unknown): string {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return '';
  }

  const scenarioContent = content as {
    preamble?: unknown;
    prompt?: unknown;
    followups?: unknown;
  };

  const parts: string[] = [];
  if (typeof scenarioContent.preamble === 'string' && scenarioContent.preamble.trim() !== '') {
    parts.push(`Preamble\n${scenarioContent.preamble.trim()}`);
  }
  if (typeof scenarioContent.prompt === 'string' && scenarioContent.prompt.trim() !== '') {
    parts.push(`Prompt\n${scenarioContent.prompt.trim()}`);
  }

  if (Array.isArray(scenarioContent.followups) && scenarioContent.followups.length > 0) {
    const followupParts = scenarioContent.followups
      .filter((followup): followup is { label?: unknown; prompt?: unknown } => (
        !!followup && typeof followup === 'object'
      ))
      .map((followup, index) => {
        const label = typeof followup.label === 'string' && followup.label.trim() !== ''
          ? followup.label.trim()
          : `Followup ${index + 1}`;
        const prompt = typeof followup.prompt === 'string' ? followup.prompt.trim() : '';
        return prompt === '' ? null : `${label}\n${prompt}`;
      })
      .filter((value): value is string => value != null);

    if (followupParts.length > 0) {
      parts.push(`Followups\n${followupParts.join('\n\n')}`);
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n');
  }

  return JSON.stringify(content, null, 2);
}

const OrderInvarianceExclusionCountRef = builder
  .objectRef<OrderInvarianceExclusionCount>('OrderInvarianceExclusionCount')
  .implement({
    fields: (t) => ({
      reason: t.exposeString('reason'),
      count: t.exposeInt('count'),
    }),
  });

const OrderInvarianceSummaryRef = builder
  .objectRef<OrderInvarianceSummary>('OrderInvarianceSummary')
  .implement({
    fields: (t) => ({
      status: t.exposeString('status'),
      matchRate: t.exposeFloat('matchRate', { nullable: true }),
      exactMatchRate: t.exposeFloat('exactMatchRate', { nullable: true }),
      totalCandidatePairs: t.exposeInt('totalCandidatePairs'),
      qualifyingPairs: t.exposeInt('qualifyingPairs'),
      missingPairs: t.exposeInt('missingPairs'),
      comparablePairs: t.exposeInt('comparablePairs'),
      sensitiveModelCount: t.exposeInt('sensitiveModelCount'),
      sensitiveVignetteCount: t.exposeInt('sensitiveVignetteCount'),
      excludedPairs: t.expose('excludedPairs', { type: [OrderInvarianceExclusionCountRef] }),
    }),
  });

const OrderInvarianceRowRef = builder
  .objectRef<OrderInvarianceRow>('OrderInvarianceRow')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      modelLabel: t.exposeString('modelLabel'),
      vignetteId: t.exposeID('vignetteId'),
      vignetteTitle: t.exposeString('vignetteTitle'),
      conditionKey: t.exposeString('conditionKey'),
      majorityVoteBaseline: t.exposeInt('majorityVoteBaseline', { nullable: true }),
      majorityVoteFlipped: t.exposeInt('majorityVoteFlipped', { nullable: true }),
      mismatchType: t.exposeString('mismatchType', { nullable: true }),
      ordinalDistance: t.exposeInt('ordinalDistance', { nullable: true }),
      isMatch: t.exposeBoolean('isMatch', { nullable: true }),
    }),
  });

const OrderInvarianceResultRef = builder
  .objectRef<OrderInvarianceResult>('OrderInvarianceResult')
  .implement({
    fields: (t) => ({
      generatedAt: t.expose('generatedAt', { type: 'DateTime' }),
      summary: t.expose('summary', { type: OrderInvarianceSummaryRef }),
      rows: t.expose('rows', { type: [OrderInvarianceRowRef] }),
    }),
  });

const OrderInvarianceReviewSummaryRef = builder
  .objectRef<OrderInvarianceReviewSummary>('OrderInvarianceReviewSummary')
  .implement({
    fields: (t) => ({
      totalPairs: t.exposeInt('totalPairs'),
      reviewedPairs: t.exposeInt('reviewedPairs'),
      approvedPairs: t.exposeInt('approvedPairs'),
      rejectedPairs: t.exposeInt('rejectedPairs'),
      pendingPairs: t.exposeInt('pendingPairs'),
      launchReady: t.exposeBoolean('launchReady'),
    }),
  });

const OrderInvarianceReviewPairRef = builder
  .objectRef<OrderInvarianceReviewPair>('OrderInvarianceReviewPair')
  .implement({
    fields: (t) => ({
      pairId: t.exposeID('pairId'),
      vignetteId: t.exposeID('vignetteId'),
      vignetteTitle: t.exposeString('vignetteTitle'),
      conditionKey: t.exposeString('conditionKey'),
      sourceScenarioId: t.exposeID('sourceScenarioId'),
      variantScenarioId: t.exposeID('variantScenarioId'),
      baselineName: t.exposeString('baselineName'),
      flippedName: t.exposeString('flippedName'),
      baselineText: t.exposeString('baselineText'),
      flippedText: t.exposeString('flippedText'),
      reviewStatus: t.exposeString('reviewStatus'),
      reviewedBy: t.exposeString('reviewedBy', { nullable: true }),
      reviewedAt: t.expose('reviewedAt', { type: 'DateTime', nullable: true }),
      reviewNotes: t.exposeString('reviewNotes', { nullable: true }),
    }),
  });

const OrderInvarianceReviewResultRef = builder
  .objectRef<OrderInvarianceReviewResult>('OrderInvarianceReviewResult')
  .implement({
    fields: (t) => ({
      generatedAt: t.expose('generatedAt', { type: 'DateTime' }),
      summary: t.expose('summary', { type: OrderInvarianceReviewSummaryRef }),
      pairs: t.expose('pairs', { type: [OrderInvarianceReviewPairRef] }),
    }),
  });

builder.queryField('assumptionsOrderInvarianceReview', (t) =>
  t.field({
    type: OrderInvarianceReviewResultRef,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const lockedById = new Map(
        LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => [vignette.id, vignette])
      );

      const pairRows = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: ORDER_INVARIANCE_KEY,
          sourceScenario: {
            definitionId: { in: Array.from(lockedById.keys()) },
            deletedAt: null,
          },
          variantScenario: {
            deletedAt: null,
          },
        },
        include: {
          sourceScenario: {
            select: {
              id: true,
              name: true,
              definitionId: true,
              orientationFlipped: true,
              content: true,
            },
          },
          variantScenario: {
            select: {
              id: true,
              name: true,
              definitionId: true,
              orientationFlipped: true,
              content: true,
            },
          },
        },
      }) as PairRecord[];

      const pairs = pairRows.map((pair) => {
        const vignette = lockedById.get(pair.sourceScenario.definitionId);
        const reviewStatus = normalizeReviewStatus(pair.equivalenceReviewStatus);

        return {
          pairId: pair.id ?? `${pair.sourceScenario.id}:${pair.variantScenario.id}`,
          vignetteId: pair.sourceScenario.definitionId,
          vignetteTitle: vignette?.title ?? pair.sourceScenario.definitionId,
          conditionKey: buildConditionKey(pair.sourceScenario.name),
          sourceScenarioId: pair.sourceScenario.id,
          variantScenarioId: pair.variantScenario.id,
          baselineName: pair.sourceScenario.name,
          flippedName: pair.variantScenario.name,
          baselineText: extractScenarioText(pair.sourceScenario.content),
          flippedText: extractScenarioText(pair.variantScenario.content),
          reviewStatus,
          reviewedBy: pair.equivalenceReviewedBy ?? null,
          reviewedAt: pair.equivalenceReviewedAt ?? null,
          reviewNotes: pair.equivalenceReviewNotes ?? null,
        };
      }).sort((left, right) => (
        left.vignetteTitle.localeCompare(right.vignetteTitle)
        || left.conditionKey.localeCompare(right.conditionKey, undefined, { numeric: true, sensitivity: 'base' })
      ));

      const approvedPairs = pairs.filter((pair) => pair.reviewStatus === 'APPROVED').length;
      const rejectedPairs = pairs.filter((pair) => pair.reviewStatus === 'REJECTED').length;
      const reviewedPairs = pairs.filter((pair) => pair.reviewedAt != null).length;
      const totalPairs = pairs.length;

      return {
        generatedAt: new Date(),
        summary: {
          totalPairs,
          reviewedPairs,
          approvedPairs,
          rejectedPairs,
          pendingPairs: totalPairs - reviewedPairs,
          launchReady: totalPairs > 0 && approvedPairs === totalPairs,
        },
        pairs,
      };
    },
  })
);

builder.queryField('assumptionsOrderInvariance', (t) =>
  t.field({
    type: OrderInvarianceResultRef,
    args: {
      directionOnly: t.arg.boolean({ required: false }),
      trimOutliers: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args) => {
      const directionOnly = args.directionOnly ?? true;
      const trimOutliers = args.trimOutliers ?? true;

      const pairRows = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: ORDER_INVARIANCE_KEY,
          equivalenceReviewStatus: 'APPROVED',
          equivalenceReviewedAt: { not: null },
        },
        include: {
          sourceScenario: {
            select: {
              id: true,
              name: true,
              definitionId: true,
              orientationFlipped: true,
            },
          },
          variantScenario: {
            select: {
              id: true,
              name: true,
              definitionId: true,
              orientationFlipped: true,
            },
          },
        },
      }) as PairRecord[];

      const lockedById = new Map(
        LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => [vignette.id, vignette])
      );
      const relevantPairs = pairRows.filter((pair) => lockedById.has(pair.sourceScenario.definitionId));

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, displayName: true },
      });
      const modelEntries = activeModels.length > 0
        ? activeModels.map((model) => ({
          modelId: model.modelId,
          modelLabel: model.displayName,
        }))
        : [];

      const allScenarioIds = Array.from(new Set(
        relevantPairs.flatMap((pair) => [pair.sourceScenario.id, pair.variantScenario.id])
      ));

      const transcriptRecords = allScenarioIds.length > 0
        ? await db.transcript.findMany({
          where: {
            deletedAt: null,
            scenarioId: { in: allScenarioIds },
            decisionCode: { in: Array.from(VALID_DECISIONS) },
          },
          select: {
            id: true,
            scenarioId: true,
            modelId: true,
            modelVersion: true,
            decisionCode: true,
            createdAt: true,
            run: {
              select: {
                deletedAt: true,
                config: true,
                tags: {
                  select: {
                    tag: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        })
        : [];

      const sourceScenarioIds = new Set(relevantPairs.map((pair) => pair.sourceScenario.id));
      const transcriptsByScenarioAndModel = new Map<string, CandidateTranscript[]>();
      const inferredModels = new Map<string, string>();

      for (const transcript of transcriptRecords as CandidateTranscriptRecord[]) {
        if (transcript.scenarioId == null || transcript.run.deletedAt != null) {
          continue;
        }
        if (!isTempZeroRun(transcript)) {
          continue;
        }

        const assumptionKey = getRunAssumptionKey(transcript.run.config);
        const isBaselineScenario = sourceScenarioIds.has(transcript.scenarioId);
        if (isBaselineScenario) {
          if (assumptionKey == null || !BASELINE_ASSUMPTION_KEYS.has(assumptionKey)) {
            continue;
          }
          if (assumptionKey !== 'temp_zero_determinism' && !isAssumptionRun(transcript)) {
            continue;
          }
        } else {
          if (assumptionKey !== ORDER_INVARIANCE_KEY || !isAssumptionRun(transcript)) {
            continue;
          }
        }

        const decision = parseDecision(transcript.decisionCode);
        if (decision == null) {
          continue;
        }

        inferredModels.set(transcript.modelId, transcript.modelId);
        const key = `${transcript.scenarioId}::${transcript.modelId}`;
        const existing = transcriptsByScenarioAndModel.get(key);
        const candidate: CandidateTranscript = {
          id: transcript.id,
          scenarioId: transcript.scenarioId,
          modelId: transcript.modelId,
          modelVersion: transcript.modelVersion,
          decision: normalizeDecision(decision, !isBaselineScenario),
          createdAt: transcript.createdAt,
        };

        if (existing != null) {
          existing.push(candidate);
        } else {
          transcriptsByScenarioAndModel.set(key, [candidate]);
        }
      }

      const effectiveModels = modelEntries.length > 0
        ? modelEntries
        : Array.from(inferredModels.keys()).sort().map((modelId) => ({ modelId, modelLabel: modelId }));

      const excludedCounts = new Map<string, number>();
      const rows: OrderInvarianceRow[] = [];
      let qualifyingPairs = 0;
      let missingPairs = 0;
      let comparablePairs = 0;
      let directionMatchCount = 0;
      let exactMatchCount = 0;

      for (const pair of relevantPairs) {
        const vignette = lockedById.get(pair.sourceScenario.definitionId);
        const vignetteTitle = vignette?.title ?? pair.sourceScenario.definitionId;
        const conditionKey = buildConditionKey(pair.sourceScenario.name);

        for (const model of effectiveModels) {
          const baselineKey = `${pair.sourceScenario.id}::${model.modelId}`;
          const flippedKey = `${pair.variantScenario.id}::${model.modelId}`;

          const baselinePick = pickStableTranscripts(
            transcriptsByScenarioAndModel.get(baselineKey) ?? [],
            5
          );
          const flippedPick = pickStableTranscripts(
            transcriptsByScenarioAndModel.get(flippedKey) ?? [],
            5
          );

          if (baselinePick.kind === 'fragmented' || flippedPick.kind === 'fragmented') {
            excludedCounts.set(
              'model_version_mismatch',
              (excludedCounts.get('model_version_mismatch') ?? 0) + 1
            );
            continue;
          }

          qualifyingPairs += 1;

          if (baselinePick.kind !== 'selected' || flippedPick.kind !== 'selected') {
            missingPairs += 1;
            rows.push({
              modelId: model.modelId,
              modelLabel: model.modelLabel,
              vignetteId: pair.sourceScenario.definitionId,
              vignetteTitle,
              conditionKey,
              majorityVoteBaseline: null,
              majorityVoteFlipped: null,
              mismatchType: 'missing_pair',
              ordinalDistance: null,
              isMatch: null,
            });
            continue;
          }

          const versionsCompatible = (
            baselinePick.modelVersion === flippedPick.modelVersion
            || (baselinePick.modelVersion == null && flippedPick.modelVersion == null)
          );
          if (!versionsCompatible) {
            qualifyingPairs -= 1;
            excludedCounts.set(
              'model_version_mismatch',
              (excludedCounts.get('model_version_mismatch') ?? 0) + 1
            );
            continue;
          }

          const baselineValue = computeMajorityVote(
            baselinePick.selected.map((transcript) => transcript.decision),
            trimOutliers
          );
          const flippedValue = computeMajorityVote(
            flippedPick.selected.map((transcript) => transcript.decision),
            trimOutliers
          );

          if (baselineValue == null || flippedValue == null) {
            missingPairs += 1;
            rows.push({
              modelId: model.modelId,
              modelLabel: model.modelLabel,
              vignetteId: pair.sourceScenario.definitionId,
              vignetteTitle,
              conditionKey,
              majorityVoteBaseline: baselineValue,
              majorityVoteFlipped: flippedValue,
              mismatchType: 'missing_pair',
              ordinalDistance: null,
              isMatch: null,
            });
            continue;
          }

          comparablePairs += 1;
          const directionMatch = valuesMatch(baselineValue, flippedValue, true);
          const exactMatch = valuesMatch(baselineValue, flippedValue, false);
          const isMatch = directionOnly ? directionMatch : exactMatch;
          if (directionMatch) {
            directionMatchCount += 1;
          }
          if (exactMatch) {
            exactMatchCount += 1;
          }

          const mismatchType: OrderInvarianceMismatchType = isMatch
            ? null
            : (directionOnly ? 'direction_flip' : 'exact_flip');

          rows.push({
            modelId: model.modelId,
            modelLabel: model.modelLabel,
            vignetteId: pair.sourceScenario.definitionId,
            vignetteTitle,
            conditionKey,
            majorityVoteBaseline: baselineValue,
            majorityVoteFlipped: flippedValue,
            mismatchType,
            ordinalDistance: Math.abs(baselineValue - flippedValue),
            isMatch,
          });
        }
      }

      const comparableRows = rows.filter((row) => row.ordinalDistance != null);
      const sensitiveModelCount = new Set(
        comparableRows
          .filter((row) => (row.ordinalDistance ?? 0) >= 2)
          .map((row) => row.modelId)
      ).size;
      const sensitiveVignetteCount = new Set(
        comparableRows
          .filter((row) => (row.ordinalDistance ?? 0) >= 2)
          .map((row) => row.vignetteId)
      ).size;

      const summary: OrderInvarianceSummary = {
        status: comparablePairs === 0 ? 'INSUFFICIENT_DATA' : 'COMPUTED',
        matchRate: comparablePairs > 0
          ? (directionOnly ? directionMatchCount : exactMatchCount) / comparablePairs
          : null,
        exactMatchRate: comparablePairs > 0 ? exactMatchCount / comparablePairs : null,
        totalCandidatePairs: relevantPairs.length * effectiveModels.length,
        qualifyingPairs,
        missingPairs,
        comparablePairs,
        sensitiveModelCount,
        sensitiveVignetteCount,
        excludedPairs: Array.from(excludedCounts.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([reason, count]) => ({ reason, count })),
      };

      return {
        generatedAt: new Date(),
        summary,
        rows: rows.sort((left, right) => (
          left.vignetteTitle.localeCompare(right.vignetteTitle)
          || left.modelLabel.localeCompare(right.modelLabel)
          || left.conditionKey.localeCompare(right.conditionKey, undefined, { numeric: true, sensitivity: 'base' })
        )),
      };
    },
  })
);
