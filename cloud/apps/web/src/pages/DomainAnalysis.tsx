import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  REFRESH_DOMAIN_ANALYSIS_MUTATION,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
  type DomainAvailableSignaturesQueryVariables,
  type DomainAnalysisQueryResult,
  type DomainAnalysisQueryVariables,
  type RefreshDomainAnalysisMutationResult,
  type RefreshDomainAnalysisMutationVariables,
} from '../api/operations/domainAnalysis';
import {
  MODELS_ANALYSIS_QUERY,
  type ModelsAnalysisQueryResult,
  type ModelsAnalysisQueryVariables,
} from '../api/operations/modelsAnalysis';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { ModelGroupsSection } from '../components/domains/ModelGroupsSection';
import { DominanceSection } from '../components/domains/DominanceSection';
import { SimilaritySection } from '../components/domains/SimilaritySection';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import {
  VALUES,
  type ModelEntry,
  type ValueKey,
} from '../data/domainAnalysisData';
import { useDomains } from '../hooks/useDomains';
import { exportDomainTranscriptsAsCSV } from '../api/export';
import {
  formatSignatureOptionLabel,
  getCacheStatusCopy,
  getSignaturePriority,
  parseTemperatureFromSignature,
} from '../utils/domainAnalysisUtils';

const ALL_DOMAINS_SCOPE = 'all-domains';

export function DomainAnalysis() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const initialDomainId = searchParams.get('domainId') ?? '';
  const [selectedScope, setSelectedScope] = useState<'DOMAIN' | 'ALL_DOMAINS'>(
    searchParams.get('scope') === ALL_DOMAINS_SCOPE || initialDomainId.trim() === '' ? 'ALL_DOMAINS' : 'DOMAIN',
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string>(initialDomainId);
  const [selectedSignature, setSelectedSignature] = useState<string>(searchParams.get('signature') ?? '');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const initializedModelSelection = useRef(false);
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult, DomainAvailableSignaturesQueryVariables
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: {
      domainId: selectedDomainId === '' ? domains[0]?.id ?? '' : selectedDomainId,
      scope: selectedScope === 'ALL_DOMAINS' ? ALL_DOMAINS_SCOPE : undefined,
    },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const signatureOptions = useMemo<DomainAvailableSignature[]>(() => {
    const options = signatureData?.domainAvailableSignatures ?? [];
    return options
      .map((option, index) => ({ option, index }))
      .sort((a, b) => {
        const p = getSignaturePriority(a.option) - getSignaturePriority(b.option);
        return p !== 0 ? p : a.index - b.index;
      })
      .map(({ option }) => option);
  }, [signatureData]);

  useEffect(() => {
    if (domains.length === 0) return;
    if (selectedDomainId !== '' && domains.some((d) => d.id === selectedDomainId)) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (signatureOptions.length === 0) { setSelectedSignature(''); return; }
    if (selectedSignature !== '' && signatureOptions.some((o) => o.signature === selectedSignature)) return;
    setSelectedSignature(signatureOptions[0]?.signature ?? '');
  }, [selectedSignature, signatureOptions]);

  useEffect(() => { setExportError(null); }, [selectedDomainId, selectedSignature]);

  useEffect(() => {
    setRefreshNotice(null);
    setRefreshError(null);
  }, [selectedDomainId, selectedSignature]);

  useEffect(() => {
    const currentScope = searchParams.get('scope') === ALL_DOMAINS_SCOPE ? 'ALL_DOMAINS' : 'DOMAIN';
    const nextDomainId = selectedDomainId !== '' ? selectedDomainId : (domains[0]?.id ?? '');
    if (nextDomainId === '' && selectedScope === 'DOMAIN') return;
    if (
      searchParams.get('domainId') === nextDomainId
      && (searchParams.get('signature') ?? '') === selectedSignature
      && currentScope === selectedScope
    ) return;
    const next = new URLSearchParams(searchParams);
    if (nextDomainId !== '') next.set('domainId', nextDomainId);
    else next.delete('domainId');
    if (selectedScope === 'ALL_DOMAINS') next.set('scope', ALL_DOMAINS_SCOPE);
    else next.delete('scope');
    if (selectedSignature === '') next.delete('signature');
    else next.set('signature', selectedSignature);
    setSearchParams(next, { replace: true });
  }, [domains, searchParams, selectedDomainId, selectedSignature, selectedScope, setSearchParams]);

  const activeUseLegacyQuery = useLegacyQuery && selectedScope !== 'ALL_DOMAINS';
  const [
    { data: scoredData, fetching: scoredFetching, error: scoredError },
    reexecuteScoredQuery,
  ] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: {
      domainId: selectedDomainId === '' ? domains[0]?.id ?? '' : selectedDomainId,
      scope: selectedScope === 'ALL_DOMAINS' ? ALL_DOMAINS_SCOPE : undefined,
      signature: selectedSignature === '' ? undefined : selectedSignature,
    },
    pause: selectedDomainId === '' || activeUseLegacyQuery,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<DomainAnalysisQueryResult, { domainId: string }>({
    query: DOMAIN_ANALYSIS_QUERY_LEGACY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '' || !activeUseLegacyQuery,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: modelsAnalysisData }] = useQuery<ModelsAnalysisQueryResult, ModelsAnalysisQueryVariables>({
    query: MODELS_ANALYSIS_QUERY,
    variables: {
      ...(selectedScope === 'DOMAIN' && selectedDomainId !== '' ? { domainId: selectedDomainId } : {}),
      ...(selectedSignature !== '' ? { signature: selectedSignature } : {}),
    },
    pause: selectedScope === 'DOMAIN' && selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });
  const [{ data: llmModelsData }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });
  const [{ fetching: refreshFetching }, refreshDomainAnalysis] = useMutation<
    RefreshDomainAnalysisMutationResult,
    RefreshDomainAnalysisMutationVariables
  >(REFRESH_DOMAIN_ANALYSIS_MUTATION);

  useEffect(() => {
    const message = scoredError?.message ?? '';
    const isFieldError = message.includes('Unknown argument "signature"')
      || message.includes('Cannot query field')
      || message.includes('Unknown field');
    if (isFieldError && !useLegacyQuery && selectedScope !== 'ALL_DOMAINS') setUseLegacyQuery(true);
  }, [scoredError, selectedScope, useLegacyQuery]);

  const data = activeUseLegacyQuery ? legacyData : scoredData;
  const fetching = activeUseLegacyQuery ? legacyFetching : scoredFetching;
  const error = activeUseLegacyQuery ? legacyError : scoredError;
  const cacheStatusCopy = useMemo(
    () => getCacheStatusCopy(data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt),
    [data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt],
  );
  const showPageLoader = domainsLoading || (selectedDomainId !== '' && data?.domainAnalysis == null && fetching);
  const isAllDomains = selectedScope === 'ALL_DOMAINS';

  const models = useMemo<ModelEntry[]>(() => {
    const sourceModels = data?.domainAnalysis.models ?? [];
    const pooledWinRatesByModel = new Map<string, Map<string, number | null>>(
      (modelsAnalysisData?.modelsAnalysis.models ?? []).map((model) => [
        model.modelId,
        new Map(model.values.map((value) => [value.valueKey, value.pooledWinRate])),
      ]),
    );
    const stabilityScoresByModel = new Map<string, Map<string, number | null>>(
      (modelsAnalysisData?.modelsAnalysis.models ?? []).map((model) => [
        model.modelId,
        new Map(model.values.map((value) => [value.valueKey, value.stabilityScore] as const)),
      ]),
    );

    return sourceModels.map((model) => {
      const valueMap = new Map(model.values.map((e) => [e.valueKey, e.score]));
      const winRateMap = new Map(model.values.map((e) => [
        e.valueKey,
        pooledWinRatesByModel.get(model.model)?.get(e.valueKey) ?? null,
      ] as const));
      const values = VALUES.reduce<Record<ValueKey, number>>((acc, valueKey) => {
        acc[valueKey] = valueMap.get(valueKey) ?? 0;
        return acc;
      }, {} as Record<ValueKey, number>);
      const winRates = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
        acc[valueKey] = winRateMap.get(valueKey) ?? null;
        return acc;
      }, {} as Record<ValueKey, number | null>);
      const stabilityScores = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
        acc[valueKey] = stabilityScoresByModel.get(model.model)?.get(valueKey) ?? null;
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
  }, [data, modelsAnalysisData]);
  const defaultModelIds = useMemo(
    () => new Set((llmModelsData?.llmModels ?? []).filter((m) => m.isDefault).map((m) => m.modelId)),
    [llmModelsData],
  );

  const defaultSelection = useMemo(() => {
    const availableIds = models.map((model) => model.model);
    const defaults = availableIds.filter((id) => defaultModelIds.has(id));
    return defaults.length > 0 ? defaults : availableIds;
  }, [models, defaultModelIds]);

  useEffect(() => {
    if (initializedModelSelection.current) return;
    if (models.length === 0) return;
    if (llmModelsData == null) return;
    setSelectedModelIds(defaultSelection);
    initializedModelSelection.current = true;
  }, [models, llmModelsData, defaultSelection]);

  useEffect(() => {
    if (!initializedModelSelection.current) return;
    setSelectedModelIds((current) => {
      if (current.length === 0) return current;
      const validIds = new Set(models.map((model) => model.model));
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [models]);

  const isDefaultSelection = useMemo(() => {
    if (selectedModelIds.length !== defaultSelection.length) return false;
    const defaultSet = new Set(defaultSelection);
    return selectedModelIds.every((id) => defaultSet.has(id));
  }, [selectedModelIds, defaultSelection]);

  const visibleModels = useMemo(
    () => selectedModelIds.length === 0 ? models : models.filter((model) => selectedModelIds.includes(model.model)),
    [models, selectedModelIds],
  );

  const singleSelectedModelId = selectedModelIds.length === 1 ? (selectedModelIds[0] ?? null) : null;

  const modelSetSummary = models.length === 0
    ? 'No models available'
    : isDefaultSelection
      ? `Default — ${selectedModelIds.length} model${selectedModelIds.length === 1 ? '' : 's'}`
      : selectedModelIds.length === models.length
        ? 'All models'
        : `${selectedModelIds.length} of ${models.length} selected`;

  const toggleModelId = (modelId: string) => {
    setSelectedModelIds((current) => (
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
    ));
  };

  const missingDefinitionCount = data?.domainAnalysis.missingDefinitions?.length ?? 0;
  const allMissingDefinitionIds = useMemo(
    () => (data?.domainAnalysis.missingDefinitions ?? []).map((m) => m.definitionId),
    [data?.domainAnalysis.missingDefinitions],
  );

  const handleExport = async () => {
    if (selectedDomainId === '' || isAllDomains) return;
    setExportLoading(true);
    setExportError(null);
    try {
      await exportDomainTranscriptsAsCSV(selectedDomainId, selectedSignature !== '' ? selectedSignature : undefined);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRefreshAnalysis = async () => {
    if (selectedDomainId === '' || isAllDomains) return;
    setRefreshNotice(null);
    setRefreshError(null);

    const result = await refreshDomainAnalysis({
      domainId: selectedDomainId,
      signature: selectedSignature === '' ? undefined : selectedSignature,
    });

    if (result.error != null) {
      setRefreshError(result.error.message);
      return;
    }

    setRefreshNotice(result.data?.refreshDomainAnalysis.message ?? 'Refresh started.');
    reexecuteScoredQuery({ requestPolicy: 'network-only' });
  };

  const handleRunMissingVignettes = () => {
    if (selectedDomainId === '' || allMissingDefinitionIds.length === 0 || isAllDomains) return;
    const query = new URLSearchParams();
    query.set('definitionIds', allMissingDefinitionIds.join(','));
    if (selectedSignature !== '') {
      query.set('signature', selectedSignature);
      const t = parseTemperatureFromSignature(selectedSignature);
      if (t !== null) query.set('temperature', String(t));
    }
    navigate(`/domains/status/${selectedDomainId}?${query.toString()}`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Domain Selection</h2>
            <p className="text-xs text-gray-600">
              {isAllDomains
                ? 'Cross-domain analysis is read-only and pools every visible domain that matches the selected signature.'
                : 'Analysis is shown from the latest saved snapshot for this domain.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="min-w-[210px]">
              <Select
                label="Domain scope"
                options={[
                  { value: ALL_DOMAINS_SCOPE, label: 'All domains' },
                  ...domains.map((domain) => ({ value: domain.id, label: domain.name })),
                ]}
                value={isAllDomains ? ALL_DOMAINS_SCOPE : selectedDomainId}
                onChange={(value) => {
                  if (value === ALL_DOMAINS_SCOPE) {
                    setSelectedScope('ALL_DOMAINS');
                    return;
                  }
                  setSelectedScope('DOMAIN');
                  setSelectedDomainId(value);
                }}
                disabled={domainsLoading || (domains.length === 0 && !isAllDomains)}
              />
            </div>
            <div className="min-w-[210px]">
              <Select
                label="Signature"
                options={
                  signatureOptions.length === 0
                    ? [{ value: '', label: 'No signatures with completed runs', disabled: true }]
                    : signatureOptions.map((opt) => ({
                      value: opt.signature,
                      label: formatSignatureOptionLabel(opt),
                    }))
                }
                value={selectedSignature}
                onChange={(value) => setSelectedSignature(value)}
                disabled={signaturesLoading || signatureOptions.length === 0}
              />
            </div>
            <details className="min-w-[210px]">
              <summary className="cursor-pointer list-none">
                <p className="mb-1 text-sm font-medium text-gray-700">Model focus</p>
                <div className="inline-flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-h-[44px] hover:border-gray-400 sm:min-h-0">
                  <span className={models.length === 0 ? 'text-gray-400' : ''}>{modelSetSummary}</span>
                  <span className="ml-2 text-gray-400">▾</span>
                </div>
              </summary>
              <div className="mt-1 space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedModelIds(defaultSelection)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-0 ${
                      isDefaultSelection
                        ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:text-teal-700 hover:bg-white'
                    }`}
                  >
                    Default Models
                  </Button>
                  {models.map((model) => {
                    const isSelected = selectedModelIds.includes(model.model);
                    return (
                      <Button
                        key={model.model}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleModelId(model.model)}
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
                </div>
              </div>
            </details>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={selectedDomainId === '' || exportLoading || isAllDomains}
              title={isAllDomains ? 'CSV export is unavailable in All domains mode' : undefined}
            >
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
          {exportError !== null && <p className="mt-1 text-xs text-amber-700">{exportError}</p>}
        </div>
        {singleSelectedModelId !== null && (
          <p className="mt-2 text-xs text-gray-500">
            Showing only {models.find((model) => model.model === singleSelectedModelId)?.label ?? 'the selected model'} across all tables.
          </p>
        )}
        {data?.domainAnalysis != null && missingDefinitionCount > 0 && !isAllDomains && (
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-amber-700">Analysis filter excluded {missingDefinitionCount} vignette{missingDefinitionCount === 1 ? '' : 's'}.</p>
                <Button type="button" variant="secondary" size="sm" onClick={handleRunMissingVignettes} disabled={allMissingDefinitionIds.length === 0}>
                  Run Missing Vignettes
                </Button>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-amber-800">
                {(data.domainAnalysis.missingDefinitions ?? []).map((m) => (
                  <li key={m.definitionId}>
                    {m.definitionName} ({m.definitionId}) - {m.reasonLabel} - AIs: {m.missingAllModels ? 'All AIs' : m.missingModelLabels.join(', ')}
                  </li>
                ))}
              </ul>
            </>
          </div>
        )}
      </section>

      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Findings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Structured domain interpretation across priorities, ranking behavior, and similarity for the selected domain.
        </p>
        {data?.domainAnalysis != null && cacheStatusCopy != null && (
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${cacheStatusCopy.badgeClassName}`}>
                {cacheStatusCopy.badgeLabel}
              </span>
              <span>{cacheStatusCopy.detail}</span>
              {!activeUseLegacyQuery && !isAllDomains && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-auto px-2.5 py-1 text-xs"
                  onClick={handleRefreshAnalysis}
                  disabled={refreshFetching}
                >
                  {refreshFetching ? 'Refreshing\u2026' : 'Refresh now'}
                </Button>
              )}
            </div>
            {refreshNotice !== null && <p className="text-green-700">{refreshNotice}</p>}
            {refreshError !== null && <p className="text-amber-700">{refreshError}</p>}
          </div>
        )}
      </div>

      {(domainsError != null || signaturesError != null || error != null) && (
        <ErrorMessage message={`Failed to load domain analysis: ${(domainsError ?? signaturesError ?? error)?.message ?? 'Unknown error'}`} />
      )}

      {showPageLoader ? (
        <Loading size="lg" text="Loading domain analysis..." />
      ) : (
        <>
          <ModelGroupsSection clusterAnalysis={data?.domainAnalysis.clusterAnalysis} selectedModelId={singleSelectedModelId} />
          <ValuePrioritiesSection
            models={visibleModels}
            selectedDomainId={selectedDomainId}
            selectedSignature={selectedSignature === '' ? null : selectedSignature}
            isReadOnly={isAllDomains}
            showStabilityDots
          />
          <DominanceSection
            models={models}
            defaultModelIds={defaultModelIds}
          />
          <SimilaritySection models={visibleModels} />
        </>
      )}

    </div>
  );
}
