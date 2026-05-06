import { useMemo } from 'react';
import { useQuery } from 'urql';
import { AVAILABLE_SIGNATURES_QUERY, type AvailableSignature, type AvailableSignaturesQueryResult } from '../api/operations/available-signatures';
import { isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { parseTemperatureFromSignature } from '../utils/domainAnalysisUtils';
import { preferDefaultSignature, type AvailableSignature as PreferredSignatureOption } from '@valuerank/shared';

function toPreferredOption(signature: AvailableSignature): PreferredSignatureOption {
  const isVirtual = isVnewSignature(signature.signature);
  const temperature = isVirtual ? parseVnewTemperature(signature.signature) : parseTemperatureFromSignature(signature.signature);
  return {
    signature: signature.signature,
    isVirtual,
    temperature,
    mostRecentRunAt: signature.mostRecentRunAt,
  };
}

export function useAvailableSignatures(): {
  signatures: string[];
  defaultSignature: string | null;
  loading: boolean;
  error: Error | undefined;
} {
  const [{ data, fetching, error }] = useQuery<AvailableSignaturesQueryResult>({
    query: AVAILABLE_SIGNATURES_QUERY,
    requestPolicy: 'cache-and-network',
  });

  const signatures = useMemo(() => data?.availableSignatures.map((entry) => entry.signature) ?? [], [data]);
  const defaultSignature = useMemo(
    () => preferDefaultSignature((data?.availableSignatures ?? []).map(toPreferredOption)),
    [data],
  );

  return {
    signatures,
    defaultSignature,
    loading: fetching && data == null,
    error,
  };
}
