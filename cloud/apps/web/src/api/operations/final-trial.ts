
export const FINAL_TRIAL_PLAN_QUERY = `
  query FinalTrialPlan($definitionId: String!, $models: [String!]!) {
    finalTrialPlan(definitionId: $definitionId, models: $models) {
      definitionId
      totalJobs
      models {
        modelId
        totalNeededSamples
        conditions {
          conditionKey
          status
          neededSamples
          currentSamples
          currentSEM
        }
      }
    }
  }
`;

export type ConditionPlan = {
    conditionKey: string;
    status: 'STABLE' | 'MORE_INVESTIGATION' | 'UNDECIDED' | 'INSUFFICIENT_DATA';
    neededSamples: number;
    currentSamples: number;
    currentSEM: number | null;
};

export type ModelPlan = {
    modelId: string;
    totalNeededSamples: number;
    conditions: ConditionPlan[];
};

export type FinalTrialPlan = {
    definitionId: string;
    totalJobs: number;
    models: ModelPlan[];
};

export type FinalTrialPlanQueryResult = {
    finalTrialPlan: FinalTrialPlan;
};
