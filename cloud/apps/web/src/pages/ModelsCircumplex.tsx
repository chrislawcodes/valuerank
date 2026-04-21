import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import {
  CIRCUMPLEX_ANALYSIS_QUERY,
  type CircumplexAnalysisQueryResult,
  type CircumplexAnalysisQueryVariables,
  type CircumplexResult,
} from '../api/operations/circumplex';
import { useAvailableSignatures } from '../hooks/useAvailableSignatures';
import { CircumplexThresholdControl } from '../components/models/CircumplexThresholdControl';
import { CircumplexModelPicker } from '../components/models/CircumplexModelPicker';
import { CircumplexMethodologyPanel } from '../components/models/CircumplexMethodologyPanel';
import { CircumplexMdsScatter } from '../components/models/CircumplexMdsScatter';
import { CircumplexModelCard } from '../components/models/CircumplexModelCard';
import { CircumplexLoadingProgress } from '../components/models/CircumplexLoadingProgress';

function parseCommaList(value: string | null): string[] {
  if (value == null || value.trim() === '') return [];
  return value.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

function normalizeSelection(ids: string[], order: Map<string, number>): string[] {
  return [...new Set(ids)].sort((left, right) => (order.get(left) ?? Number.POSITIVE_INFINITY) - (order.get(right) ?? Number.POSITIVE_INFINITY));
}

function classifyResult(result: CircumplexResult, threshold: number): { eligible: boolean } | { eligible: false; reason: 'no_transcripts_for_signature' | 'missing_values' | 'below_threshold' } {
  const counts = result.trialsPerValue.map((entry) => entry.trials);
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return { eligible: false, reason: 'no_transcripts_for_signature' };
  }
  if (counts.some((count) => count === 0)) {
    return { eligible: false, reason: 'missing_values' };
  }
  if (counts.some((count) => count < threshold)) {
    return { eligible: false, reason: 'below_threshold' };
  }
  return { eligible: true };
}

export function ModelsCircumplex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { signatures, defaultSignature, loading: signaturesLoading, error: signaturesError } = useAvailableSignatures();
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  const signatureParam = searchParams.get('signature');
  const modelsParam = searchParams.get('models');
  const nParam = searchParams.get('n');
  const methodologyParam = searchParams.get('methodology') === 'open' ? 'open' : 'closed';

  const selectedSignature = signatureParam ?? defaultSignature ?? 'vnewtd';
  const threshold = Math.max(1, Number.parseInt(nParam ?? '5', 10) || 5);
  const selectedModelIdsFromUrl = useMemo(() => parseCommaList(modelsParam), [modelsParam]);

  useEffect(() => {
    if (signatureParam == null && defaultSignature == null) return;
    const next = new URLSearchParams(searchParams);
    let changed = false;

    if (signatureParam == null && defaultSignature != null) {
      next.set('signature', defaultSignature);
      changed = true;
    }
    if (nParam == null) {
      next.set('n', '5');
      changed = true;
    }
    if (searchParams.get('methodology') == null) {
      next.set('methodology', 'closed');
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [defaultSignature, nParam, searchParams, setSearchParams, signatureParam]);

  const [{ data: rosterData, fetching: rosterLoading, error: rosterError }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });

  const roster = useMemo(() => rosterData?.llmModels ?? [], [rosterData?.llmModels]);
  const rosterIds = useMemo(() => roster.map((model) => model.id), [roster]);

  const circumplexVariables = useMemo<CircumplexAnalysisQueryVariables>(() => ({
    modelIds: rosterIds,
    signature: selectedSignature,
    minTrialsPerValue: threshold,
  }), [rosterIds, selectedSignature, threshold]);

  const circumplexReady = rosterIds.length > 0 && (signatureParam != null || defaultSignature != null);

  const [{ data: circumplexData, fetching: circumplexLoading, error: circumplexError }] = useQuery<CircumplexAnalysisQueryResult, CircumplexAnalysisQueryVariables>({
    query: CIRCUMPLEX_ANALYSIS_QUERY,
    variables: circumplexVariables,
    pause: !circumplexReady,
    requestPolicy: 'cache-and-network',
  });

  const analysis = circumplexData?.circumplexAnalysis ?? null;
  const analysisModels = useMemo(() => analysis?.models ?? [], [analysis?.models]);

  const evaluatedModels = useMemo(() => {
    return analysisModels
      .map((result) => ({ result, status: classifyResult(result, threshold) }))
      .sort((left, right) => left.result.modelLabel.localeCompare(right.result.modelLabel));
  }, [analysisModels, threshold]);

  const eligibleModels = useMemo(
    () => evaluatedModels.filter((entry): entry is { result: CircumplexResult; status: { eligible: true } } => entry.status.eligible),
    [evaluatedModels],
  );
  const insufficientModels = useMemo(
    () => evaluatedModels.filter((entry): entry is { result: CircumplexResult; status: { eligible: false; reason: 'no_transcripts_for_signature' | 'missing_values' | 'below_threshold' } } => !entry.status.eligible),
    [evaluatedModels],
  );

  const eligibleIds = useMemo(() => new Set(eligibleModels.map((entry) => entry.result.modelId)), [eligibleModels]);
  const orderMap = useMemo(() => new Map(eligibleModels.map((entry, index) => [entry.result.modelId, index] as const)), [eligibleModels]);

  const selectedModelIds = useMemo(
    () => normalizeSelection(selectedModelIdsFromUrl.filter((modelId) => eligibleIds.has(modelId)), orderMap),
    [eligibleIds, orderMap, selectedModelIdsFromUrl],
  );

  useEffect(() => {
    if (eligibleModels.length === 0) return;

    const current = selectedModelIdsFromUrl;
    const next = normalizeSelection(current.filter((modelId) => eligibleIds.has(modelId)), orderMap);
    const removed = current.filter((modelId) => !eligibleIds.has(modelId));

    if (current.length === 0) {
      const firstEligible = eligibleModels[0]?.result.modelId ?? null;
      if (firstEligible != null) {
        const params = new URLSearchParams(searchParams);
        params.set('models', firstEligible);
        setSearchParams(params, { replace: true });
      }
      return;
    }

    if (removed.length > 0) {
      const removedLabels = removed
        .map((modelId) => analysisModels.find((model) => model.modelId === modelId)?.modelLabel ?? modelId)
        .join(', ');
      setSelectionNotice(`${removed.length} model${removed.length === 1 ? '' : 's'} removed: ${removedLabels} fell below the n=${threshold} threshold`);

      const nextSelection = next.length > 0 ? next : [eligibleModels[0]!.result.modelId];
      const params = new URLSearchParams(searchParams);
      params.set('models', nextSelection.join(','));
      setSearchParams(params, { replace: true });
    }
  }, [analysisModels, eligibleIds, eligibleModels, orderMap, searchParams, selectedModelIdsFromUrl, setSearchParams, threshold]);

  const hiddenCount = Math.max(0, roster.length - eligibleModels.length);
  const modelById = useMemo(() => new Map(analysisModels.map((model) => [model.modelId, model] as const)), [analysisModels]);
  const selectedResults = selectedModelIds.map((modelId) => modelById.get(modelId)).filter((value): value is CircumplexResult => value != null);

  const loading = (signaturesLoading && signatures.length === 0)
    || (rosterLoading && roster.length === 0)
    || (circumplexLoading && circumplexData == null);

  const updateModelsParam = (nextIds: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (nextIds.length === 0) {
      params.delete('models');
    } else {
      params.set('models', nextIds.join(','));
    }
    setSelectionNotice(null);
    setSearchParams(params, { replace: true });
  };

  const handleToggleModel = (modelId: string) => {
    const next = selectedModelIds.includes(modelId)
      ? selectedModelIds.filter((id) => id !== modelId)
      : normalizeSelection([...selectedModelIds, modelId], orderMap);
    updateModelsParam(next);
  };

  const handleSelectAll = () => {
    const next = eligibleModels.map((entry) => entry.result.modelId);
    updateModelsParam(next);
  };

  const handleClearSelection = () => {
    updateModelsParam([]);
  };

  const handleSignatureChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('signature', value);
    setSelectionNotice(null);
    setSearchParams(params, { replace: true });
  };

  const handleThresholdChange = (value: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('n', String(value));
    setSelectionNotice(null);
    setSearchParams(params, { replace: true });
  };

  const signatureOptions = signatures.map((signature) => ({ value: signature, label: signature }));

  if (signaturesError != null || rosterError != null || circumplexError != null) {
    return (
      <ErrorMessage
        message={`Failed to load circumplex report: ${(signaturesError ?? rosterError ?? circumplexError)?.message ?? 'Unknown error'}`}
      />
    );
  }

  if (loading) {
    const loadingStage = (signaturesLoading && signatures.length === 0) || (rosterLoading && roster.length === 0)
      ? 'prepare'
      : 'analyze';

    return (
      <CircumplexLoadingProgress
        modelCount={rosterIds.length}
        signature={selectedSignature}
        stage={loadingStage}
        threshold={threshold}
      />
    );
  }

  const hasAnySignatureData = analysisModels.some((result) => result.trialsPerValue.some((entry) => entry.trials > 0));
  const noEligibleModels = eligibleModels.length === 0;
  const noSignatureData = !hasAnySignatureData && roster.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Models / Circumplex</h1>
        <p className="text-sm text-gray-600">
          Check whether a model&apos;s own pairwise choices form Schwartz&apos;s circumplex structure.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-full md:w-60">
            <Select
              label="Signature"
              options={signatureOptions}
              value={selectedSignature}
              onChange={handleSignatureChange}
              placeholder="Select signature"
            />
          </div>
          <CircumplexThresholdControl value={threshold} onChange={handleThresholdChange} />
          <CircumplexMethodologyPanel
            open={methodologyParam === 'open'}
            onToggleOpen={(open) => {
              const params = new URLSearchParams(searchParams);
              params.set('methodology', open ? 'open' : 'closed');
              setSearchParams(params, { replace: true });
            }}
          />
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Eligible models must have at least {threshold} trials on each of the 10 Schwartz values.
        </p>
      </section>

      {selectionNotice != null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-3">
            <div>{selectionNotice}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss notice"
              onClick={() => setSelectionNotice(null)}
              className="-mr-1 -mt-1 text-amber-900 hover:bg-amber-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {signatureOptions.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <p className="font-medium text-gray-900">No signatures are available yet.</p>
          <p className="mt-1">Once aggregate analysis data exists, this dropdown will populate automatically.</p>
        </section>
      ) : noSignatureData ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <p className="font-medium text-gray-900">No models have circumplex data for this signature.</p>
          <p className="mt-1">Try another signature from the dropdown above.</p>
        </section>
      ) : (
        <>
          <CircumplexModelPicker
            eligible={eligibleModels.map((entry) => entry.result)}
            insufficient={insufficientModels.map((entry) => {
              const status = entry.status;
              return {
                modelId: entry.result.modelId,
                modelLabel: entry.result.modelLabel,
                providerName: entry.result.providerName,
                reason: status.eligible ? 'below_threshold' : status.reason,
                trialsPerValue: entry.result.trialsPerValue,
              };
            })}
            selectedModelIds={selectedModelIds}
            onToggle={handleToggleModel}
            onSelectAll={handleSelectAll}
            onClear={handleClearSelection}
          />

          {hiddenCount > 0 && (
            <p className="text-sm text-gray-600">{hiddenCount} model{hiddenCount === 1 ? '' : 's'} hidden due to insufficient data.</p>
          )}

          {noEligibleModels ? (
            <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              <p className="font-medium text-gray-900">No models meet the current threshold.</p>
              <p className="mt-1">Lower the threshold to widen the picker.</p>
            </section>
          ) : selectedResults.length === 0 ? (
            <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              <p className="font-medium text-gray-900">Pick one or more models to see the circumplex panel.</p>
            </section>
          ) : (
            <div className="space-y-4">
              <CircumplexMdsScatter results={selectedResults} />
              <div data-testid="circumplex-model-card-stack" className="space-y-4">
                {selectedResults.map((result) => (
                  <CircumplexModelCard key={result.modelId} result={result} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
