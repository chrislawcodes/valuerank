import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { estimateCost as estimateCostService } from '../../services/cost/estimate.js';
import { parseTemperature } from '../../utils/temperature.js';
import { formatVnewSignature } from '../../utils/vnew-signature.js';

type AssumptionStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';
type TempZeroMismatchType = 'decision_flip' | 'missing_trial' | null;

type LockedVignette = {
  id: string;
  title: string;
  rationale: string;
};

type TempZeroPreflightVignette = {
  vignetteId: string;
  title: string;
  conditionCount: number;
  rationale: string;
};

type TempZeroPreflight = {
  title: string;
  projectedPromptCount: number;
  projectedComparisons: number;
  estimatedInputTokens: number | null;
  estimatedOutputTokens: number | null;
  estimatedCostUsd: number | null;
  selectedSignature: string | null;
  vignettes: TempZeroPreflightVignette[];
};

type TempZeroSummary = {
  title: string;
  status: AssumptionStatus;
  matchRate: number | null;
  differenceRate: number | null;
  comparisons: number;
  excludedComparisons: number;
  modelsTested: number;
  vignettesTested: number;
  worstModelId: string | null;
  worstModelMatchRate: number | null;
};

type TempZeroDecision = {
  label: string;
  transcriptId: string | null;
  decision: string | null;
  content: unknown | null;
};

type TempZeroRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  batch1: string | null;
  batch2: string | null;
  batch3: string | null;
  isMatch: boolean;
  mismatchType: TempZeroMismatchType;
  decisions: TempZeroDecision[];
};

type AssumptionsTempZeroResult = {
  domainName: string;
  note: string | null;
  preflight: TempZeroPreflight;
  summary: TempZeroSummary;
  rows: TempZeroRow[];
  generatedAt: Date;
};

type ScenarioRecord = {
  id: string;
  definitionId: string;
  name: string;
  content: unknown;
};

type TranscriptRecord = {
  id: string;
  scenarioId: string | null;
  modelId: string;
  decisionCode: string | null;
  content: unknown;
  createdAt: Date;
};

const LOCKED_VIGNETTES: readonly LockedVignette[] = [
  {
    id: 'cmlsmyn9l0j3rxeiricruouia',
    title: 'Jobs (Self Direction Action vs Power Dominance)',
    rationale: 'Covers autonomy vs hierarchy in a clean professional tradeoff.',
  },
  {
    id: 'cmlsn0pnr0jg1xeir147758pr',
    title: 'Jobs (Security Personal vs Conformity Interpersonal)',
    rationale: 'Covers stability vs social-pressure alignment without overlapping values.',
  },
  {
    id: 'cmlsn216u0jpfxeirpdbrm9so',
    title: 'Jobs (Tradition vs Stimulation)',
    rationale: 'Covers heritage vs novelty with highly legible role framing.',
  },
  {
    id: 'cmlsn2tca0jvxxeir5r0i5civ',
    title: 'Jobs (Benevolence Dependability vs Universalism Nature)',
    rationale: 'Covers responsibility to others vs nature protection with distinct moral texture.',
  },
  {
    id: 'cmlsn384i0jzjxeir9or2w35z',
    title: 'Jobs (Achievement vs Hedonism)',
    rationale: 'Covers achievement vs enjoyment and rounds out the 10-value package.',
  },
] as const;

const VALID_DECISIONS = ['1', '2', '3', '4', '5'] as const;

function selectDefaultSignature(completedRuns: Array<{ config: unknown }>): string | null {
  if (completedRuns.length === 0) return null;

  const temperatureCounts = new Map<string, { temperature: number | null; count: number }>();
  for (const run of completedRuns) {
    const runConfig = run.config as { temperature?: unknown } | null;
    const temperature = parseTemperature(runConfig?.temperature);
    const key = temperature === null ? 'd' : String(temperature);
    const current = temperatureCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      temperatureCounts.set(key, { temperature, count: 1 });
    }
  }

  const winner = Array.from(temperatureCounts.values())
    .sort((left, right) => {
      const leftIsZero = left.temperature === 0;
      const rightIsZero = right.temperature === 0;
      if (leftIsZero !== rightIsZero) return leftIsZero ? -1 : 1;
      if (left.count !== right.count) return right.count - left.count;
      if (left.temperature === null) return 1;
      if (right.temperature === null) return -1;
      return left.temperature - right.temperature;
    })[0];

  return winner ? formatVnewSignature(winner.temperature) : null;
}

function signatureMatches(runConfig: unknown, signature: string | null): boolean {
  if (signature === null) return true;
  const runTemperature = parseTemperature((runConfig as { temperature?: unknown } | null)?.temperature);
  const signatureTemperature = signature === 'vnewtd' ? null : parseTemperature(signature.replace(/^vnewt/, ''));
  return runTemperature === signatureTemperature;
}

function buildConditionKey(scenario: ScenarioRecord): string {
  const match = scenario.name.match(/_(\d+)\s*\/.*_(\d+)$/);
  if (!match) return scenario.name;
  return `${match[1] ?? '?'}x${match[2] ?? '?'}`;
}

const TempZeroPreflightVignetteRef = builder.objectRef<TempZeroPreflightVignette>('TempZeroPreflightVignette');
const TempZeroPreflightRef = builder.objectRef<TempZeroPreflight>('TempZeroPreflight');
const TempZeroSummaryRef = builder.objectRef<TempZeroSummary>('TempZeroSummary');
const TempZeroDecisionRef = builder.objectRef<TempZeroDecision>('TempZeroDecision');
const TempZeroRowRef = builder.objectRef<TempZeroRow>('TempZeroRow');
const AssumptionsTempZeroResultRef = builder.objectRef<AssumptionsTempZeroResult>('AssumptionsTempZeroResult');

builder.objectType(TempZeroPreflightVignetteRef, {
  fields: (t) => ({
    vignetteId: t.exposeID('vignetteId'),
    title: t.exposeString('title'),
    conditionCount: t.exposeInt('conditionCount'),
    rationale: t.exposeString('rationale'),
  }),
});

builder.objectType(TempZeroPreflightRef, {
  fields: (t) => ({
    title: t.exposeString('title'),
    projectedPromptCount: t.exposeInt('projectedPromptCount'),
    projectedComparisons: t.exposeInt('projectedComparisons'),
    estimatedInputTokens: t.exposeInt('estimatedInputTokens', { nullable: true }),
    estimatedOutputTokens: t.exposeInt('estimatedOutputTokens', { nullable: true }),
    estimatedCostUsd: t.exposeFloat('estimatedCostUsd', { nullable: true }),
    selectedSignature: t.exposeString('selectedSignature', { nullable: true }),
    vignettes: t.field({
      type: [TempZeroPreflightVignetteRef],
      resolve: (parent) => parent.vignettes,
    }),
  }),
});

builder.objectType(TempZeroSummaryRef, {
  fields: (t) => ({
    title: t.exposeString('title'),
    status: t.exposeString('status'),
    matchRate: t.exposeFloat('matchRate', { nullable: true }),
    differenceRate: t.exposeFloat('differenceRate', { nullable: true }),
    comparisons: t.exposeInt('comparisons'),
    excludedComparisons: t.exposeInt('excludedComparisons'),
    modelsTested: t.exposeInt('modelsTested'),
    vignettesTested: t.exposeInt('vignettesTested'),
    worstModelId: t.exposeString('worstModelId', { nullable: true }),
    worstModelMatchRate: t.exposeFloat('worstModelMatchRate', { nullable: true }),
  }),
});

builder.objectType(TempZeroDecisionRef, {
  fields: (t) => ({
    label: t.exposeString('label'),
    transcriptId: t.exposeString('transcriptId', { nullable: true }),
    decision: t.exposeString('decision', { nullable: true }),
    content: t.expose('content', { type: 'JSON', nullable: true }),
  }),
});

builder.objectType(TempZeroRowRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    vignetteId: t.exposeID('vignetteId'),
    vignetteTitle: t.exposeString('vignetteTitle'),
    conditionKey: t.exposeString('conditionKey'),
    batch1: t.exposeString('batch1', { nullable: true }),
    batch2: t.exposeString('batch2', { nullable: true }),
    batch3: t.exposeString('batch3', { nullable: true }),
    isMatch: t.exposeBoolean('isMatch'),
    mismatchType: t.exposeString('mismatchType', { nullable: true }),
    decisions: t.field({
      type: [TempZeroDecisionRef],
      resolve: (parent) => parent.decisions,
    }),
  }),
});

builder.objectType(AssumptionsTempZeroResultRef, {
  fields: (t) => ({
    domainName: t.exposeString('domainName'),
    note: t.exposeString('note', { nullable: true }),
    preflight: t.field({
      type: TempZeroPreflightRef,
      resolve: (parent) => parent.preflight,
    }),
    summary: t.field({
      type: TempZeroSummaryRef,
      resolve: (parent) => parent.summary,
    }),
    rows: t.field({
      type: [TempZeroRowRef],
      resolve: (parent) => parent.rows,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
  }),
});

builder.queryField('assumptionsTempZero', (t) =>
  t.field({
    type: AssumptionsTempZeroResultRef,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domain = await db.domain.findFirst({
        where: { normalizedName: 'professional' },
        select: { id: true, name: true },
      });
      if (!domain) {
        throw new Error('Professional domain not found');
      }

      const selectedModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: {
          modelId: true,
          displayName: true,
          isDefault: true,
        },
        orderBy: { displayName: 'asc' },
      });
      const defaultModels = selectedModels.filter((model) => model.isDefault);
      const models = (defaultModels.length > 0 ? defaultModels : selectedModels).map((model) => ({
        modelId: model.modelId,
        label: model.displayName,
      }));

      const definitions = await db.definition.findMany({
        where: {
          id: { in: LOCKED_VIGNETTES.map((vignette) => vignette.id) },
          domainId: domain.id,
          deletedAt: null,
        },
        select: {
          id: true,
          scenarios: {
            where: { deletedAt: null },
            select: {
              id: true,
              definitionId: true,
              name: true,
              content: true,
            },
            orderBy: { name: 'asc' },
          },
        },
      });
      const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
      const availableVignettes = LOCKED_VIGNETTES.filter((vignette) => definitionById.has(vignette.id));

      let estimatedInputTokens = 0;
      let estimatedOutputTokens = 0;
      let estimatedCostUsd = 0;
      if (models.length > 0) {
        for (const vignette of availableVignettes) {
          const estimate = await estimateCostService({
            definitionId: vignette.id,
            modelIds: models.map((model) => model.modelId),
            samplePercentage: 100,
            samplesPerScenario: 3,
          });
          for (const perModel of estimate.perModel) {
            estimatedInputTokens += perModel.inputTokens;
            estimatedOutputTokens += perModel.outputTokens;
            estimatedCostUsd += perModel.totalCost;
          }
        }
      }

      const allDefinitionIds = availableVignettes.map((vignette) => vignette.id);
      const completedRuns = await db.run.findMany({
        where: {
          definitionId: { in: allDefinitionIds },
          status: 'COMPLETED',
          deletedAt: null,
        },
        orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          definitionId: true,
          config: true,
        },
      });
      const selectedSignature = selectDefaultSignature(completedRuns);
      const matchingRunIds = completedRuns
        .filter((run) => signatureMatches(run.config, selectedSignature))
        .map((run) => run.id);

      let transcriptGroups = new Map<string, TranscriptRecord[]>();
      if (matchingRunIds.length > 0 && models.length > 0) {
        const transcripts = await db.transcript.findMany({
          where: {
            runId: { in: matchingRunIds },
            modelId: { in: models.map((model) => model.modelId) },
            scenarioId: { not: null },
            deletedAt: null,
            decisionCode: { in: VALID_DECISIONS as unknown as string[] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            scenarioId: true,
            modelId: true,
            decisionCode: true,
            content: true,
            createdAt: true,
          },
        });

        transcriptGroups = new Map<string, TranscriptRecord[]>();
        for (const transcript of transcripts) {
          if (!transcript.scenarioId) continue;
          const key = `${transcript.modelId}::${transcript.scenarioId}`;
          const current = transcriptGroups.get(key) ?? [];
          current.push(transcript);
          transcriptGroups.set(key, current);
        }

        for (const [key, group] of transcriptGroups.entries()) {
          group.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
          transcriptGroups.set(key, group.slice(0, 3));
        }
      }

      const rows: TempZeroRow[] = [];
      const comparableByModel = new Map<string, { comparable: number; matched: number }>();

      for (const vignette of availableVignettes) {
        const scenarios = (definitionById.get(vignette.id)?.scenarios ?? []) as ScenarioRecord[];
        const sortedScenarios = [...scenarios].sort((left, right) => (
          buildConditionKey(left).localeCompare(buildConditionKey(right), undefined, { numeric: true })
        ));

        for (const model of models) {
          for (const scenario of sortedScenarios) {
            const group = transcriptGroups.get(`${model.modelId}::${scenario.id}`) ?? [];
            const batch1 = group[0]?.decisionCode ?? null;
            const batch2 = group[1]?.decisionCode ?? null;
            const batch3 = group[2]?.decisionCode ?? null;
            const comparable = group.length >= 3;
            const isMatch = comparable
              ? batch1 === batch2 && batch2 === batch3
              : false;
            const mismatchType: TempZeroMismatchType = comparable ? (isMatch ? null : 'decision_flip') : 'missing_trial';

            if (comparable) {
              const stats = comparableByModel.get(model.modelId) ?? { comparable: 0, matched: 0 };
              stats.comparable += 1;
              if (isMatch) stats.matched += 1;
              comparableByModel.set(model.modelId, stats);
            }

            rows.push({
              modelId: model.modelId,
              modelLabel: model.label,
              vignetteId: vignette.id,
              vignetteTitle: vignette.title,
              conditionKey: buildConditionKey(scenario),
              batch1,
              batch2,
              batch3,
              isMatch,
              mismatchType,
              decisions: [
                {
                  label: 'Batch 1',
                  transcriptId: group[0]?.id ?? null,
                  decision: batch1,
                  content: group[0]?.content ?? null,
                },
                {
                  label: 'Batch 2',
                  transcriptId: group[1]?.id ?? null,
                  decision: batch2,
                  content: group[1]?.content ?? null,
                },
                {
                  label: 'Batch 3',
                  transcriptId: group[2]?.id ?? null,
                  decision: batch3,
                  content: group[2]?.content ?? null,
                },
              ],
            });
          }
        }
      }

      const comparableRows = rows.filter((row) => row.mismatchType !== 'missing_trial');
      const matchedRows = comparableRows.filter((row) => row.isMatch);
      let worstModelId: string | null = null;
      let worstModelMatchRate: number | null = null;
      for (const [modelId, stats] of comparableByModel.entries()) {
        if (stats.comparable === 0) continue;
        const rate = stats.matched / stats.comparable;
        if (worstModelMatchRate === null || rate < worstModelMatchRate) {
          worstModelId = modelId;
          worstModelMatchRate = rate;
        }
      }

      const expectedComparisons = availableVignettes.length * 25 * models.length;
      const note = availableVignettes.length !== LOCKED_VIGNETTES.length
        ? `${LOCKED_VIGNETTES.length - availableVignettes.length} locked vignette${LOCKED_VIGNETTES.length - availableVignettes.length === 1 ? '' : 's'} are missing from the professional domain.`
        : null;

      return {
        domainName: domain.name,
        note,
        preflight: {
          title: 'Temp=0 Determinism Preflight',
          projectedPromptCount: expectedComparisons * 3,
          projectedComparisons: expectedComparisons,
          estimatedInputTokens: estimatedInputTokens > 0 ? estimatedInputTokens : null,
          estimatedOutputTokens: estimatedOutputTokens > 0 ? estimatedOutputTokens : null,
          estimatedCostUsd: estimatedCostUsd > 0 ? estimatedCostUsd : null,
          selectedSignature,
          vignettes: availableVignettes.map((vignette) => ({
            vignetteId: vignette.id,
            title: vignette.title,
            conditionCount: definitionById.get(vignette.id)?.scenarios.length ?? 0,
            rationale: vignette.rationale,
          })),
        },
        summary: {
          title: 'Temp=0 Determinism',
          status: comparableRows.length >= expectedComparisons
            ? ('COMPUTED' as AssumptionStatus)
            : ('INSUFFICIENT_DATA' as AssumptionStatus),
          matchRate: comparableRows.length > 0 ? matchedRows.length / comparableRows.length : null,
          differenceRate: comparableRows.length > 0 ? 1 - (matchedRows.length / comparableRows.length) : null,
          comparisons: comparableRows.length,
          excludedComparisons: Math.max(0, expectedComparisons - comparableRows.length),
          modelsTested: models.length,
          vignettesTested: availableVignettes.length,
          worstModelId,
          worstModelMatchRate,
        },
        rows,
        generatedAt: new Date(),
      };
    },
  })
);
