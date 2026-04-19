import { gql } from 'urql';

export type ModelsConsistencyPerScenario = {
  scenarioId: string;
  matches: number;
  trials: number;
  p: number;
  ciLow: number;
  ciHigh: number;
};

export type ModelsConsistencyPerDomain = {
  domainId: string;
  domainName: string;
  value: number;
  ciLow: number;
  ciHigh: number;
  scenariosMeasured: number;
};

export type ModelsConsistencyPerCondition = {
  scenarioId: string;
  netPressureRank: number;
  winRate: number;
  matches: number;
  trials: number;
};

export type ModelsConsistencyPerPair = {
  domainId: string;
  valueKey: string;
  rho: number | null;
  pValue: number | null;
  coherent: boolean;
  determinate: boolean;
  targetAnalysisRunId: string | null;
  targetCompanionRunId: string | null;
  primaryConditionIds: string[];
  companionConditionIds: string[];
  perCondition: ModelsConsistencyPerCondition[];
};

export type ModelsConsistencyRepeatability = {
  value: number;
  ciLow: number;
  ciHigh: number;
  withinScenarioSd: number;
  betweenScenarioSd: number;
  scenariosMeasured: number;
  perDomain: ModelsConsistencyPerDomain[];
  perScenario: ModelsConsistencyPerScenario[];
};

export type ModelsConsistencyCoherence = {
  value: number;
  coherentPairs: number;
  determinatePairs: number;
  indeterminatePairs: number;
  perPair: ModelsConsistencyPerPair[];
};

export type ModelsConsistencyOrderEffect = {
  samePct: number;
  flippedPct: number;
  noisyPct: number;
  notApplicable: boolean;
};

export type ModelsConsistencyModel = {
  modelId: string;
  label: string;
  providerName: string;
  repeatability: ModelsConsistencyRepeatability;
  coherence: ModelsConsistencyCoherence;
  orderEffect: ModelsConsistencyOrderEffect;
};

export type ModelsConsistencyInsufficient = {
  modelId: string;
  label: string;
  providerName: string;
  reason: 'no-repeat-coverage' | 'invalid-summary-shape' | 'below-min-scenarios';
};

export type ModelsConsistencyQueryResult = {
  modelsConsistency: {
    models: ModelsConsistencyModel[];
    insufficient: ModelsConsistencyInsufficient[];
  };
};

export type ModelsConsistencyQueryVariables = {
  domainId?: string | null;
  providerId?: string | null;
  minScenarios?: number | null;
  signature: string;
};

export const MODELS_CONSISTENCY_QUERY = gql`
  query ModelsConsistency(
    $domainId: ID
    $providerId: ID
    $minScenarios: Int
    $signature: String!
  ) {
    modelsConsistency(
      domainId: $domainId
      providerId: $providerId
      minScenarios: $minScenarios
      signature: $signature
    ) {
      models {
        modelId
        label
        providerName
        repeatability {
          value
          ciLow
          ciHigh
          withinScenarioSd
          betweenScenarioSd
          scenariosMeasured
          perDomain {
            domainId
            domainName
            value
            ciLow
            ciHigh
            scenariosMeasured
          }
          perScenario {
            scenarioId
            matches
            trials
            p
            ciLow
            ciHigh
          }
        }
        coherence {
          value
          coherentPairs
          determinatePairs
          indeterminatePairs
          perPair {
            domainId
            valueKey
            rho
            pValue
            coherent
            determinate
            targetAnalysisRunId
            targetCompanionRunId
            primaryConditionIds
            companionConditionIds
            perCondition {
              scenarioId
              netPressureRank
              winRate
              matches
              trials
            }
          }
        }
        orderEffect {
          samePct
          flippedPct
          noisyPct
          notApplicable
        }
      }
      insufficient {
        modelId
        label
        providerName
        reason
      }
    }
  }
`;

export { MODELS_CONSISTENCY_QUERY as ModelsConsistencyDocument };
