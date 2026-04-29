import type {
  ActiveEvaluationsQuery as GeneratedActiveEvaluationsQuery,
  ActiveEvaluationsQueryVariables as GeneratedActiveEvaluationsQueryVariables,
} from '../../generated/graphql';

export type ActiveEvaluation = GeneratedActiveEvaluationsQuery['activeEvaluations'][number];

export { ActiveEvaluationsDocument as ACTIVE_EVALUATIONS_QUERY } from '../../generated/graphql';

export type ActiveEvaluationsQueryResult = GeneratedActiveEvaluationsQuery;
export type ActiveEvaluationsQueryVariables = GeneratedActiveEvaluationsQueryVariables;
