import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { SCHWARTZ_CATEGORIES } from '../../utils/pvq-questions.js';
import { computeSchwartzAverages, type ParsedTrial } from '../../utils/pvq-aggregator.js';
import { parseFullPvqScores } from '../../utils/pvq-parser.js';

type FullPvqSurveyShape = {
  id: string;
  name: string;
  createdAt: Date;
  straightTrialCount: number;
  desireTrialCount: number;
  analysisPlan: unknown;
};

type FullPvqModelScoreShape = {
  modelId: string;
  mean: number | null;
  trialCount: number;
  refusedCount: number;
};

type FullPvqCategoryResultShape = {
  name: string;
  scores: FullPvqModelScoreShape[];
};

type FullPvqResultModelShape = {
  modelId: string;
  displayName: string;
};

type FullPvqResultsShape = {
  models: FullPvqResultModelShape[];
  categories: FullPvqCategoryResultShape[];
};

type FullPvqTrialCategoryScoreShape = {
  questionId: string;
  score: number | null;
};

type FullPvqTrialDetailShape = {
  transcriptId: string;
  modelId: string;
  displayName: string;
  createdAt: Date;
  refused: boolean;
  parseWarnings: string[];
  categoryScores: FullPvqTrialCategoryScoreShape[];
  categoryMean: number | null;
};

type FullPvqAnalysisPlan = {
  kind?: string;
  deletedAt?: string | null;
  straightDefinitionId?: string;
  desireDefinitionId?: string;
};

type FullPvqRunConfig = {
  fullPvqFraming?: string;
};

type FullPvqSurveyRefShape = FullPvqSurveyShape;

const FullPvqSurveyRef = builder.objectRef<FullPvqSurveyRefShape>('FullPvqSurvey').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    createdAt: t.field({ type: 'DateTime', resolve: (parent) => parent.createdAt }),
    straightTrialCount: t.exposeInt('straightTrialCount'),
    desireTrialCount: t.exposeInt('desireTrialCount'),
    analysisPlan: t.expose('analysisPlan', { type: 'JSON', nullable: true }),
  }),
});

const FullPvqModelScoreRef = builder.objectRef<FullPvqModelScoreShape>('FullPvqModelScore').implement({
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    mean: t.exposeFloat('mean', { nullable: true }),
    trialCount: t.exposeInt('trialCount'),
    refusedCount: t.exposeInt('refusedCount'),
  }),
});

const FullPvqCategoryResultRef = builder.objectRef<FullPvqCategoryResultShape>('FullPvqCategoryResult').implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    scores: t.field({ type: [FullPvqModelScoreRef], resolve: (parent) => parent.scores }),
  }),
});

const FullPvqResultModelRef = builder.objectRef<FullPvqResultModelShape>('FullPvqResultModel').implement({
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    displayName: t.exposeString('displayName'),
  }),
});

const FullPvqResultsRef = builder.objectRef<FullPvqResultsShape>('FullPvqResults').implement({
  fields: (t) => ({
    models: t.field({ type: [FullPvqResultModelRef], resolve: (parent) => parent.models }),
    categories: t.field({ type: [FullPvqCategoryResultRef], resolve: (parent) => parent.categories }),
  }),
});

const FullPvqTrialCategoryScoreRef = builder
  .objectRef<FullPvqTrialCategoryScoreShape>('FullPvqTrialCategoryScore')
  .implement({
    fields: (t) => ({
      questionId: t.exposeString('questionId'),
      score: t.exposeInt('score', { nullable: true }),
    }),
  });

const FullPvqTrialDetailRef = builder.objectRef<FullPvqTrialDetailShape>('FullPvqTrialDetail').implement({
  fields: (t) => ({
    transcriptId: t.exposeString('transcriptId'),
    modelId: t.exposeString('modelId'),
    displayName: t.exposeString('displayName'),
    createdAt: t.field({ type: 'DateTime', resolve: (parent) => parent.createdAt }),
    refused: t.exposeBoolean('refused'),
    parseWarnings: t.exposeStringList('parseWarnings'),
    categoryScores: t.field({ type: [FullPvqTrialCategoryScoreRef], resolve: (parent) => parent.categoryScores }),
    categoryMean: t.exposeFloat('categoryMean', { nullable: true }),
  }),
});

function isDeletedAnalysisPlan(analysisPlan: unknown): boolean {
  if (analysisPlan === null || analysisPlan === undefined || typeof analysisPlan !== 'object' || Array.isArray(analysisPlan)) {
    return false;
  }

  const plan = analysisPlan as Record<string, unknown>;
  return plan.deletedAt !== null && plan.deletedAt !== undefined;
}

function isFullPvqExperiment(analysisPlan: unknown): analysisPlan is FullPvqAnalysisPlan {
  if (analysisPlan === null || analysisPlan === undefined || typeof analysisPlan !== 'object' || Array.isArray(analysisPlan)) {
    return false;
  }

  const plan = analysisPlan as FullPvqAnalysisPlan;
  return plan.kind === 'full_pvq';
}

function getRunFraming(config: unknown): string | null {
  if (config === null || config === undefined || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  const record = config as FullPvqRunConfig;
  return typeof record.fullPvqFraming === 'string' ? record.fullPvqFraming : null;
}

async function countTrialsByFraming(experimentId: string): Promise<{ straightTrialCount: number; desireTrialCount: number }> {
  const runs = await db.run.findMany({
    where: { experimentId },
    select: { id: true, config: true },
  });

  let straightTrialCount = 0;
  let desireTrialCount = 0;

  for (const run of runs) {
    const framing = getRunFraming(run.config);
    if (framing !== 'straight' && framing !== 'desire_for_human') {
      continue;
    }

    const transcriptCount = await db.transcript.count({
      where: { runId: run.id, deletedAt: null },
    });

    if (framing === 'straight') {
      straightTrialCount += transcriptCount;
    } else {
      desireTrialCount += transcriptCount;
    }
  }

  return { straightTrialCount, desireTrialCount };
}

async function toSurveyShape(experiment: { id: string; name: string; createdAt: Date; analysisPlan: unknown }): Promise<FullPvqSurveyShape | null> {
  if (!isFullPvqExperiment(experiment.analysisPlan) || isDeletedAnalysisPlan(experiment.analysisPlan)) {
    return null;
  }

  const counts = await countTrialsByFraming(experiment.id);
  return {
    id: experiment.id,
    name: experiment.name,
    createdAt: experiment.createdAt,
    straightTrialCount: counts.straightTrialCount,
    desireTrialCount: counts.desireTrialCount,
    analysisPlan: experiment.analysisPlan,
  };
}

builder.queryField('fullPvqSurveys', (t) =>
  t.field({
    type: [FullPvqSurveyRef],
    description: 'List full PVQ surveys stored as full_pvq experiments.',
    resolve: async () => {
      const experiments = await db.experiment.findMany({
        where: {
          analysisPlan: {
            path: ['kind'],
            equals: 'full_pvq',
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const surveys: FullPvqSurveyShape[] = [];
      for (const experiment of experiments) {
        const survey = await toSurveyShape(experiment);
        if (survey !== null) {
          surveys.push(survey);
        }
      }

      return surveys;
    },
  })
);

builder.queryField('fullPvqSurvey', (t) =>
  t.field({
    type: FullPvqSurveyRef,
    nullable: true,
    description: 'Fetch a single full PVQ survey by experiment ID.',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      const surveyId = String(args.id);
      const experiment = await db.experiment.findUnique({ where: { id: surveyId } });
      if (experiment === null) {
        return null;
      }

      return toSurveyShape(experiment);
    },
  })
);

builder.queryField('fullPvqResults', (t) =>
  t.field({
    type: FullPvqResultsRef,
    description: 'Compute Schwartz averages for one full PVQ framing.',
    args: {
      surveyId: t.arg.id({ required: true }),
      framing: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      const surveyId = String(args.surveyId);
      const framing = String(args.framing);

      const experiment = await db.experiment.findUnique({ where: { id: surveyId } });
      if (experiment === null || isDeletedAnalysisPlan(experiment.analysisPlan) || !isFullPvqExperiment(experiment.analysisPlan)) {
        return { models: [], categories: [] };
      }

      const plan = experiment.analysisPlan as FullPvqAnalysisPlan;
      if (plan.straightDefinitionId === undefined || plan.desireDefinitionId === undefined) {
        return { models: [], categories: [] };
      }

      const runs = await db.run.findMany({
        where: { experimentId: surveyId },
        select: { id: true, config: true },
      });
      const framingRuns = runs.filter((run) => getRunFraming(run.config) === framing);
      if (framingRuns.length === 0) {
        return { models: [], categories: [] };
      }

      const transcriptsByRun = await Promise.all(
        framingRuns.map(async (run) =>
          db.transcript.findMany({
            where: { runId: run.id, deletedAt: null },
            select: {
              id: true,
              modelId: true,
              content: true,
            },
          })
        )
      );

      const modelIds = new Set<string>();
      const trials: ParsedTrial[] = [];
      for (const transcripts of transcriptsByRun) {
        for (const transcript of transcripts) {
          modelIds.add(transcript.modelId);
        }
      }

      const modelRows = modelIds.size === 0
        ? []
        : await db.llmModel.findMany({
          where: { id: { in: Array.from(modelIds) } },
          select: { id: true, displayName: true },
        });
      const modelDisplayNames = new Map<string, string>();
      for (const model of modelRows) {
        modelDisplayNames.set(model.id, model.displayName);
      }

      for (const transcripts of transcriptsByRun) {
        for (const transcript of transcripts) {
          const parsed = parseFullPvqScores(transcript.content);
          trials.push({
            modelId: transcript.modelId,
            displayName: modelDisplayNames.get(transcript.modelId) ?? transcript.modelId,
            scores: parsed.scores,
            refused: parsed.refused,
          });
        }
      }

      return computeSchwartzAverages(trials);
    },
  })
);

builder.queryField('fullPvqTrialDetail', (t) =>
  t.field({
    type: [FullPvqTrialDetailRef],
    description: 'Fetch per-trial PVQ detail for one model and Schwartz category.',
    args: {
      surveyId: t.arg.id({ required: true }),
      framing: t.arg.string({ required: true }),
      category: t.arg.string({ required: true }),
      modelId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      const surveyId = String(args.surveyId);
      const framing = String(args.framing);
      const category = String(args.category);
      const modelId = String(args.modelId);

      const experiment = await db.experiment.findUnique({ where: { id: surveyId } });
      if (experiment === null || isDeletedAnalysisPlan(experiment.analysisPlan) || !isFullPvqExperiment(experiment.analysisPlan)) {
        return [];
      }

      const questionIds = SCHWARTZ_CATEGORIES[category];
      if (questionIds === undefined) {
        return [];
      }

      const transcripts = await db.transcript.findMany({
        where: {
          run: { experimentId: surveyId },
          modelId,
          deletedAt: null,
        },
        include: {
          run: true,
        },
      });

      const filteredTranscripts = transcripts.filter((transcript) => getRunFraming(transcript.run.config) === framing);

      const model = await db.llmModel.findUnique({
        where: { id: modelId },
        select: { displayName: true },
      });
      const displayName = model?.displayName ?? modelId;

      const trialDetails: FullPvqTrialDetailShape[] = filteredTranscripts.map((transcript) => {
        const parsed = parseFullPvqScores(transcript.content);
        const categoryScores = questionIds.map((questionId) => ({
          questionId,
          score: parsed.scores[questionId] ?? null,
        }));

        let categoryMean: number | null = null;
        if (parsed.refused === false) {
          const values = categoryScores
            .map((entry) => entry.score)
            .filter((value): value is number => typeof value === 'number');
          if (values.length > 0) {
            const total = values.reduce((sum, value) => sum + value, 0);
            categoryMean = total / values.length;
          }
        }

        return {
          transcriptId: transcript.id,
          modelId: transcript.modelId,
          displayName,
          createdAt: transcript.createdAt,
          refused: parsed.refused,
          parseWarnings: parsed.parseWarnings,
          categoryScores,
          categoryMean,
        };
      });

      trialDetails.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      return trialDetails;
    },
  })
);
