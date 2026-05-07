import type {
  ModelsWinRateStabilityQuery as GeneratedQuery,
  ModelsWinRateStabilityQueryVariables as GeneratedVariables,
} from '../../generated/graphql';

export { ModelsWinRateStabilityDocument as MODELS_STABILITY_QUERY } from '../../generated/graphql';

export type ModelsStabilityQueryResult = GeneratedQuery;
export type ModelsStabilityQueryVariables = GeneratedVariables;
export type ModelsStabilityModelResult =
  GeneratedQuery['modelsWinRateStability']['models'][number];
export type ModelsStabilitySkippedVignette =
  GeneratedQuery['modelsWinRateStability']['skippedVignettes'][number];
