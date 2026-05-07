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
// Temporary compatibility for Slice C consumers that still read the legacy fields.
export type ModelGroupingSignificanceRow = ModelGroupingSignificanceResult['rows'][number] & {
  meanDifference?: number | null;
  effectSize?: number | null;
};
