import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { AnalysisContextBar } from '../components/analysis/AnalysisContextBar';
import {
  AVAILABLE_SIGNATURES_QUERY,
  type AvailableSignaturesQueryResult,
} from '../api/operations/available-signatures';
import {
  MODELS_CONFIDENCE_QUERY,
  type ModelsConfidenceQueryResult,
  type ModelsConfidenceQueryVariables,
} from '../api/operations/modelsConfidence';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { ConfidenceHeatmap } from '../components/models/ConfidenceHeatmap';
import { ConfidenceDomainBreakout } from '../components/models/ConfidenceDomainBreakout';
import { ConfidenceModelDomainBreakout } from '../components/models/ConfidenceModelDomainBreakout';
import { ScreenshotButton } from '../components/ui/ScreenshotButton';
import {
  buildDomainShiftSignatureOptions,
  getDefaultDomainShiftSignature,
} from './domainValueShiftHeatmapUtils';
import { useDomains } from '../hooks/useDomains';

export function ModelsConfidence() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const signatureParam = searchParams.get('signature');
  const reportRef = useRef<HTMLDivElement>(null);

  const { domains } = useDomains();
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

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

  const domainOptions = useMemo(
    () => [
      { value: '', label: 'All domains' },
      ...domains.map((d) => ({ value: d.id, label: d.name })),
    ],
    [domains],
  );

  const [{ data, fetching, error }] = useQuery<ModelsConfidenceQueryResult, ModelsConfidenceQueryVariables>({
    query: MODELS_CONFIDENCE_QUERY,
    variables: {
      signature: selectedSignature,
      domainId: selectedDomainId ?? undefined,
    },
    requestPolicy: 'cache-and-network',
  });

  const [{ data: llmModelsData }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });

  const allModels = useMemo(
    () => (llmModelsData?.llmModels ?? []).filter((m) => m.status === 'ACTIVE'),
    [llmModelsData],
  );

  const defaultModelIds = useMemo(
    () => allModels.filter((m) => m.isDefault).map((m) => m.modelId),
    [allModels],
  );

  const [selectedModelIds, setSelectedModelIds] = useState<string[] | null>(null);

  // Once default IDs are resolved, initialise selection to defaults.
  useEffect(() => {
    if (selectedModelIds === null && defaultModelIds.length > 0) {
      setSelectedModelIds(defaultModelIds);
    }
  }, [defaultModelIds, selectedModelIds]);

  const models = useMemo(() => data?.modelsConfidence.models ?? [], [data]);
  const loading = fetching && data == null;

  const filteredModelIds = selectedModelIds ?? defaultModelIds;

  const handleCellClick = useCallback(
    (modelId: string, modelLabel: string, valueKey: string) => {
      const params = new URLSearchParams({
        modelId,
        modelLabel,
        valueKey,
        signature: selectedSignature,
      });
      if (selectedDomainId !== null) {
        params.set('domainId', selectedDomainId);
      }
      navigate(`/models/confidence/detail?${params.toString()}`);
    },
    [navigate, selectedSignature, selectedDomainId],
  );

  const modelOptions = useMemo(
    () => allModels.map((model) => ({
      value: model.modelId,
      label: model.displayName,
      isDefault: defaultModelIds.includes(model.modelId),
    })),
    [allModels, defaultModelIds],
  );

  return (
    <div className="space-y-6">
      <AnalysisContextBar
        domain={{
          label: 'Domain',
          value: selectedDomainId ?? '',
          onChange: (value) => setSelectedDomainId(value === '' ? null : value),
          options: domainOptions,
        }}
        signature={{
          label: 'Signature',
          value: selectedSignature,
          onChange: (value) => {
            setSelectedSignature(value);
            setSearchParams({ signature: value });
          },
          options: signatureOptions,
        }}
        models={{
          label: 'Models',
          selectedModelIds,
          defaultModelIds,
          options: modelOptions,
          onChange: setSelectedModelIds,
        }}
      />

      {error != null && <ErrorMessage message={error.message} />}

      <section ref={reportRef} className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Models</p>
            <h1 className="text-lg font-semibold text-gray-900">
              Confidence by Values by Model
            </h1>
            <p className="max-w-3xl text-sm text-gray-600">
              Shows how often each model responds with strong conviction when it picks a value.
            </p>
          </div>
          <ScreenshotButton targetRef={reportRef} label="confidence by values by model report" />
        </div>

        {loading ? (
          <Loading />
        ) : (
          <ConfidenceHeatmap
            models={models}
            selectedModelIds={filteredModelIds ?? undefined}
            onCellClick={handleCellClick}
          />
        )}
      </section>

      {domains.length > 0 && (
        <ConfidenceDomainBreakout
          domains={domains}
          signature={selectedSignature}
          selectedModelIds={selectedModelIds}
          defaultModelIds={defaultModelIds}
          selectedDomainId={selectedDomainId}
        />
      )}

      {domains.length > 0 && (
        <ConfidenceModelDomainBreakout
          domains={domains}
          referenceModels={models}
          signature={selectedSignature}
          selectedModelIds={selectedModelIds}
          defaultModelIds={defaultModelIds}
          selectedDomainId={selectedDomainId}
        />
      )}

      {/* How the % is calculated */}
      <section className="rounded-lg border border-gray-100 bg-gray-50 p-5 text-sm text-gray-700 space-y-3 max-w-3xl">
        <h2 className="font-semibold text-gray-900">How the % is calculated</h2>
        <p>
          Every transcript ends with a verdict: the model either <strong>strongly</strong> chose
          one value or <strong>leaned toward</strong> one value. &ldquo;Strongly&rdquo; means it picked with
          conviction. &ldquo;Lean&rdquo; means it tilted that way but not decisively.
        </p>
        <p>
          The confidence % answers: <em>how often does the model say &ldquo;strongly&rdquo; vs. just &ldquo;lean&rdquo;?</em>
        </p>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 font-mono text-xs text-gray-800">
          Strong% = strongly_support ÷ (strongly_support + somewhat_support)
        </div>
        <p>
          For example: if a model ran 100 trials on an &ldquo;Achievement vs. Tradition&rdquo; vignette,
          said &ldquo;strongly&rdquo; 70 times and &ldquo;lean&rdquo; 30 times, that vignette&apos;s rate is 70%.
        </p>
        <p className="font-medium text-gray-800">Why not just add up all the trials?</p>
        <p>
          Some vignettes were run 75 times, others 175 times. If you pooled everything, high-run
          vignettes would count more — even though they&apos;re testing separate questions. Instead,
          the rate is calculated per vignette first, then those rates are averaged. Every vignette
          gets one vote, regardless of how many times it was run.
        </p>
        <p>
          When a domain is selected, only vignettes belonging to that domain are included.
          Vignettes from other domains are dropped before any counting starts.
        </p>
      </section>
    </div>
  );
}
