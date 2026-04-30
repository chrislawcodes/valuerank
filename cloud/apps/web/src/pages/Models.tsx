import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { ScreenshotButton } from '../components/ui/ScreenshotButton';
import { useDomains } from '../hooks/useDomains';
import {
  DOMAIN_ANALYSIS_QUERY,
  type DomainAnalysisQueryResult,
  type DomainAnalysisQueryVariables,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  type DomainAvailableSignaturesQueryResult,
} from '../api/operations/domainAnalysis';
import {
  MODELS_ANALYSIS_QUERY,
  type ModelsAnalysisQueryResult,
  type ModelsAnalysisQueryVariables,
  type ModelsAnalysisValueResult,
} from '../api/operations/modelsAnalysis';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { ModelValueDetailDrawer } from '../components/models/ModelValueDetailDrawer';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import { ModelsMatrix } from '../components/models/ModelsMatrix';
import { VALUES, type ModelEntry, type ValueKey } from '../data/domainAnalysisData';
import { formatSignatureOptionLabel } from '../utils/domainAnalysisUtils';

const DEFAULT_SIGNATURE = 'vnewtd';
const ALL_DOMAINS_SCOPE = 'all-domains';

export function Models() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const reportRef = useRef<HTMLDivElement>(null);

  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [selectedSignature, setSelectedSignature] = useState<string>(DEFAULT_SIGNATURE);

  const [{ data: signatureData }] = useQuery<DomainAvailableSignaturesQueryResult, { domainId: string }>({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId: selectedDomainId ?? '' },
    pause: selectedDomainId == null,
    requestPolicy: 'cache-and-network',
  });

  const signatureOptions = useMemo(
    () => signatureData?.domainAvailableSignatures ?? [],
    [signatureData],
  );

  const allDomainsDomainId = domains[0]?.id ?? '';

  const [{ data: allDomainsData, fetching: allDomainsFetching, error: allDomainsError }] = useQuery<
    DomainAnalysisQueryResult,
    DomainAnalysisQueryVariables
  >({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: {
      domainId: allDomainsDomainId,
      scope: ALL_DOMAINS_SCOPE,
      scoreMethod: 'FULL_BT',
      signature: selectedSignature,
    },
    pause: allDomainsDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  // Reset to default when domain changes; keep valid selection if it exists in new options.
  useEffect(() => {
    setSelectedSignature(DEFAULT_SIGNATURE);
  }, [selectedDomainId]);

  // Memoized to keep the object reference stable across renders.
  // If new query inputs are added, update the dependency array here too.
  const queryVariables = useMemo(
    () => ({
      ...(selectedDomainId != null ? { domainId: selectedDomainId } : {}),
      signature: selectedSignature,
    }),
    [selectedDomainId, selectedSignature],
  );
  const [{ data: modelsAnalysisData, fetching, error }] = useQuery<ModelsAnalysisQueryResult, ModelsAnalysisQueryVariables>({
    query: MODELS_ANALYSIS_QUERY,
    variables: queryVariables,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: llmModelsData }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ modelId: string; valueKey: string } | null>(null);
  const initializedModelSelection = useRef(false);

  const comparisonModels = useMemo(() => modelsAnalysisData?.modelsAnalysis.models ?? [], [modelsAnalysisData]);
  const defaultModelIds = useMemo(
    () => new Set((llmModelsData?.llmModels ?? []).filter((m) => m.isDefault).map((m) => m.modelId)),
    [llmModelsData],
  );
  const selectedDomain = selectedDomainId != null ? domains.find((domain) => domain.id === selectedDomainId) ?? null : null;
  const singleDomainActive = selectedDomainId != null;

  useEffect(() => {
    if (selectedDomainId == null) return;
    if (domains.some((domain) => domain.id === selectedDomainId)) return;
    setSelectedDomainId(null);
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (initializedModelSelection.current) return;
    if (comparisonModels.length === 0) return;
    if (llmModelsData == null) return;
    const availableIds = comparisonModels.map((model) => model.modelId);
    const defaultSelection = availableIds.filter((id) => defaultModelIds.has(id));
    // Fall back to all models if no defaults are configured or none match the current result set
    setSelectedModelIds(defaultSelection.length > 0 ? defaultSelection : availableIds);
    initializedModelSelection.current = true;
  }, [comparisonModels, llmModelsData, defaultModelIds]);

  useEffect(() => {
    if (!initializedModelSelection.current) return;
    setSelectedModelIds((current) => {
      if (current.length === 0) return current;
      const validIds = new Set(comparisonModels.map((model) => model.modelId));
      const next = current.filter((modelId) => validIds.has(modelId));
      return next.length === current.length ? current : next;
    });
  }, [comparisonModels]);

  // Close the drawer when its model is no longer visible (filtered out or cleared)
  useEffect(() => {
    if (selectedCell == null) return;
    if (!selectedModelIds.includes(selectedCell.modelId)) {
      setSelectedCell(null);
    }
  }, [selectedModelIds, selectedCell]);

  const modelOptions = useMemo(() => comparisonModels.map((model) => ({
    value: model.modelId,
    label: model.label,
  })), [comparisonModels]);

  const domainOptions = useMemo(() => [
    { value: 'all', label: 'All domains' },
    ...domains.map((domain) => ({
      value: domain.id,
      label: `${domain.name}`,
    })),
  ], [domains]);

  const selectedModel = selectedCell != null
    ? comparisonModels.find((model) => model.modelId === selectedCell.modelId) ?? null
    : null;
  const selectedValue: ModelsAnalysisValueResult | null = useMemo(() => {
    if (selectedCell == null || selectedModel == null) return null;
    return selectedModel.values.find((value) => value.valueKey === selectedCell.valueKey) ?? null;
  }, [selectedCell, selectedModel]);

  const comparisonModelMap = useMemo(
    () => new Map(comparisonModels.map((model) => [model.modelId, model] as const)),
    [comparisonModels],
  );

  const allDomainsModels = useMemo<ModelEntry[]>(() => {
    const sourceModels = allDomainsData?.domainAnalysis.models ?? [];
    const pooledWinRatesByModel = new Map<string, Map<string, number | null>>(
      (modelsAnalysisData?.modelsAnalysis.models ?? []).map((model) => [
        model.modelId,
        new Map(model.values.map((value) => [value.valueKey, value.pooledWinRate])),
      ]),
    );

    return sourceModels.map((model) => {
      const comparisonModel = comparisonModelMap.get(model.model);
      const comparisonValueMap = new Map(comparisonModel?.values.map((value) => [value.valueKey, value.stabilityScore] as const) ?? []);

      const values = VALUES.reduce<Record<ValueKey, number>>((acc, valueKey) => {
        const score = model.values.find((value) => value.valueKey === valueKey)?.score ?? 0;
        acc[valueKey] = score;
        return acc;
      }, {} as Record<ValueKey, number>);

      const winRates = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
        acc[valueKey] = pooledWinRatesByModel.get(model.model)?.get(valueKey) ?? null;
        return acc;
      }, {} as Record<ValueKey, number | null>);

      const stabilityScores = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
        acc[valueKey] = comparisonValueMap.get(valueKey) ?? null;
        return acc;
      }, {} as Record<ValueKey, number | null>);

      return {
        model: model.model,
        label: model.label,
        values,
        winRates,
        stabilityScores,
      };
    });
  }, [allDomainsData, comparisonModelMap, modelsAnalysisData]);

  const defaultSelection = useMemo(() => {
    const availableIds = comparisonModels.map((model) => model.modelId);
    const defaults = availableIds.filter((id) => defaultModelIds.has(id));
    return defaults.length > 0 ? defaults : availableIds;
  }, [comparisonModels, defaultModelIds]);

  const isDefaultSelection = useMemo(() => {
    if (selectedModelIds.length !== defaultSelection.length) return false;
    const defaultSet = new Set(defaultSelection);
    return selectedModelIds.every((id) => defaultSet.has(id));
  }, [selectedModelIds, defaultSelection]);

  const loading = (domainsLoading && domains.length === 0)
    || (allDomainsFetching && allDomainsData == null)
    || (fetching && modelsAnalysisData == null);
  const selectedModelCount = selectedModelIds.length;

  const toggleModelId = (modelId: string) => {
    setSelectedModelIds((current) => (
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
    ));
  };

  const selectAllModels = () => {
    setSelectedModelIds(comparisonModels.map((model) => model.modelId));
  };

  const clearModels = () => {
    setSelectedModelIds([]);
  };

  const handleCellClick = (modelId: string, valueKey: string) => {
    setSelectedCell({ modelId, valueKey });
  };

  const modelSetSummary = loading
    ? 'Loading...'
    : modelOptions.length === 0
      ? 'No models available'
      : isDefaultSelection
        ? `Default — ${selectedModelCount} models selected`
        : selectedModelCount === modelOptions.length
          ? 'All selected'
          : `${selectedModelCount} of ${modelOptions.length} selected`;

  return (
    <div ref={reportRef} className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Model Value Preference overview</h1>
            <p className="text-sm text-gray-600">
              Compare model preferences by value and scan whether each pattern stays steady across domains.
            </p>
          </div>
          <ScreenshotButton targetRef={reportRef} label="report" />
        </div>
      </div>

      {(domainsError != null || allDomainsError != null || error != null) && (
        <ErrorMessage
          message={`Failed to load models analysis: ${(domainsError ?? allDomainsError ?? error)?.message ?? 'Unknown error'}`}
        />
      )}

      {!loading && (
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">All domains value priorities</h2>
                <p className="text-sm text-gray-600">
                  This is the domain analysis table for all domains, with stability circles added to each cell.
                </p>
              </div>
            </div>
            <ValuePrioritiesSection
              models={allDomainsModels}
              selectedDomainId=""
              selectedSignature={null}
              isReadOnly
              showStabilityDots
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Model preference table</h2>
                <p className="text-sm text-gray-600">
                  Keep this table underneath for comparison with the current model analysis view.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-48 flex-shrink-0">
                <Select
                  label="Domain scope"
                  options={domainOptions}
                  value={selectedDomainId ?? 'all'}
                  onChange={(value) => setSelectedDomainId(value === 'all' ? null : value)}
                  placeholder="All domains"
                />
              </div>
              {selectedDomainId != null && signatureOptions.length > 0 && (
                <div className="w-48 flex-shrink-0">
                  <Select
                    label="Batch"
                    options={signatureOptions.map((o) => ({ value: o.signature, label: formatSignatureOptionLabel(o) }))}
                    value={selectedSignature}
                    onChange={(value) => setSelectedSignature(value)}
                  />
                </div>
              )}
              <details className="flex-1 min-w-[220px]">
                <summary className="cursor-pointer list-none">
                  <p className="mb-1 text-sm font-medium text-gray-700">Model set</p>
                  <div className="inline-flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-h-[44px] hover:border-gray-400 sm:min-h-0">
                    <span className={modelOptions.length === 0 && !loading ? 'text-gray-400' : ''}>
                      {modelSetSummary}
                    </span>
                    <span className="ml-2 text-gray-400">▾</span>
                  </div>
                </summary>
                <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-gray-600">All visible models are selected by default.</p>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={selectAllModels} disabled={loading}>
                        Select all
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={clearModels} disabled={loading}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {modelOptions.map((model) => {
                      const isSelected = selectedModelIds.includes(model.value);
                      return (
                        <Button
                          key={model.value}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleModelId(model.value)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-0 ${
                            isSelected
                              ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:text-teal-700 hover:bg-white'
                          }`}
                          title={model.label}
                        >
                          {model.label}
                        </Button>
                      );
                    })}
                    {modelOptions.length === 0 && !loading && (
                      <span className="text-sm text-gray-500">No active models are available.</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {loading
                      ? 'Loading models and domains...'
                      : modelOptions.length === 0
                        ? 'No active models are available.'
                        : selectedModelCount === modelOptions.length
                          ? 'All visible models selected.'
                          : `${selectedModelCount} of ${modelOptions.length} visible models selected.`}
                    {singleDomainActive && selectedDomain != null && (
                      <span className="ml-2">Viewing {selectedDomain.name} only.</span>
                    )}
                  </div>
                </div>
              </details>
            </div>

            <div className="mt-5">
              <ModelsMatrix
                models={comparisonModels}
                selectedModelIds={selectedModelIds}
                singleDomainActive={singleDomainActive}
                selectedCellKey={selectedCell == null ? null : `${selectedCell.modelId}:${selectedCell.valueKey}`}
                onCellClick={handleCellClick}
              />
            </div>
          </section>
        </div>
      )}

      <ModelValueDetailDrawer
        open={selectedCell != null}
        model={selectedModel}
        value={selectedValue}
        onClose={() => setSelectedCell(null)}
      />
    </div>
  );
}
