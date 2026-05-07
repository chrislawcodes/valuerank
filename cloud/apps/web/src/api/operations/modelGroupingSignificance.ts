import type {
  ModelGroupingSignificanceQuery as GeneratedModelGroupingSignificanceQuery,
  ModelGroupingSignificanceQueryVariables as GeneratedModelGroupingSignificanceQueryVariables,
} from '../../generated/graphql';

export { ModelGroupingSignificanceDocument as MODEL_GROUPING_SIGNIFICANCE_QUERY } from '../../generated/graphql';

export type ModelGroupingSignificanceQueryResult = GeneratedModelGroupingSignificanceQuery;
export type ModelGroupingSignificanceQueryVariables = GeneratedModelGroupingSignificanceQueryVariables;

export type ModelGroupingSignificanceResult =
  GeneratedModelGroupingSignificanceQuery['modelGroupingSignificance'];
export type ModelGroupingSignificanceModel = ModelGroupingSignificanceResult['models'][number];
export type ModelGroupingSignificanceRow = ModelGroupingSignificanceResult['rows'][number];
