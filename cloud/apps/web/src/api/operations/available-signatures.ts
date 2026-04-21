import type {
  AvailableSignaturesQuery as GeneratedAvailableSignaturesQuery,
  AvailableSignaturesQueryVariables as GeneratedAvailableSignaturesQueryVariables,
} from '../../generated/graphql';

export { AvailableSignaturesDocument as AVAILABLE_SIGNATURES_QUERY } from '../../generated/graphql';

export type AvailableSignaturesQueryResult = GeneratedAvailableSignaturesQuery;
export type AvailableSignaturesQueryVariables = GeneratedAvailableSignaturesQueryVariables;

export type AvailableSignature = GeneratedAvailableSignaturesQuery['availableSignatures'][number];
