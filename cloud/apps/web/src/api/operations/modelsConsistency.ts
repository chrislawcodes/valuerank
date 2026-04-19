import type {
  ModelsConsistencyQuery as GeneratedModelsConsistencyQuery,
  ModelsConsistencyQueryVariables as GeneratedModelsConsistencyQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// QUERY DOCUMENT
// ============================================================================

export { ModelsConsistencyDocument as MODELS_CONSISTENCY_QUERY } from '../../generated/graphql';

// ============================================================================
// TYPES — all derived from the codegen-generated query shape
// ============================================================================

export type ModelsConsistencyQueryResult = GeneratedModelsConsistencyQuery;
export type ModelsConsistencyQueryVariables = GeneratedModelsConsistencyQueryVariables;

export type ModelsConsistencyResult = GeneratedModelsConsistencyQuery['modelsConsistency'];
export type ModelsConsistencyModel = ModelsConsistencyResult['models'][number];
export type ModelsConsistencyInsufficient = ModelsConsistencyResult['insufficient'][number];

export type ModelsConsistencyRepeatability = ModelsConsistencyModel['repeatability'];
export type ModelsConsistencyPerDomain = ModelsConsistencyRepeatability['perDomain'][number];
export type ModelsConsistencyPerScenario = ModelsConsistencyRepeatability['perScenario'][number];

export type ModelsConsistencyCoherence = ModelsConsistencyModel['coherence'];
export type ModelsConsistencyPerPair = ModelsConsistencyCoherence['perPair'][number];
export type ModelsConsistencyPerCondition = ModelsConsistencyPerPair['perCondition'][number];

export type ModelsConsistencyOrderEffect = ModelsConsistencyModel['orderEffect'];
