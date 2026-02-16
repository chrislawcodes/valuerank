import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ExperimentRef } from '../types/refs.js';

type SurveyPlan = {
  kind?: string;
};

function isSurveyExperiment(analysisPlan: unknown): boolean {
  if (analysisPlan === null || analysisPlan === undefined || typeof analysisPlan !== 'object') {
    return false;
  }
  const plan = analysisPlan as SurveyPlan;
  return plan.kind === 'survey';
}

builder.queryField('surveys', (t) =>
  t.field({
    type: [ExperimentRef],
    description: 'List surveys (stored as experiments with analysisPlan.kind="survey").',
    args: {
      search: t.arg.string({
        required: false,
        description: 'Optional case-insensitive search by survey name.',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const search = typeof args.search === 'string' ? args.search.trim() : '';
      const experiments = await db.experiment.findMany({
        where: search !== ''
          ? {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          }
          : undefined,
        orderBy: { updatedAt: 'desc' },
      });

      const surveys = experiments.filter((experiment) => isSurveyExperiment(experiment.analysisPlan));
      ctx.log.debug({ count: surveys.length }, 'Surveys fetched');
      return surveys;
    },
  })
);

builder.queryField('survey', (t) =>
  t.field({
    type: ExperimentRef,
    nullable: true,
    description: 'Fetch a survey by experiment ID.',
    args: {
      id: t.arg.id({ required: true, description: 'Survey experiment ID' }),
    },
    resolve: async (_root, args, ctx) => {
      const surveyId = String(args.id);
      const experiment = await db.experiment.findUnique({
        where: { id: surveyId },
      });

      if (experiment === null || !isSurveyExperiment(experiment.analysisPlan)) {
        ctx.log.debug({ surveyId }, 'Survey not found');
        return null;
      }

      return experiment;
    },
  })
);
