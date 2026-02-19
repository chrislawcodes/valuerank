import { builder } from '../builder.js';
import {
  planFinalTrial,
  type ConditionPlan,
  type ModelPlan,
  type FinalTrialPlan,
} from '../../services/run/plan-final-trial.js';


const ConditionPlanRef = builder.objectRef<ConditionPlan>('ConditionPlan').implement({
    fields: (t) => ({
        scenarioId: t.exposeString('scenarioId'),
        conditionKey: t.exposeString('conditionKey'),
        currentSamples: t.exposeInt('currentSamples'),
        currentSEM: t.exposeFloat('currentSEM', { nullable: true }),
        status: t.exposeString('status'),
        neededSamples: t.exposeInt('neededSamples'),
    }),
});

const ModelPlanRef = builder.objectRef<ModelPlan>('ModelPlan').implement({
    fields: (t) => ({
        modelId: t.exposeString('modelId'),
        conditions: t.expose('conditions', { type: [ConditionPlanRef] }),
        totalNeededSamples: t.exposeInt('totalNeededSamples'),
    }),
});

const FinalTrialPlanRef = builder.objectRef<FinalTrialPlan>('FinalTrialPlan').implement({
    fields: (t) => ({
        definitionId: t.exposeString('definitionId'),
        models: t.expose('models', { type: [ModelPlanRef] }),
        totalJobs: t.exposeInt('totalJobs'),
    }),
});

builder.queryField('finalTrialPlan', (t) =>
    t.field({
        type: FinalTrialPlanRef,
        args: {
            definitionId: t.arg.string({ required: true }),
            models: t.arg.stringList({ required: true }),
        },
        resolve: (_root, args, ctx) => {
            // Auth check? StartRun requires auth.
            if (ctx.user === undefined || ctx.user === null) throw new Error('Unauthorized');
            const plan: Promise<FinalTrialPlan> = planFinalTrial(args.definitionId, args.models);
            return plan;
        },
    })
);
