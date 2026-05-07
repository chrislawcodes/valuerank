import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { AnalysisContextBar } from '../components/analysis/AnalysisContextBar';
import { Button } from '../components/ui/Button';
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
import {
  MODELS_STABILITY_QUERY,
  type ModelsStabilityQueryResult,
  type ModelsStabilityQueryVariables,
} from '../api/operations/modelsStability';
import { DominanceSection } from '../components/domains/DominanceSection';
import { PairwiseCellDrawer } from '../components/domains/PairwiseCellDrawer';
import { PairwiseWinRateMatrix } from '../components/domains/PairwiseWinRateMatrix';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import { DomainShiftsReportSection } from '../components/models/DomainShiftsReportSection';
import { WinRateStabilitySection } from '../components/models/WinRateStabilitySection';
import {
  VALUES,
  type ModelEntry,
  type ValueKey,
} from '../data/domainAnalysisData';
import { useDomains } from '../hooks/useDomains';
import { exportDomainTranscriptsAsCSV } from '../api/export';
import {
  formatSignatureOptionLabel,
  countAnalyzedTranscripts,
  getCacheStatusCopy,
  getSignaturePriority,
  parseTemperatureFromSignature,
} from '../utils/domainAnalysisUtils';

const ALL_DOMAINS_SCOPE = 'all-domains';

export function filterSelectedModels<T>(
  models: T[],
  selectedModelIds: string[],
  getModelId: (model: T) => string,
): T[] {
  if (selectedModelIds.length === 0) {
    return [];
  }

  const selected = new Set(selectedModelIds);
  return models.filter((model) => selected.has(getModelId(model)));
}

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
  const [openPair, setOpenPair] = useState<{ row: ValueKey; column: ValueKey } | null>(null);

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
  const [{ data: modelsAnalysisData, fetching: modelsAnalysisFetching, error: modelsAnalysisError }] = useQuery<
    ModelsAnalysisQueryResult,
    ModelsAnalysisQueryVariables
  >({
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
  const [{ data: modelsStabilityData, fetching: modelsStabilityFetching, error: modelsStabilityError }] = useQuery<
    ModelsStabilityQueryResult,
    ModelsStabilityQueryVariables
  >({
    query: MODELS_STABILITY_QUERY,
    variables: {
      ...(selectedScope === 'DOMAIN' && selectedDomainId !== '' ? { domainId: selectedDomainId } : {}),
      ...(selectedSignature !== '' ? { signature: selectedSignature } : {}),
    },
    pause: selectedScope === 'DOMAIN' && selectedDomainId === '',
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
  const transcriptCount = useMemo(
    () => countAnalyzedTranscripts(data?.domainAnalysis.models ?? [], selectedModelIds),
    [data?.domainAnalysis.models, selectedModelIds],
  );
  const cacheStatusCopy = useMemo(
    () => getCacheStatusCopy(data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt, transcriptCount),
    [data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt, transcriptCount],
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
      const totalComparisons = model.values.reduce((sum, value) => sum + value.totalComparisons, 0);
      return {
        model: model.model,
        label: model.label,
        values,
        winRates,
        stabilityScores,
        totalTrials: Math.round(totalComparisons / 2),
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

  const modelOptions = useMemo(
    () => models.map((model) => ({
      value: model.model,
      label: model.label,
      isDefault: defaultSelection.includes(model.model),
    })),
    [defaultSelection, models],
  );

  const selectedModels = useMemo(
    () => filterSelectedModels(models, selectedModelIds, (model) => model.model),
    [models, selectedModelIds],
  );
  const selectedModelId = selectedModelIds.length === 1 ? (selectedModelIds[0] ?? null) : null;
  const selectedDomainIdForDrawer = !isAllDomains && selectedDomainId !== '' ? selectedDomainId : null;
  const selectedSignatureForDrawer = selectedSignature !== '' ? selectedSignature : null;

  useEffect(() => {
    setOpenPair(null);
  }, [selectedDomainIdForDrawer, selectedModelId, selectedSignatureForDrawer]);

  const visiblePairwiseModels = useMemo(
    () => filterSelectedModels(data?.domainAnalysis.models ?? [], selectedModelIds, (model) => model.model),
    [data?.domainAnalysis.models, selectedModelIds],
  );
  const visibleStabilityModels = useMemo(
    () => filterSelectedModels(modelsStabilityData?.modelsWinRateStability.models ?? [], selectedModelIds, (model) => model.modelId),
    [modelsStabilityData?.modelsWinRateStability.models, selectedModelIds],
  );

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
      <AnalysisContextBar
        domain={{
          label: 'Domain',
          value: isAllDomains ? ALL_DOMAINS_SCOPE : selectedDomainId,
          options: [
            { value: ALL_DOMAINS_SCOPE, label: 'All domains' },
            ...domains.map((domain) => ({ value: domain.id, label: domain.name })),
          ],
          onChange: (value) => {
            if (value === ALL_DOMAINS_SCOPE) {
              setSelectedScope('ALL_DOMAINS');
              return;
            }
            setSelectedScope('DOMAIN');
            setSelectedDomainId(value);
          },
          disabled: domainsLoading || (domains.length === 0 && !isAllDomains),
        }}
        signature={{
          label: 'Signature',
          value: selectedSignature,
          options:
            signatureOptions.length === 0
              ? [{ value: '', label: 'No signatures with completed runs', disabled: true }]
              : signatureOptions.map((opt) => ({
                value: opt.signature,
                label: formatSignatureOptionLabel(opt),
              })),
          onChange: (value) => setSelectedSignature(value),
          disabled: signaturesLoading || signatureOptions.length === 0,
        }}
        models={{
          label: 'Models',
          selectedModelIds,
          defaultModelIds: defaultSelection,
          options: modelOptions,
          onChange: setSelectedModelIds,
        }}
      />

      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Win Rate</h1>
      </div>

      {exportError !== null && <p className="mt-1 text-xs text-amber-700">{exportError}</p>}
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

      {data?.domainAnalysis != null && cacheStatusCopy != null && (
        <div className="space-y-1 text-xs text-gray-500">
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
          {refreshNotice !== null && <p className="text-green-700">{refreshNotice}</p>}
          {refreshError !== null && <p className="text-amber-700">{refreshError}</p>}
        </div>
      )}

      {(domainsError != null || signaturesError != null || error != null) && (
        <ErrorMessage message={`Failed to load win rate page: ${(domainsError ?? signaturesError ?? error)?.message ?? 'Unknown error'}`} />
      )}

      {showPageLoader ? (
        <Loading size="lg" text="Loading win rate page..." />
      ) : (
        <>
          <ValuePrioritiesSection
            models={selectedModels}
            selectedDomainId={selectedDomainId}
            selectedSignature={selectedSignature === '' ? null : selectedSignature}
            isReadOnly={isAllDomains}
            showStabilityDots
          />
          <DominanceSection
            models={selectedModels}
          />
          <PairwiseWinRateMatrix
            models={visiblePairwiseModels}
            selectedModelId={selectedModelId}
            domainId={selectedDomainIdForDrawer}
            signature={selectedSignatureForDrawer}
            onCellClick={(row, column) => setOpenPair({ row, column })}
          />

          <DomainShiftsReportSection
            models={modelsAnalysisData?.modelsAnalysis.models ?? []}
            selectedModelIds={selectedModelIds}
            defaultModelIds={defaultSelection}
            fetching={modelsAnalysisFetching}
            errorMessage={modelsAnalysisError?.message ?? null}
          />
          <WinRateStabilitySection
            models={visibleStabilityModels}
            skippedVignettes={modelsStabilityData?.modelsWinRateStability.skippedVignettes ?? []}
            fetching={modelsStabilityFetching}
            errorMessage={modelsStabilityError?.message ?? null}
          />
        </>
      )}

      <PairwiseCellDrawer
        open={openPair !== null}
        rowValueKey={openPair?.row ?? null}
        columnValueKey={openPair?.column ?? null}
        modelId={selectedModelId}
        domainId={selectedDomainIdForDrawer}
        signature={selectedSignatureForDrawer}
        onClose={() => setOpenPair(null)}
      />

    </div>
  );
}
