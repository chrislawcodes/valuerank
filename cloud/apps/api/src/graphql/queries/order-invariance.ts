import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../assumptions-constants.js';
import { parseTemperature } from '../../utils/temperature.js';
import {
  type PairLevelMarginSummary,
} from '../../services/assumptions/order-effect-analysis.js';
import {
  getOrderInvarianceAnalysisResult,
} from '../../services/assumptions/order-effect-service.js';

export {
  computeMADMetrics,
  getScaleEffectStatus,
  normalizeDecision,
} from '../../services/assumptions/order-effect-analysis.js';

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
  presentationEffectMAD: number | null;
  scaleEffectMAD: number | null;
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
  variantType: string | null;
  majorityVoteBaseline: number | null;
  majorityVoteFlipped: number | null;
  mismatchType: OrderInvarianceMismatchType;
  ordinalDistance: number | null;
  isMatch: boolean | null;
};

type OrderInvarianceTranscript = {
  id: string;
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: Date;
  lastAccessedAt: Date | null;
  orderLabel: string;
  attributeALevel: number | null;
  attributeBLevel: number | null;
};

type OrderInvarianceTranscriptResult = {
  generatedAt: Date;
  vignetteId: string;
  vignetteTitle: string;
  modelId: string;
  modelLabel: string;
  conditionKey: string;
  attributeALabel: string | null;
  attributeBLabel: string | null;
  transcripts: OrderInvarianceTranscript[];
};

type OrderInvarianceResult = {
  generatedAt: Date;
  summary: OrderInvarianceSummary;
  modelMetrics: OrderInvarianceModelMetrics[];
  rows: OrderInvarianceRow[];
};

type OrderInvarianceModelMetrics = {
  modelId: string;
  modelLabel: string;
  matchRate: number | null;
  matchCount: number;
  matchEligibleCount: number;
  valueOrderReversalRate: number | null;
  valueOrderEligibleCount: number;
  valueOrderExcludedCount: number;
  valueOrderPull: 'toward first-listed' | 'toward second-listed' | 'no clear pull';
  scaleOrderReversalRate: number | null;
  scaleOrderEligibleCount: number;
  scaleOrderExcludedCount: number;
  scaleOrderPull: 'toward higher numbers' | 'toward lower numbers' | 'no clear pull';
  withinCellDisagreementRate: number | null;
  pairLevelMarginSummary: PairLevelMarginSummary | null;
};

type OrderInvarianceReviewStatus = 'APPROVED' | 'REJECTED' | 'PENDING';

type OrderInvarianceReviewSummary = {
  totalVignettes: number;
  reviewedVignettes: number;
  approvedVignettes: number;
  rejectedVignettes: number;
  pendingVignettes: number;
  launchReady: boolean;
};

type OrderInvarianceReviewVignette = {
  pairId: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  variantType: string | null;
  conditionPairCount: number;
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
  vignettes: OrderInvarianceReviewVignette[];
};

type OrderInvarianceLaunchRun = {
  runId: string;
  status: string;
  targetedTrials: number;
  completedTrials: number;
  failedTrials: number;
  percentComplete: number;
  startedAt: Date | null;
  completedAt: Date | null;
  isStalled: boolean;
};

type OrderInvarianceLaunchStatus = {
  generatedAt: Date;
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
  targetedTrials: number;
  completedTrials: number;
  failedTrials: number;
  percentComplete: number;
  isComplete: boolean;
  runs: OrderInvarianceLaunchRun[];
  stalledModels: string[];
  failureSummaries: string[];
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
  variantType: string | null;
  equivalenceReviewStatus?: string | null;
  equivalenceReviewedBy?: string | null;
  equivalenceReviewedAt?: Date | null;
  equivalenceReviewNotes?: string | null;
  sourceScenario: PairScenario;
  variantScenario: PairScenario;
};

type TranscriptDetailRecord = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: Date;
  lastAccessedAt: Date | null;
  run: {
    deletedAt: Date | null;
    config: unknown;
    tags: Array<{ tag: { name: string } }>;
  };
};

const ORDER_INVARIANCE_KEY = 'order_invariance';
const BASELINE_ASSUMPTION_KEYS = new Set(['temp_zero_determinism', ORDER_INVARIANCE_KEY]);
const ACTIVE_RUN_STATUSES = new Set(['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING']);

function getRunAssumptionKey(config: unknown): string | null {
  if (config == null || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value !== '' ? value : null;
}

function isAssumptionRun(record: { run: { tags: Array<{ tag: { name: string } }> } }): boolean {
  return record.run.tags.some((tag) => tag.tag.name === 'assumption-run');
}

function isTempZeroRun(record: { run: { config: unknown } }): boolean {
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

function parseReviewGroupKey(groupKey: string): { definitionId: string; variantType: string | null } {
  const parts = groupKey.split('::');
  const definitionId = parts[0] ?? '';
  const variantType = parts[1] === '' || parts[1] == null ? null : parts[1];
  return { definitionId, variantType };
}

function parseProgress(progress: unknown): { total: number; completed: number; failed: number } {
  if (progress == null || typeof progress !== 'object' || Array.isArray(progress)) {
    return { total: 0, completed: 0, failed: 0 };
  }

  const candidate = progress as Record<string, unknown>;
  const total = typeof candidate.total === 'number' && Number.isFinite(candidate.total) ? candidate.total : 0;
  const completed = typeof candidate.completed === 'number' && Number.isFinite(candidate.completed) ? candidate.completed : 0;
  const failed = typeof candidate.failed === 'number' && Number.isFinite(candidate.failed) ? candidate.failed : 0;

  return { total, completed, failed };
}
function normalizeReviewStatus(status: string | null | undefined): OrderInvarianceReviewStatus {
  if (status === 'APPROVED' || status === 'REJECTED') {
    return status;
  }
  return 'PENDING';
}

function extractScenarioText(content: unknown): string {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) {
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
        followup != null && typeof followup === 'object'
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

function parseAttributeLabels(vignetteTitle: string): { attributeALabel: string | null; attributeBLabel: string | null } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeALabel: null, attributeBLabel: null };
  }

  return {
    attributeALabel: match[1]?.trim() ?? null,
    attributeBLabel: match[2]?.trim() ?? null,
  };
}

function parseConditionLevels(conditionKey: string): { attributeALevel: number | null; attributeBLevel: number | null } {
  const match = conditionKey.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { attributeALevel: null, attributeBLevel: null };
  }

  const attributeALevel = Number.parseInt(match[1] ?? '', 10);
  const attributeBLevel = Number.parseInt(match[2] ?? '', 10);

  return {
    attributeALevel: Number.isFinite(attributeALevel) ? attributeALevel : null,
    attributeBLevel: Number.isFinite(attributeBLevel) ? attributeBLevel : null,
  };
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
      presentationEffectMAD: t.exposeFloat('presentationEffectMAD', { nullable: true }),
      scaleEffectMAD: t.exposeFloat('scaleEffectMAD', { nullable: true }),
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
      variantType: t.exposeString('variantType', { nullable: true }),
      majorityVoteBaseline: t.exposeInt('majorityVoteBaseline', { nullable: true }),
      majorityVoteFlipped: t.exposeInt('majorityVoteFlipped', { nullable: true }),
      mismatchType: t.exposeString('mismatchType', { nullable: true }),
      ordinalDistance: t.exposeInt('ordinalDistance', { nullable: true }),
      isMatch: t.exposeBoolean('isMatch', { nullable: true }),
    }),
  });

const PairLevelMarginSummaryRef = builder
  .objectRef<PairLevelMarginSummary>('PairLevelMarginSummary')
  .implement({
    fields: (t) => ({
      mean: t.exposeFloat('mean', { nullable: true }),
      median: t.exposeFloat('median', { nullable: true }),
      p25: t.exposeFloat('p25', { nullable: true }),
      p75: t.exposeFloat('p75', { nullable: true }),
    }),
  });

const OrderInvarianceModelMetricsRef = builder
  .objectRef<OrderInvarianceModelMetrics>('OrderInvarianceModelMetrics')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      modelLabel: t.exposeString('modelLabel'),
      matchRate: t.exposeFloat('matchRate', { nullable: true }),
      matchCount: t.exposeInt('matchCount'),
      matchEligibleCount: t.exposeInt('matchEligibleCount'),
      valueOrderReversalRate: t.exposeFloat('valueOrderReversalRate', { nullable: true }),
      valueOrderEligibleCount: t.exposeInt('valueOrderEligibleCount'),
      valueOrderExcludedCount: t.exposeInt('valueOrderExcludedCount'),
      valueOrderPull: t.exposeString('valueOrderPull'),
      scaleOrderReversalRate: t.exposeFloat('scaleOrderReversalRate', { nullable: true }),
      scaleOrderEligibleCount: t.exposeInt('scaleOrderEligibleCount'),
      scaleOrderExcludedCount: t.exposeInt('scaleOrderExcludedCount'),
      scaleOrderPull: t.exposeString('scaleOrderPull'),
      withinCellDisagreementRate: t.exposeFloat('withinCellDisagreementRate', { nullable: true }),
      pairLevelMarginSummary: t.expose('pairLevelMarginSummary', {
        type: PairLevelMarginSummaryRef,
        nullable: true,
      }),
    }),
  });

const OrderInvarianceResultRef = builder
  .objectRef<OrderInvarianceResult>('OrderInvarianceResult')
  .implement({
    fields: (t) => ({
      generatedAt: t.expose('generatedAt', { type: 'DateTime' }),
      summary: t.expose('summary', { type: OrderInvarianceSummaryRef }),
      modelMetrics: t.expose('modelMetrics', { type: [OrderInvarianceModelMetricsRef] }),
      rows: t.expose('rows', { type: [OrderInvarianceRowRef] }),
    }),
  });

const OrderInvarianceTranscriptRef = builder
  .objectRef<OrderInvarianceTranscript>('OrderInvarianceTranscript')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      runId: t.exposeID('runId'),
      scenarioId: t.exposeID('scenarioId'),
      modelId: t.exposeString('modelId'),
      modelVersion: t.exposeString('modelVersion', { nullable: true }),
      content: t.expose('content', { type: 'JSON', nullable: true }),
      decisionCode: t.exposeString('decisionCode', { nullable: true }),
      decisionCodeSource: t.exposeString('decisionCodeSource', { nullable: true }),
      turnCount: t.exposeInt('turnCount'),
      tokenCount: t.exposeInt('tokenCount'),
      durationMs: t.exposeInt('durationMs'),
      estimatedCost: t.exposeFloat('estimatedCost', { nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      lastAccessedAt: t.expose('lastAccessedAt', { type: 'DateTime', nullable: true }),
      orderLabel: t.exposeString('orderLabel'),
      attributeALevel: t.exposeInt('attributeALevel', { nullable: true }),
      attributeBLevel: t.exposeInt('attributeBLevel', { nullable: true }),
    }),
  });

const OrderInvarianceTranscriptResultRef = builder
  .objectRef<OrderInvarianceTranscriptResult>('OrderInvarianceTranscriptResult')
  .implement({
    fields: (t) => ({
      generatedAt: t.expose('generatedAt', { type: 'DateTime' }),
      vignetteId: t.exposeID('vignetteId'),
      vignetteTitle: t.exposeString('vignetteTitle'),
      modelId: t.exposeString('modelId'),
      modelLabel: t.exposeString('modelLabel'),
      conditionKey: t.exposeString('conditionKey'),
      attributeALabel: t.exposeString('attributeALabel', { nullable: true }),
      attributeBLabel: t.exposeString('attributeBLabel', { nullable: true }),
      transcripts: t.expose('transcripts', { type: [OrderInvarianceTranscriptRef] }),
    }),
  });

const OrderInvarianceReviewSummaryRef = builder
  .objectRef<OrderInvarianceReviewSummary>('OrderInvarianceReviewSummary')
  .implement({
    fields: (t) => ({
      totalVignettes: t.exposeInt('totalVignettes'),
      reviewedVignettes: t.exposeInt('reviewedVignettes'),
      approvedVignettes: t.exposeInt('approvedVignettes'),
      rejectedVignettes: t.exposeInt('rejectedVignettes'),
      pendingVignettes: t.exposeInt('pendingVignettes'),
      launchReady: t.exposeBoolean('launchReady'),
    }),
  });

const OrderInvarianceReviewVignetteRef = builder
  .objectRef<OrderInvarianceReviewVignette>('OrderInvarianceReviewVignette')
  .implement({
    fields: (t) => ({
      pairId: t.exposeID('pairId'),
      vignetteId: t.exposeID('vignetteId'),
      vignetteTitle: t.exposeString('vignetteTitle'),
      conditionKey: t.exposeString('conditionKey'),
      variantType: t.exposeString('variantType', { nullable: true }),
      conditionPairCount: t.exposeInt('conditionPairCount'),
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
      vignettes: t.expose('vignettes', { type: [OrderInvarianceReviewVignetteRef] }),
    }),
  });

const OrderInvarianceLaunchRunRef = builder
  .objectRef<OrderInvarianceLaunchRun>('OrderInvarianceLaunchRun')
  .implement({
    fields: (t) => ({
      runId: t.exposeID('runId'),
      status: t.exposeString('status'),
      targetedTrials: t.exposeInt('targetedTrials'),
      completedTrials: t.exposeInt('completedTrials'),
      failedTrials: t.exposeInt('failedTrials'),
      percentComplete: t.exposeFloat('percentComplete'),
      startedAt: t.expose('startedAt', { type: 'DateTime', nullable: true }),
      completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
      isStalled: t.exposeBoolean('isStalled'),
    }),
  });

const OrderInvarianceLaunchStatusRef = builder
  .objectRef<OrderInvarianceLaunchStatus>('OrderInvarianceLaunchStatus')
  .implement({
    fields: (t) => ({
      generatedAt: t.expose('generatedAt', { type: 'DateTime' }),
      totalRuns: t.exposeInt('totalRuns'),
      activeRuns: t.exposeInt('activeRuns'),
      completedRuns: t.exposeInt('completedRuns'),
      failedRuns: t.exposeInt('failedRuns'),
      targetedTrials: t.exposeInt('targetedTrials'),
      completedTrials: t.exposeInt('completedTrials'),
      failedTrials: t.exposeInt('failedTrials'),
      percentComplete: t.exposeFloat('percentComplete'),
      isComplete: t.exposeBoolean('isComplete'),
      runs: t.expose('runs', { type: [OrderInvarianceLaunchRunRef] }),
      stalledModels: t.exposeStringList('stalledModels'),
      failureSummaries: t.exposeStringList('failureSummaries'),
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
        select: {
          id: true,
          variantType: true,
          equivalenceReviewStatus: true,
          equivalenceReviewedBy: true,
          equivalenceReviewedAt: true,
          equivalenceReviewNotes: true,
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

      const expectedSourceScenarios = await db.scenario.findMany({
        where: {
          definitionId: { in: Array.from(lockedById.keys()) },
          deletedAt: null,
          orientationFlipped: false,
        },
        select: {
          id: true,
          definitionId: true,
        },
      });
      const expectedPairCount = expectedSourceScenarios.length * 3;
      const expectedDefinitionIds = new Set(expectedSourceScenarios.map((scenario) => scenario.definitionId));

      const groupedPairs = new Map<string, PairRecord[]>();

      for (const pair of pairRows) {
        const key = `${pair.sourceScenario.definitionId}::${pair.variantType ?? ''}`;
        const existing = groupedPairs.get(key) ?? [];
        existing.push(pair);
        groupedPairs.set(key, existing);
      }

      const vignettes: OrderInvarianceReviewVignette[] = Array.from(groupedPairs.entries()).map(([groupKey, definitionPairs]) => {
        const { definitionId, variantType } = parseReviewGroupKey(groupKey);
        const sortedPairs = [...definitionPairs].sort((left, right) => (
          buildConditionKey(left.sourceScenario.name).localeCompare(
            buildConditionKey(right.sourceScenario.name),
            undefined,
            { numeric: true, sensitivity: 'base' }
          )
          || left.sourceScenario.name.localeCompare(right.sourceScenario.name)
        ));
        const representativePair = sortedPairs[0];
        const vignette = lockedById.get(definitionId);
        const pairStatuses = sortedPairs.map((pair) => normalizeReviewStatus(pair.equivalenceReviewStatus));
        const reviewStatus: OrderInvarianceReviewStatus = pairStatuses.some((status) => status === 'REJECTED')
          ? 'REJECTED'
          : pairStatuses.every((status) => status === 'APPROVED')
            ? 'APPROVED'
            : 'PENDING';
        const reviewedPair = [...sortedPairs]
          .filter((pair) => pair.equivalenceReviewedAt != null)
          .sort((left, right) => (
            (right.equivalenceReviewedAt?.getTime() ?? 0) - (left.equivalenceReviewedAt?.getTime() ?? 0)
          ))[0] ?? null;

        return {
          pairId: representativePair?.id ?? `${representativePair?.sourceScenario.id}:${representativePair?.variantScenario.id}`,
          vignetteId: definitionId,
          vignetteTitle: vignette?.title ?? definitionId,
          conditionKey: representativePair ? buildConditionKey(representativePair.sourceScenario.name) : 'n/a',
          variantType: variantType === '' ? null : variantType,
          conditionPairCount: sortedPairs.length,
          sourceScenarioId: representativePair?.sourceScenario.id ?? '',
          variantScenarioId: representativePair?.variantScenario.id ?? '',
          baselineName: representativePair?.sourceScenario.name ?? '',
          flippedName: representativePair?.variantScenario.name ?? '',
          baselineText: representativePair ? extractScenarioText(representativePair.sourceScenario.content) : '',
          flippedText: representativePair ? extractScenarioText(representativePair.variantScenario.content) : '',
          reviewStatus,
          reviewedBy: reviewedPair?.equivalenceReviewedBy ?? null,
          reviewedAt: reviewedPair?.equivalenceReviewedAt ?? null,
          reviewNotes: reviewedPair?.equivalenceReviewNotes ?? null,
        };
      }).sort((left, right) => (
        left.vignetteTitle.localeCompare(right.vignetteTitle)
      ));

      const approvedVignettes = vignettes.filter((vignette) => vignette.reviewStatus === 'APPROVED').length;
      const rejectedVignettes = vignettes.filter((vignette) => vignette.reviewStatus === 'REJECTED').length;
      const reviewedVignettes = vignettes.filter((vignette) => vignette.reviewedAt != null).length;
      const totalVignettes = vignettes.length;
      const expectedGroupCount = lockedById.size * 3;
      const hasCompleteGeneratedSet = pairRows.length === expectedPairCount
        && totalVignettes === expectedGroupCount
        && expectedDefinitionIds.size === lockedById.size
        && Array.from(groupedPairs.entries()).every(([groupKey, definitionPairs]) => {
          const { definitionId } = parseReviewGroupKey(groupKey);
          return definitionPairs.length === expectedSourceScenarios.filter((scenario) => scenario.definitionId === definitionId).length;
        }
        );

      return {
        generatedAt: new Date(),
        summary: {
          totalVignettes,
          reviewedVignettes,
          approvedVignettes,
          rejectedVignettes,
          pendingVignettes: totalVignettes - reviewedVignettes,
          launchReady: hasCompleteGeneratedSet
            && totalVignettes > 0
            && approvedVignettes === totalVignettes,
        },
        vignettes,
      };
    },
  })
);

builder.queryField('assumptionsOrderInvarianceLaunchStatus', (t) =>
  t.field({
    type: OrderInvarianceLaunchStatusRef,
    args: {
      runIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runIds = Array.from(new Set(args.runIds.filter((runId): runId is string => typeof runId === 'string' && runId !== '')));
      if (runIds.length === 0) {
        return {
          generatedAt: new Date(),
          totalRuns: 0,
          activeRuns: 0,
          completedRuns: 0,
          failedRuns: 0,
          targetedTrials: 0,
          completedTrials: 0,
          failedTrials: 0,
          percentComplete: 0,
          isComplete: true,
          runs: [],
          stalledModels: [],
          failureSummaries: [],
        };
      }

      const runRows = await db.run.findMany({
        where: {
          id: { in: runIds },
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          progress: true,
          startedAt: true,
          completedAt: true,
          config: true,
          updatedAt: true,
        },
      });

      const STALL_THRESHOLD_MS = 15 * 60 * 1000; // 15-min display heuristic (recovery.ts restarts at 5 min)
      const now = Date.now();

      const filteredRuns = runRows
        .filter((run) => getRunAssumptionKey(run.config) === ORDER_INVARIANCE_KEY)
        .map<OrderInvarianceLaunchRun>((run) => {
          const progress = parseProgress(run.progress);
          const resolvedTrials = progress.completed + progress.failed;
          return {
            runId: run.id,
            status: run.status,
            targetedTrials: progress.total,
            completedTrials: progress.completed,
            failedTrials: progress.failed,
            percentComplete: progress.total > 0 ? Math.min(100, (resolvedTrials / progress.total) * 100) : 0,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            isStalled: run.status === 'RUNNING' && (now - run.updatedAt.getTime()) > STALL_THRESHOLD_MS,
          };
        })
        .sort((left, right) => runIds.indexOf(left.runId) - runIds.indexOf(right.runId));

      const targetedTrials = filteredRuns.reduce((sum, run) => sum + run.targetedTrials, 0);
      const completedTrials = filteredRuns.reduce((sum, run) => sum + run.completedTrials, 0);
      const failedTrials = filteredRuns.reduce((sum, run) => sum + run.failedTrials, 0);
      const activeRuns = filteredRuns.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).length;
      const completedRuns = filteredRuns.filter((run) => run.status === 'COMPLETED').length;
      const failedRuns = filteredRuns.filter((run) => run.status === 'FAILED').length;
      const resolvedTrials = completedTrials + failedTrials;

      const stalledRunIds = filteredRuns.filter((run) => run.isStalled).map((run) => run.runId);
      let stalledModels: string[] = [];
      if (stalledRunIds.length > 0) {
        const stalledProbeRows = await db.probeResult.findMany({
          where: { runId: { in: stalledRunIds } },
          select: { modelId: true },
        });
        const stalledModelIdSet = new Set(stalledProbeRows.map((probeRow) => probeRow.modelId));
        if (stalledModelIdSet.size > 0) {
          const modelRows = await db.llmModel.findMany({
            where: { modelId: { in: Array.from(stalledModelIdSet) } },
            select: { modelId: true, displayName: true },
          });
          const modelMap = new Map(modelRows.map((modelRow) => [modelRow.modelId, modelRow.displayName]));
          stalledModels = Array.from(stalledModelIdSet).map((modelId) => modelMap.get(modelId) ?? modelId);
        }
      }

      const filteredRunIds = filteredRuns.map((run) => run.runId);
      const failedProbeRows = filteredRunIds.length > 0
        ? await db.probeResult.findMany({
            where: { runId: { in: filteredRunIds }, status: 'FAILED' },
            select: { errorMessage: true },
          })
        : [];
      const failureSummaries = Array.from(
        new Set(
          failedProbeRows
            .map((probeRow) => probeRow.errorMessage)
            .filter((message): message is string => message !== null && message !== '')
        )
      );

      return {
        generatedAt: new Date(),
        totalRuns: filteredRuns.length,
        activeRuns,
        completedRuns,
        failedRuns,
        targetedTrials,
        completedTrials,
        failedTrials,
        percentComplete: targetedTrials > 0 ? Math.min(100, (resolvedTrials / targetedTrials) * 100) : 0,
        isComplete: filteredRuns.length > 0 && activeRuns === 0,
        runs: filteredRuns,
        stalledModels,
        failureSummaries,
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
      return getOrderInvarianceAnalysisResult({ directionOnly, trimOutliers });
    },
  })
);

builder.queryField('assumptionsOrderInvarianceTranscripts', (t) =>
  t.field({
    type: OrderInvarianceTranscriptResultRef,
    args: {
      vignetteId: t.arg.id({ required: true }),
      modelId: t.arg.string({ required: true }),
      conditionKey: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const vignetteId = String(args.vignetteId);
      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, displayName: true },
      });
      const activeModelLabels = new Map(
        activeModels.map((model) => [model.modelId, model.displayName])
      );

      const lockedById = new Map(
        LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => [vignette.id, vignette])
      );
      const vignetteTitle = lockedById.get(vignetteId)?.title ?? vignetteId;
      const labels = parseAttributeLabels(vignetteTitle);
      const levels = parseConditionLevels(args.conditionKey);

      const pairs = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: ORDER_INVARIANCE_KEY,
          equivalenceReviewStatus: 'APPROVED',
          equivalenceReviewedAt: { not: null },
          sourceScenario: {
            definitionId: vignetteId,
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
      }) as unknown as PairRecord[];

      const matchingPair = pairs.find((candidate) => buildConditionKey(candidate.sourceScenario.name) === args.conditionKey) ?? null;

      if (matchingPair == null) {
        return {
          generatedAt: new Date(),
          vignetteId,
          vignetteTitle,
          modelId: args.modelId,
          modelLabel: args.modelId,
          conditionKey: args.conditionKey,
          attributeALabel: labels.attributeALabel,
          attributeBLabel: labels.attributeBLabel,
          transcripts: [],
        };
      }

      const scenarioIds = [matchingPair.sourceScenario.id, matchingPair.variantScenario.id];
      const transcriptRecords = await db.transcript.findMany({
        where: {
          deletedAt: null,
          scenarioId: { in: scenarioIds },
          modelId: args.modelId,
        },
        select: {
          id: true,
          runId: true,
          scenarioId: true,
          modelId: true,
          modelVersion: true,
          content: true,
          decisionCode: true,
          decisionCodeSource: true,
          turnCount: true,
          tokenCount: true,
          durationMs: true,
          estimatedCost: true,
          createdAt: true,
          lastAccessedAt: true,
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
      }) as TranscriptDetailRecord[];

      const transcripts = transcriptRecords
        .filter((transcript) => {
          if (transcript.scenarioId == null || transcript.run.deletedAt != null) {
            return false;
          }
          if (!isTempZeroRun(transcript)) {
            return false;
          }

          const assumptionKey = getRunAssumptionKey(transcript.run.config);
          const isBaselineScenario = transcript.scenarioId === matchingPair.sourceScenario.id;
          if (isBaselineScenario) {
            if (assumptionKey == null || !BASELINE_ASSUMPTION_KEYS.has(assumptionKey)) {
              return false;
            }
            if (assumptionKey !== 'temp_zero_determinism' && !isAssumptionRun(transcript)) {
              return false;
            }
          } else if (assumptionKey !== ORDER_INVARIANCE_KEY || !isAssumptionRun(transcript)) {
            return false;
          }

          return true;
        })
        .map((transcript) => ({
          id: transcript.id,
          runId: transcript.runId,
          scenarioId: transcript.scenarioId ?? '',
          modelId: transcript.modelId,
          modelVersion: transcript.modelVersion,
          content: transcript.content,
          decisionCode: transcript.decisionCode,
          decisionCodeSource: transcript.decisionCodeSource,
          turnCount: transcript.turnCount,
          tokenCount: transcript.tokenCount,
          durationMs: transcript.durationMs,
          estimatedCost: transcript.estimatedCost,
          createdAt: transcript.createdAt,
          lastAccessedAt: transcript.lastAccessedAt,
          orderLabel: transcript.scenarioId === matchingPair.sourceScenario.id ? 'A First' : 'B First',
          attributeALevel: levels.attributeALevel,
          attributeBLevel: levels.attributeBLevel,
        }))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

      return {
        generatedAt: new Date(),
        vignetteId,
        vignetteTitle,
        modelId: args.modelId,
        modelLabel: activeModelLabels.get(args.modelId) ?? args.modelId,
        conditionKey: args.conditionKey,
        attributeALabel: labels.attributeALabel,
        attributeBLabel: labels.attributeBLabel,
        transcripts,
      };
    },
  })
);
