import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { useSearchParams } from 'react-router-dom';
import { AnalysisContextBar } from '../components/analysis/AnalysisContextBar';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  type DomainAnalysisQueryResult,
  type DomainAnalysisQueryVariables,
  type DomainAnalysisModel,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
  type DomainAvailableSignaturesQueryVariables,
} from '../api/operations/domainAnalysis';
import {
  MODELS_ANALYSIS_QUERY,
  type ModelsAnalysisModelResult,
  type ModelsAnalysisQueryResult,
  type ModelsAnalysisQueryVariables,
} from '../api/operations/modelsAnalysis';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import { type ClusterAnalysis } from '../api/operations/domainAnalysis';
import {
  ModelAgreementClusterAnalysisDocument,
  type ModelAgreementClusterAnalysisQuery,
  type ModelAgreementClusterAnalysisQueryVariables,
  useModelAgreementOnTradeoffsQuery,
} from '../generated/graphql';
import { ModelGroupsSection } from '../components/domains/ModelGroupsSection';
import { ModelAnalysisSettingsBar } from '../components/models/ModelAnalysisSettingsBar';
import { ModelSimilarityTableSection } from '../components/models/ModelSimilarityTableSection';
import { ModelAgreementSection } from '../components/models/ModelAgreementSection';
import { type CalculationMethod, type PairwiseKappaEntry } from '../components/models/ModelSimilarityMetrics';
import { type AgreementStatus } from '../components/domains/clusterVisualizationUtils';
import { useDomains } from '../hooks/useDomains';
import { VALUES, type ModelEntry, type ValueKey } from '../data/domainAnalysisData';
import { formatQueryError } from '../utils/urqlError';
import {
  countAnalyzedTranscripts,
  formatSignatureOptionLabel,
  getCacheStatusCopy,
  getSignaturePriority,
} from '../utils/domainAnalysisUtils';

const ALL_DOMAINS_SCOPE = 'all-domains';
type DomainSelectionScope = 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET';

function normalizeDomainIds(domainIds: readonly string[]): string[] {
  return Array.from(new Set(domainIds.map((id) => id.trim()).filter((id) => id !== ''))).sort((a, b) => a.localeCompare(b));
}

function getDomainSelectionScope(domainIds: readonly string[]): DomainSelectionScope {
  if (domainIds.length === 0) return 'ALL_DOMAINS';
  return domainIds.length === 1 ? 'DOMAIN' : 'DOMAIN_SET';
}

function getDomainAnalysisScopeParam(scope: DomainSelectionScope): string | undefined {
  return scope === 'ALL_DOMAINS' ? ALL_DOMAINS_SCOPE : undefined;
}

function buildModelEntries(
  models: DomainAnalysisModel[],
  modelsAnalysisModels: ModelsAnalysisModelResult[] = [],
  winRateMode: 'all' | 'exc-neutral' = 'all',
  dataSource: 'log-odds' | 'win-rate' | 'kappa-agreement' = 'log-odds',
): ModelEntry[] {
  const pooledWinRatesByModel = new Map<string, Map<string, number | null>>(
    modelsAnalysisModels.map((model) => [
      model.modelId,
      new Map(model.values.map((value) => [value.valueKey, value.pooledWinRate])),
    ]),
  );
  const pooledExcNeutralByModel = new Map<string, Map<string, number | null>>(
    modelsAnalysisModels.map((model) => [
      model.modelId,
      new Map(model.values.map((value) => [value.valueKey, value.pooledWinRateExcNeutral])),
    ]),
  );

  return models.map((model) => {
    const valueMap = new Map(model.values.map((value) => [value.valueKey, value.score] as const));
    const winRateMap = pooledWinRatesByModel.get(model.model);
    const excNeutralMap = pooledExcNeutralByModel.get(model.model);
    const useExcNeutral = winRateMode === 'exc-neutral' && dataSource === 'win-rate';
    const values = VALUES.reduce<Record<ValueKey, number>>((acc, valueKey) => {
      acc[valueKey] = valueMap.get(valueKey) ?? 0;
      return acc;
    }, {} as Record<ValueKey, number>);
    const winRates = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
      if (useExcNeutral) {
        acc[valueKey] = excNeutralMap?.get(valueKey) ?? winRateMap?.get(valueKey) ?? null;
      } else {
        acc[valueKey] = winRateMap?.get(valueKey) ?? null;
      }
      return acc;
    }, {} as Record<ValueKey, number | null>);

    return {
      model: model.model,
      label: model.label,
      values,
      winRates,
    };
  });
}

/**
 * Shared Model Groups page body. The original page (`ModelsGroups`, route
 * `/models`) renders it with `showInternalAgreement={false}` — unchanged
 * behavior. The V2 page (`ModelsGroupsV2`, route `/models/v2`) renders it with
 * `showInternalAgreement` on so the two can be compared in production.
 */
export function ModelGroupsView({ showInternalAgreement }: { showInternalAgreement: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>(() => {
    const domainIdsParam = searchParams.get('domainIds');
    if (domainIdsParam != null && domainIdsParam !== '') {
      return domainIdsParam.split(',').filter((id) => id !== '');
    }
    const legacyDomainId = searchParams.get('domainId') ?? '';
    const legacyScope = searchParams.get('scope') ?? '';
    if (legacyScope === ALL_DOMAINS_SCOPE || legacyDomainId === '') return [];
    return [legacyDomainId];
  });
  const [selectedSignature, setSelectedSignature] = useState<string>(searchParams.get('signature') ?? '');

  const normalizedSelectedDomainIds = useMemo(() => normalizeDomainIds(selectedDomainIds), [selectedDomainIds]);
  const effectiveScope = useMemo(() => getDomainSelectionScope(normalizedSelectedDomainIds), [normalizedSelectedDomainIds]);
  const effectiveDomainId = normalizedSelectedDomainIds.length === 1 ? (normalizedSelectedDomainIds[0] ?? '') : '';
  const isAllDomains = effectiveScope === 'ALL_DOMAINS';
  const isDomainSet = effectiveScope === 'DOMAIN_SET';
  const [selectedModelIds, setSelectedModelIds] = useState<string[] | null>(null);
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);
  const [clusteringMethod, setClusteringMethod] = useState<'upgma' | 'ward'>('ward');
  const [dataSource, setDataSource] = useState<'log-odds' | 'win-rate' | 'kappa-agreement'>('log-odds');
  const [similarityMethod, setSimilarityMethod] = useState<CalculationMethod>('weighted-euclidean');
  // Track whether the user has explicitly chosen a similarity method.
  // When false, switching data source to kappa-agreement auto-defaults to 'kappa'.
  const [similarityMethodExplicit, setSimilarityMethodExplicit] = useState(false);
  const [winRateMode, setWinRateMode] = useState<'all' | 'exc-neutral'>('all');

  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    DomainAvailableSignaturesQueryVariables
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: {
      domainId: effectiveDomainId !== '' ? effectiveDomainId : undefined,
      domainIds: isDomainSet ? normalizedSelectedDomainIds : undefined,
      scope: getDomainAnalysisScopeParam(effectiveScope),
    },
    pause: domainsLoading,
    requestPolicy: 'cache-and-network',
  });

  const signatureOptions = useMemo<DomainAvailableSignature[]>(() => {
    const options = signatureData?.domainAvailableSignatures ?? [];
    return options
      .map((option, index) => ({ option, index }))
      .sort((a, b) => {
        const priority = getSignaturePriority(a.option) - getSignaturePriority(b.option);
        return priority !== 0 ? priority : a.index - b.index;
      })
      .map(({ option }) => option);
  }, [signatureData]);

  useEffect(() => {
    if (domains.length === 0 || normalizedSelectedDomainIds.length === 0) return;
    const domainIdSet = new Set(domains.map((domain) => domain.id));
    const validIds = normalizedSelectedDomainIds.filter((id) => domainIdSet.has(id));
    if (validIds.length === normalizedSelectedDomainIds.length) return;
    setSelectedDomainIds(validIds);
  }, [domains, normalizedSelectedDomainIds]);

  useEffect(() => {
    if (signatureOptions.length === 0) {
      setSelectedSignature('');
      return;
    }
    if (selectedSignature !== '' && signatureOptions.some((option) => option.signature === selectedSignature)) return;
    setSelectedSignature(signatureOptions[0]?.signature ?? '');
  }, [selectedSignature, signatureOptions]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (normalizedSelectedDomainIds.length === 0) {
      next.delete('domainId');
      next.delete('domainIds');
    } else if (normalizedSelectedDomainIds.length === 1) {
      next.set('domainId', normalizedSelectedDomainIds[0]!);
      next.delete('domainIds');
    } else {
      next.set('domainIds', normalizedSelectedDomainIds.join(','));
      next.delete('domainId');
    }
    next.delete('scope');
    if (selectedSignature === '') next.delete('signature');
    else next.set('signature', selectedSignature);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, normalizedSelectedDomainIds, selectedSignature, setSearchParams]);

  const activeUseLegacyQuery = useLegacyQuery && effectiveDomainId !== '';
  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }, reexecuteScoredQuery] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: {
      domainId: effectiveDomainId !== '' ? effectiveDomainId : undefined,
      domainIds: isDomainSet ? normalizedSelectedDomainIds : undefined,
      scope: getDomainAnalysisScopeParam(effectiveScope),
      signature: selectedSignature === '' ? undefined : selectedSignature,
    },
    pause: domainsLoading || activeUseLegacyQuery,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: modelsAnalysisData, fetching: modelsAnalysisFetching, error: modelsAnalysisError }] = useQuery<
    ModelsAnalysisQueryResult,
    ModelsAnalysisQueryVariables
  >({
    query: MODELS_ANALYSIS_QUERY,
    variables: {
      ...(effectiveDomainId !== '' ? { domainId: effectiveDomainId } : {}),
      ...(isDomainSet ? { domainIds: normalizedSelectedDomainIds } : {}),
      ...(selectedSignature !== '' ? { signature: selectedSignature } : {}),
    },
    pause: domainsLoading,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: llmModelsData, error: llmModelsError }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<DomainAnalysisQueryResult, { domainId: string }>({
    query: DOMAIN_ANALYSIS_QUERY_LEGACY,
    variables: { domainId: effectiveDomainId },
    pause: effectiveDomainId === '' || !activeUseLegacyQuery,
    requestPolicy: 'cache-and-network',
  });

  useEffect(() => {
    const message = scoredError?.message ?? '';
    const isFieldError = message.includes('Unknown argument "signature"')
      || message.includes('Cannot query field')
      || message.includes('Unknown field');
    if (isFieldError && !useLegacyQuery && effectiveDomainId !== '') setUseLegacyQuery(true);
  }, [effectiveDomainId, scoredError, useLegacyQuery]);

  // Auto-default similarity method to 'kappa' when switching to kappa-agreement data source,
  // unless the user has already made an explicit choice.
  useEffect(() => {
    if (dataSource === 'kappa-agreement' && !similarityMethodExplicit) {
      setSimilarityMethod('kappa');
    }
  }, [dataSource, similarityMethodExplicit]);

  const data = activeUseLegacyQuery ? legacyData : scoredData;
  const fetching = activeUseLegacyQuery ? legacyFetching : scoredFetching;
  const error = activeUseLegacyQuery ? legacyError : scoredError;
  const activeModels = useMemo(
    () => (llmModelsData?.llmModels ?? []).filter((model) => model.status === 'ACTIVE'),
    [llmModelsData],
  );
  const defaultModelIds = useMemo(
    () => activeModels.filter((model) => model.isDefault).map((model) => model.modelId),
    [activeModels],
  );
  useEffect(() => {
    if (selectedModelIds === null && defaultModelIds.length > 0) {
      setSelectedModelIds(defaultModelIds);
    }
  }, [defaultModelIds, selectedModelIds]);
  const visibleModelIds = selectedModelIds ?? defaultModelIds;

  const isKappaClusterMode = dataSource === 'kappa-agreement';
  const [{ data: kappaClusterData, fetching: kappaClusterFetching, error: kappaClusterError }] = useQuery<
    ModelAgreementClusterAnalysisQuery,
    ModelAgreementClusterAnalysisQueryVariables
  >({
    query: ModelAgreementClusterAnalysisDocument,
    variables: {
      modelIds: visibleModelIds,
      ...(effectiveDomainId !== '' ? { domainId: effectiveDomainId } : {}),
      ...(isDomainSet ? { domainIds: normalizedSelectedDomainIds } : {}),
      scope: effectiveScope,
      signature: selectedSignature,
      method: clusteringMethod,
    },
    pause:
      !isKappaClusterMode
      || selectedSignature === ''
      || visibleModelIds.length < 3
      || domainsLoading
      || llmModelsData == null,
    requestPolicy: 'cache-and-network',
  });

  // Bridge codegen's optional-nullable fields to ClusterAnalysis's strict-nullable fields.
  const kappaClusterAnalysis = useMemo<ClusterAnalysis | null>(() => {
    const raw = kappaClusterData?.modelAgreementClusterAnalysis?.clusterAnalysis;
    if (raw == null) return null;
    return {
      skipped: raw.skipped,
      skipReason: raw.skipReason ?? null,
      defaultPair: raw.defaultPair ?? null,
      clusters: raw.clusters as ClusterAnalysis['clusters'],
      faultLinesByPair: (raw.faultLinesByPair ?? {}) as ClusterAnalysis['faultLinesByPair'],
    };
  }, [kappaClusterData]);

  const kappaDendrogram = useMemo(() => {
    return kappaClusterData?.modelAgreementClusterAnalysis?.clusterAnalysis?.dendrogram ?? null;
  }, [kappaClusterData]);

  const kappaLeafOrder = useMemo(() => {
    return kappaClusterData?.modelAgreementClusterAnalysis?.clusterAnalysis?.leafOrder ?? null;
  }, [kappaClusterData]);

  const kappaClusterIdByModelId = useMemo(() => {
    const raw = kappaClusterData?.modelAgreementClusterAnalysis?.clusterAnalysis?.clusterIdByModelId;
    if (raw == null) return null;
    return raw as Record<string, string>;
  }, [kappaClusterData]);

  const transcriptCount = useMemo(
    () => countAnalyzedTranscripts(data?.domainAnalysis.models ?? [], visibleModelIds),
    [data?.domainAnalysis.models, visibleModelIds],
  );
  const cacheStatusCopy = useMemo(
    () => getCacheStatusCopy(
      data?.domainAnalysis.cacheStatus,
      data?.domainAnalysis.generatedAt,
      transcriptCount,
      data?.domainAnalysis.refreshProgress,
    ),
    [data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt, data?.domainAnalysis.refreshProgress, transcriptCount],
  );

  const isUpdating = data?.domainAnalysis.cacheStatus === 'UPDATING';
  useEffect(() => {
    if (!isUpdating) return;
    const id = setInterval(() => { reexecuteScoredQuery({ requestPolicy: 'network-only' }); }, 20_000);
    return () => { clearInterval(id); };
  }, [isUpdating, reexecuteScoredQuery]);
  const domainSummary = useMemo(() => {
    if (isAllDomains) return 'All Domains';
    if (normalizedSelectedDomainIds.length === 1) {
      const id = normalizedSelectedDomainIds[0];
      return domains.find((d) => d.id === id)?.name ?? id ?? 'Unknown';
    }
    return `${normalizedSelectedDomainIds.length} domains`;
  }, [domains, isAllDomains, normalizedSelectedDomainIds]);

  const showPageLoader = domainsLoading
    || (data?.domainAnalysis == null && fetching && error == null)
    || (modelsAnalysisData == null && modelsAnalysisFetching && modelsAnalysisError == null)
    || (signatureData == null && signaturesLoading && signaturesError == null)
    || (llmModelsData == null && llmModelsError == null);
  const models = useMemo(
    () =>
      buildModelEntries(
        data?.domainAnalysis.models ?? [],
        modelsAnalysisData?.modelsAnalysis.models ?? [],
        winRateMode,
        dataSource,
      ),
    [data?.domainAnalysis.models, dataSource, modelsAnalysisData?.modelsAnalysis.models, winRateMode],
  );
  const modelOptions = useMemo(
    () => activeModels.map((model) => ({
      value: model.modelId,
      label: model.displayName,
      isDefault: defaultModelIds.includes(model.modelId),
    })),
    [activeModels, defaultModelIds],
  );
  const filteredModels = useMemo(
    () => (visibleModelIds.length === 0 ? [] : models.filter((model) => visibleModelIds.includes(model.model))),
    [models, visibleModelIds],
  );
  const pageErrorMessage = domainsError != null
    ? formatQueryError('Model Groups domains query', domainsError, {
      scope: effectiveScope,
      domainId: effectiveDomainId === '' ? '(none)' : effectiveDomainId,
    })
    : signaturesError != null
      ? formatQueryError('Model Groups available signatures query', signaturesError, {
        domainId: effectiveDomainId === '' ? '(none)' : effectiveDomainId,
        scope: effectiveScope,
      })
      : error != null
        ? formatQueryError(
          activeUseLegacyQuery ? 'Model Groups legacy domain analysis query' : 'Model Groups domain analysis query',
          error,
          {
            domainId: effectiveDomainId === '' ? '(none)' : effectiveDomainId,
            scope: effectiveScope,
            signature: selectedSignature === '' ? '(none)' : selectedSignature,
          },
        )
        : modelsAnalysisError != null
          ? formatQueryError('Model Groups models analysis query', modelsAnalysisError, {
            domainId: effectiveDomainId !== '' ? effectiveDomainId : ALL_DOMAINS_SCOPE,
            signature: selectedSignature === '' ? '(none)' : selectedSignature,
          })
          : llmModelsError != null
            ? formatQueryError('Model Groups active LLM models query', llmModelsError, {
              status: 'ACTIVE',
            })
            : null;
  const showAgreementSection =
    selectedSignature !== ''
    && visibleModelIds.length >= 2
    && !domainsLoading
    && llmModelsData != null;

  // Fire the agreement query here too so we can extract the kappa matrix for
  // the similarity table. Urql will deduplicate/cache against the same query
  // fired inside ModelAgreementSection.
  const [{ data: agreementData, fetching: agreementFetching }] = useModelAgreementOnTradeoffsQuery({
    variables: {
      modelIds: visibleModelIds,
      domainId: effectiveDomainId !== '' ? effectiveDomainId : undefined,
      domainIds: isDomainSet ? normalizedSelectedDomainIds : undefined,
      scope: effectiveScope,
      signature: selectedSignature,
    },
    requestPolicy: 'cache-and-network',
    pause: !showAgreementSection,
  });

  // Build the map from whatever agreement data is available — including stale
  // data urql keeps during a background refetch. Do NOT gate on `fetching` or
  // `error`: a present map must stay usable during a refetch (see plan
  // Architecture Choice 2). `fetching`/`error` only feed `agreementStatus`.
  const pairwiseKappaMap = useMemo(() => {
    if (!showAgreementSection) return undefined;
    const rows = agreementData?.modelAgreementOnTradeoffs?.pairwiseAgreementMatrix;
    if (rows == null || rows.length === 0) return undefined;
    const map = new Map<string, Map<string, PairwiseKappaEntry>>();
    for (const row of rows) {
      if (row.cohensKappa == null || row.totalCells === 0) continue;
      const entry: PairwiseKappaEntry = {
        kappa: row.cohensKappa,
        confidenceLow: row.cohensKappaConfidenceLow ?? null,
        confidenceHigh: row.cohensKappaConfidenceHigh ?? null,
        confidenceIsSymmetric: row.cohensKappaConfidenceIsSymmetric,
      };
      if (!map.has(row.modelAId)) map.set(row.modelAId, new Map());
      if (!map.has(row.modelBId)) map.set(row.modelBId, new Map());
      map.get(row.modelAId)!.set(row.modelBId, entry);
      map.get(row.modelBId)!.set(row.modelAId, entry);
    }
    return map.size === 0 ? undefined : map;
  }, [agreementData, showAgreementSection]);

  const agreementStatus: AgreementStatus = useMemo(() => {
    if (pairwiseKappaMap != null) return 'ready';
    if (agreementFetching) return 'loading';
    if (visibleModelIds.length < 2) return 'needs-more-models';
    // No map, not fetching, enough models selected: errored, no signature,
    // or an empty result. All read to the user as "no agreement data".
    return 'unavailable';
  }, [agreementFetching, pairwiseKappaMap, visibleModelIds.length]);

  if (pageErrorMessage != null) {
    return (
      <div className="space-y-6">
        <ErrorMessage
          message={`Failed to load model groups report: ${pageErrorMessage}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalysisContextBar
        domain={{
          label: 'Domain',
          multi: true,
          summary: domainSummary,
          selectedIds: normalizedSelectedDomainIds,
          options: domains.map((d) => ({ value: d.id, label: d.name })),
          actions: [
            {
              label: 'All Domains',
              isActive: isAllDomains,
              onClick: () => setSelectedDomainIds([]),
            },
          ],
          onChange: (ids) => { setSelectedDomainIds(normalizeDomainIds(ids)); },
          disabled: domainsLoading || domains.length === 0,
        }}
        signature={{
          label: 'Signature',
          value: selectedSignature,
          options:
            signatureOptions.length === 0
              ? [{ value: '', label: 'No signatures with completed runs', disabled: true }]
              : signatureOptions.map((option) => ({
                value: option.signature,
                label: formatSignatureOptionLabel(option),
              })),
          onChange: (value) => setSelectedSignature(value),
          disabled: signaturesLoading || signatureOptions.length === 0,
        }}
        models={{
          label: 'Models',
          selectedModelIds,
          defaultModelIds,
          options: modelOptions,
          onChange: setSelectedModelIds,
        }}
        winRateMode={{
          value: winRateMode,
          onChange: setWinRateMode,
          disabled: dataSource !== 'win-rate',
        }}
      />

      {cacheStatusCopy != null && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${cacheStatusCopy.badgeClassName}`}>
            {cacheStatusCopy.badgeLabel}
          </span>
          <span>{cacheStatusCopy.detail}</span>
        </div>
      )}

      <ModelAnalysisSettingsBar
        dataSource={dataSource}
        onDataSourceChange={setDataSource}
        similarityMethod={similarityMethod}
        onSimilarityMethodChange={(method) => {
          setSimilarityMethodExplicit(true);
          setSimilarityMethod(method);
        }}
      />

      {showPageLoader ? (
        <Loading size="lg" text="Loading model groups..." />
      ) : (
        <div className="space-y-6">
          <ModelGroupsSection
            clusterAnalysisByMethod={data?.domainAnalysis.clusterAnalysisByMethod}
            kappaClusterAnalysis={kappaClusterAnalysis}
            kappaDendrogram={kappaDendrogram}
            kappaLeafOrder={kappaLeafOrder}
            kappaClusterIdByModelId={kappaClusterIdByModelId}
            kappaClusterLoading={kappaClusterFetching}
            kappaClusterError={kappaClusterError?.message ?? null}
            pairwiseKappaMap={pairwiseKappaMap}
            agreementStatus={agreementStatus}
            showInternalAgreement={showInternalAgreement}
            dataSource={dataSource}
            distanceMethod={similarityMethod}
            models={filteredModels}
            clusteringMethod={clusteringMethod}
            onClusteringMethodChange={setClusteringMethod}
          />
          <ModelSimilarityTableSection
            models={filteredModels}
            method={similarityMethod}
            pairwiseKappa={pairwiseKappaMap}
          />
          {showAgreementSection ? (
            <ModelAgreementSection
              modelIds={visibleModelIds}
              scope={effectiveScope}
              domainId={effectiveDomainId !== '' ? effectiveDomainId : null}
              domainIds={isDomainSet ? normalizedSelectedDomainIds : null}
              signature={selectedSignature}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Model Groups page (route `/models`). Comparison baseline — renders the shared
 * view with the internal-agreement overlay off, so its behavior is unchanged.
 */
export function ModelsGroups() {
  return <ModelGroupsView showInternalAgreement={false} />;
}
