import { builder } from '../builder.js';
import { planFinalTrial } from '../../services/run/plan-final-trial.js';


const ConditionPlanRef = builder.objectRef<{
    scenarioId: string;
    conditionKey: string;
    currentSamples: number;
    currentSEM: number | null;
    status: string;
    neededSamples: number;
}>('ConditionPlan').implement({
    fields: (t) => ({
        scenarioId: t.exposeString('scenarioId'),
        conditionKey: t.exposeString('conditionKey'),
        currentSamples: t.exposeInt('currentSamples'),
        currentSEM: t.exposeFloat('currentSEM', { nullable: true }),
        status: t.exposeString('status'),
        neededSamples: t.exposeInt('neededSamples'),
    }),
});

const ModelPlanRef = builder.objectRef<{
    modelId: string;
    conditions: any[]; // Using any[] to avoid circular ref issues or strict typing complexities here for now
    totalNeededSamples: number;
}>('ModelPlan').implement({
    fields: (t) => ({
        modelId: t.exposeString('modelId'),
        conditions: t.field({
            type: [ConditionPlanRef],
            resolve: (parent) => parent.conditions
        }),
        totalNeededSamples: t.exposeInt('totalNeededSamples'),
    }),
});

const FinalTrialPlanRef = builder.objectRef<{
    definitionId: string;
    models: any[];
    totalJobs: number;
}>('FinalTrialPlan').implement({
    fields: (t) => ({
        definitionId: t.exposeString('definitionId'),
        models: t.field({
            type: [ModelPlanRef],
            resolve: (parent) => parent.models
        }),
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
        resolve: async (_root, args, ctx) => {
            // Auth check? StartRun requires auth.
            if (!ctx.user) throw new Error('Unauthorized');
            return planFinalTrial(args.definitionId, args.models);
        },
    })
);
