import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Select } from '../components/ui/Select';
import {
  AVAILABLE_SIGNATURES_QUERY,
  type AvailableSignaturesQueryResult,
} from '../api/operations/available-signatures';
import {
  MODELS_CONFIDENCE_QUERY,
  type ModelsConfidenceQueryResult,
  type ModelsConfidenceQueryVariables,
} from '../api/operations/modelsConfidence';
import { ConfidenceHeatmap } from '../components/models/ConfidenceHeatmap';
import {
  buildDomainShiftSignatureOptions,
  getDefaultDomainShiftSignature,
} from './domainValueShiftHeatmapUtils';

export function ModelsConfidence() {
  const [searchParams, setSearchParams] = useSearchParams();
  const signatureParam = searchParams.get('signature');

  const [{ data: signatureData }] = useQuery<AvailableSignaturesQueryResult>({
    query: AVAILABLE_SIGNATURES_QUERY,
    variables: {},
    requestPolicy: 'cache-and-network',
  });

  const availableSignatures = useMemo(
    () => signatureData?.availableSignatures.map((entry) => entry.signature) ?? [],
    [signatureData],
  );

  const signatureOptions = useMemo(
    () => buildDomainShiftSignatureOptions(availableSignatures),
    [availableSignatures],
  );

  const [selectedSignature, setSelectedSignature] = useState<string>(
    signatureParam ?? 'vnewtd',
  );

  useEffect(() => {
    const resolved = getDefaultDomainShiftSignature(availableSignatures, selectedSignature);
    if (resolved !== selectedSignature) {
      setSelectedSignature(resolved);
    }
  }, [availableSignatures, selectedSignature]);

  useEffect(() => {
    if (signatureParam == null && availableSignatures.length > 0) {
      setSearchParams({ signature: selectedSignature }, { replace: true });
    }
  }, [selectedSignature, signatureParam, availableSignatures.length, setSearchParams]);

  const [{ data, fetching, error }] = useQuery<ModelsConfidenceQueryResult, ModelsConfidenceQueryVariables>({
    query: MODELS_CONFIDENCE_QUERY,
    variables: { signature: selectedSignature },
    requestPolicy: 'cache-and-network',
  });

  const models = useMemo(() => data?.modelsConfidence.models ?? [], [data]);
  const loading = fetching && data == null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Models</p>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Confidence Heatmap</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          How often each model responds with strong conviction vs. a lean.
          Strong% = strongly support / (strongly support + somewhat support).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Signature</label>
        <Select
          value={selectedSignature}
          onChange={(value) => {
            setSelectedSignature(value);
            setSearchParams({ signature: value });
          }}
          options={signatureOptions}
        />
      </div>

      {error != null && <ErrorMessage message={error.message} />}
      {loading ? <Loading /> : <ConfidenceHeatmap models={models} />}
    </div>
  );
}
