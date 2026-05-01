import type {
  ConfidenceValueDetailQuery as GeneratedConfidenceValueDetailQuery,
  ConfidenceValueDetailQueryVariables as GeneratedConfidenceValueDetailQueryVariables,
} from '../../generated/graphql';

export { ConfidenceValueDetailDocument as CONFIDENCE_VALUE_DETAIL_QUERY } from '../../generated/graphql';

export type ConfidenceValueDetailQueryVariables = GeneratedConfidenceValueDetailQueryVariables;
export type ConfidenceValueDetailQueryResult = GeneratedConfidenceValueDetailQuery;

// Derive shapes from codegen for type safety without hand-written object literals.
export type ConfidenceValueDetailVignette =
  GeneratedConfidenceValueDetailQuery['confidenceValueDetail']['vignettes'][number];

export type ConfidenceValueDetailCondition = ConfidenceValueDetailVignette['conditions'][number];
