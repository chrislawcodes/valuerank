import type {
  PairwiseWinRatesQuery as GeneratedPairwiseWinRatesQuery,
  PairwiseWinRatesQueryVariables as GeneratedPairwiseWinRatesQueryVariables,
} from '../../generated/graphql';

export { PairwiseWinRatesDocument as PAIRWISE_WIN_RATES_QUERY } from '../../generated/graphql';
export { usePairwiseWinRatesQuery } from '../../generated/graphql';

export type PairwiseWinRatesQueryResult = GeneratedPairwiseWinRatesQuery;
export type PairwiseWinRatesQueryVariables = GeneratedPairwiseWinRatesQueryVariables;

export type PairwiseWinRatesResult = GeneratedPairwiseWinRatesQuery['pairwiseWinRates'];
export type ModelPairwiseWinRates = PairwiseWinRatesResult['models'][number];
