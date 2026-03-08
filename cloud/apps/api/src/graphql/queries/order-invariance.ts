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
  rawScore: number | null;
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
  rows: OrderInvarianceRow[];
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

type CandidateTranscript = {
  id: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  decision: number;
  rawDecision: number;
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
const ACTIVE_RUN_STATUSES = new Set(['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING']);

function getRunAssumptionKey(config: unknown): string | null {
  if (config == null || typeof config !== 'object') {
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

function parseReviewGroupKey(groupKey: string): { definitionId: string; variantType: string | null } {
  const parts = groupKey.split('::');
  const definitionId = parts[0] ?? '';
  const variantType = parts[1] === '' || parts[1] == null ? null : parts[1];
  return { definitionId, variantType };
}

function parseDecision(decisionCode: string | null): number | null {
  if (decisionCode == null || !VALID_DECISIONS.has(decisionCode)) {
    return null;
  }
  return Number(decisionCode);
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
export function normalizeDecision(decision: number, variantType: string | null): number {
  return (variantType === 'scale_flipped' || variantType === 'fully_flipped')
    ? 6 - decision
    : decision;
}

export function computeMADMetrics(scorePivot: Map<string, Record<string, number>>): {
  presentationEffectMAD: number | null;
  scaleEffectMAD: number | null;
} {
  let pMADSum = 0, pMADCount = 0, sMADSum = 0, sMADCount = 0;
  for (const s of scorePivot.values()) {
    if (s['baseline'] != null && s['presentation_flipped'] != null) {
      pMADSum += Math.abs(s['baseline'] - s['presentation_flipped']); pMADCount++;
    }
    if (s['baseline'] != null && s['scale_flipped'] != null) {
      sMADSum += Math.abs(s['baseline'] - s['scale_flipped']); sMADCount++;
    }
    if (s['scale_flipped'] != null && s['fully_flipped'] != null) {
      pMADSum += Math.abs(s['scale_flipped'] - s['fully_flipped']); pMADCount++;
    }
    if (s['presentation_flipped'] != null && s['fully_flipped'] != null) {
      sMADSum += Math.abs(s['presentation_flipped'] - s['fully_flipped']); sMADCount++;
    }
  }
  return {
    presentationEffectMAD: pMADCount > 0 ? pMADSum / pMADCount : null,
    scaleEffectMAD: sMADCount > 0 ? sMADSum / sMADCount : null,
  };
}

export function getScaleEffectStatus(deltaS: number | null): 'NORMAL' | 'WARNING' | 'SEVERE' | 'UNKNOWN' {
  if (deltaS == null) return 'UNKNOWN';
  if (deltaS > 1.00) return 'SEVERE';
  if (deltaS > 0.50) return 'WARNING';
  return 'NORMAL';
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
      rawScore: t.exposeInt('rawScore', { nullable: true }),
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

      const pairRows = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: ORDER_INVARIANCE_KEY,
          equivalenceReviewStatus: 'APPROVED',
          equivalenceReviewedAt: { not: null },
        },
        select: {
          variantType: true,
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
      const activeModelLabels = new Map(
        activeModels.map((model) => [model.modelId, model.displayName])
      );

      const allScenarioIds = Array.from(new Set(
        relevantPairs.flatMap((pair) => [pair.sourceScenario.id, pair.variantScenario.id])
      ));
      const scenarioIdToVariantType = new Map<string, string | null>();
      for (const pair of pairRows) {
        scenarioIdToVariantType.set(pair.sourceScenario.id, null);
        scenarioIdToVariantType.set(pair.variantScenario.id, pair.variantType);
      }

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
          decision: normalizeDecision(
            decision,
            scenarioIdToVariantType.get(transcript.scenarioId) ?? null
          ),
          rawDecision: decision,
          createdAt: transcript.createdAt,
        };

        if (existing != null) {
          existing.push(candidate);
        } else {
          transcriptsByScenarioAndModel.set(key, [candidate]);
        }
      }

      const effectiveModels = Array.from(inferredModels.keys())
        .sort()
        .map((modelId) => ({
          modelId,
          modelLabel: activeModelLabels.get(modelId) ?? modelId,
        }));

      const excludedCounts = new Map<string, number>();
      const rows: OrderInvarianceRow[] = [];
      let qualifyingPairs = 0;
      let missingPairs = 0;
      let comparablePairs = 0;
      let directionMatchCount = 0;
      let exactMatchCount = 0;
      const scorePivot = new Map<string, Record<string, number>>();

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
              variantType: pair.variantType,
              majorityVoteBaseline: null,
              majorityVoteFlipped: null,
              rawScore: null,
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
          const rawFlippedValue = computeMajorityVote(
            flippedPick.selected.map((transcript) => transcript.rawDecision),
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
              variantType: pair.variantType,
              majorityVoteBaseline: baselineValue,
              majorityVoteFlipped: flippedValue,
              rawScore: rawFlippedValue ?? null,
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
          const pivotKey = `${pair.sourceScenario.definitionId}::${conditionKey}::${model.modelId}`;
          const scores = scorePivot.get(pivotKey) ?? {};
          if (baselineValue != null) {
            scores.baseline = baselineValue;
          }
          if (flippedValue != null && pair.variantType) {
            scores[pair.variantType] = flippedValue;
          }
          scorePivot.set(pivotKey, scores);

          rows.push({
            modelId: model.modelId,
            modelLabel: model.modelLabel,
            vignetteId: pair.sourceScenario.definitionId,
            vignetteTitle,
            conditionKey,
            variantType: pair.variantType,
            majorityVoteBaseline: baselineValue,
            majorityVoteFlipped: flippedValue,
            rawScore: rawFlippedValue ?? null,
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
      const { presentationEffectMAD, scaleEffectMAD } = computeMADMetrics(scorePivot);

      const summary: OrderInvarianceSummary = {
        status: comparablePairs === 0 ? 'INSUFFICIENT_DATA' : 'COMPUTED',
        matchRate: comparablePairs > 0
          ? (directionOnly ? directionMatchCount : exactMatchCount) / comparablePairs
          : null,
        exactMatchRate: comparablePairs > 0 ? exactMatchCount / comparablePairs : null,
        presentationEffectMAD,
        scaleEffectMAD,
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
