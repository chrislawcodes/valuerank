import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { ConfidenceHeatmap } from '../components/models/ConfidenceHeatmap';
import {
  buildDomainShiftSignatureOptions,
  getDefaultDomainShiftSignature,
} from './domainValueShiftHeatmapUtils';
import { useDomains } from '../hooks/useDomains';

export function ModelsConfidence() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const signatureParam = searchParams.get('signature');

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

  // Filter heatmap rows to selected models (null = not yet loaded, show all).
  const filteredModelIds = selectedModelIds;

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

  // Model filter state helpers.
  const isDefaultSelection =
    selectedModelIds !== null &&
    defaultModelIds.length > 0 &&
    selectedModelIds.length === defaultModelIds.length &&
    defaultModelIds.every((id) => selectedModelIds.includes(id));

  const [modelFilterOpen, setModelFilterOpen] = useState(false);

  const handleToggleModel = (modelId: string) => {
    const current = selectedModelIds ?? [];
    const next = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId];
    setSelectedModelIds(next);
  };

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

      {/* Controls row: Domain | Models | Signature */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-4">
          {domains.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Domain</label>
              <Select
                value={selectedDomainId ?? ''}
                onChange={(value) => setSelectedDomainId(value === '' ? null : value)}
                options={domainOptions}
              />
            </div>
          )}

          {allModels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Models:</span>
              {selectedModelIds === null || isDefaultSelection ? (
                <span className="text-xs font-medium text-gray-700">Default</span>
              ) : selectedModelIds.length === 0 ? (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  None selected
                </span>
              ) : (
                <span className="text-xs font-medium text-gray-700">
                  {selectedModelIds.length} of {allModels.length}
                </span>
              )}
              {selectedModelIds !== null && !isDefaultSelection && defaultModelIds.length > 0 && (
                // eslint-disable-next-line react/forbid-elements
                <button
                  type="button"
                  className="text-xs text-teal-600 underline-offset-2 hover:text-teal-800 hover:underline"
                  onClick={() => setSelectedModelIds(defaultModelIds)}
                >
                  Reset to default
                </button>
              )}
              {/* eslint-disable-next-line react/forbid-elements */}
              <button
                type="button"
                className="text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                onClick={() => setModelFilterOpen((v) => !v)}
              >
                {modelFilterOpen ? '▴ Close' : '▾ Change'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
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
        </div>

        {/* Model filter panel (expands below the controls row) */}
        {modelFilterOpen && allModels.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
                Select models
              </span>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line react/forbid-elements */}
                <button
                  type="button"
                  className="text-xs font-medium text-teal-700 hover:text-teal-800"
                  onClick={() => setSelectedModelIds(allModels.map((m) => m.modelId))}
                >
                  Select all
                </button>
                {/* eslint-disable-next-line react/forbid-elements */}
                <button
                  type="button"
                  className="text-xs font-medium text-gray-600 hover:text-gray-800"
                  onClick={() => setSelectedModelIds([])}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {allModels.map((m) => (
                <label
                  key={m.modelId}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={(selectedModelIds ?? []).includes(m.modelId)}
                    onChange={() => handleToggleModel(m.modelId)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="flex-1 truncate" title={m.modelId}>
                    {m.displayName}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {error != null && <ErrorMessage message={error.message} />}
      {loading ? (
        <Loading />
      ) : (
        <ConfidenceHeatmap
          models={models}
          selectedModelIds={filteredModelIds ?? undefined}
          onCellClick={handleCellClick}
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
