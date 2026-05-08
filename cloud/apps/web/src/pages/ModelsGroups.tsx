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
import { ModelGroupsSection } from '../components/domains/ModelGroupsSection';
import { ModelAnalysisSettingsBar } from '../components/models/ModelAnalysisSettingsBar';
import { ModelSimilarityTableSection } from '../components/models/ModelSimilarityTableSection';
import { ModelAgreementSection } from '../components/models/ModelAgreementSection';
import { type CalculationMethod } from '../components/models/ModelSimilarityMetrics';
import { useDomains } from '../hooks/useDomains';
import { VALUES, type ModelEntry, type ValueKey } from '../data/domainAnalysisData';
import {
  countAnalyzedTranscripts,
  formatSignatureOptionLabel,
  getCacheStatusCopy,
  getSignaturePriority,
} from '../utils/domainAnalysisUtils';

const ALL_DOMAINS_SCOPE = 'all-domains';

function buildModelEntries(
  models: DomainAnalysisModel[],
  modelsAnalysisModels: ModelsAnalysisModelResult[] = [],
): ModelEntry[] {
  const pooledWinRatesByModel = new Map<string, Map<string, number | null>>(
    modelsAnalysisModels.map((model) => [
      model.modelId,
      new Map(model.values.map((value) => [value.valueKey, value.pooledWinRate])),
    ]),
  );

  return models.map((model) => {
    const valueMap = new Map(model.values.map((value) => [value.valueKey, value.score] as const));
    const winRateMap = pooledWinRatesByModel.get(model.model);
    const values = VALUES.reduce<Record<ValueKey, number>>((acc, valueKey) => {
      acc[valueKey] = valueMap.get(valueKey) ?? 0;
      return acc;
    }, {} as Record<ValueKey, number>);
    const winRates = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
      acc[valueKey] = winRateMap?.get(valueKey) ?? null;
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

export function ModelsGroups() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const initialDomainId = searchParams.get('domainId') ?? '';
  const [selectedScope, setSelectedScope] = useState<'DOMAIN' | 'ALL_DOMAINS'>(
    searchParams.get('scope') === ALL_DOMAINS_SCOPE || initialDomainId.trim() === '' ? 'ALL_DOMAINS' : 'DOMAIN',
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string>(initialDomainId);
  const [selectedSignature, setSelectedSignature] = useState<string>(searchParams.get('signature') ?? '');
  const [selectedModelIds, setSelectedModelIds] = useState<string[] | null>(null);
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);
  const [clusteringMethod, setClusteringMethod] = useState<'upgma' | 'ward'>('ward');
  const [dataSource, setDataSource] = useState<'log-odds' | 'win-rate'>('log-odds');
  const [similarityMethod, setSimilarityMethod] = useState<CalculationMethod>('weighted-euclidean');

  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    DomainAvailableSignaturesQueryVariables
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
        const priority = getSignaturePriority(a.option) - getSignaturePriority(b.option);
        return priority !== 0 ? priority : a.index - b.index;
      })
      .map(({ option }) => option);
  }, [signatureData]);

  useEffect(() => {
    if (domains.length === 0) return;
    if (selectedDomainId !== '' && domains.some((domain) => domain.id === selectedDomainId)) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (signatureOptions.length === 0) {
      setSelectedSignature('');
      return;
    }
    if (selectedSignature !== '' && signatureOptions.some((option) => option.signature === selectedSignature)) return;
    setSelectedSignature(signatureOptions[0]?.signature ?? '');
  }, [selectedSignature, signatureOptions]);

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
  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: {
      domainId: selectedDomainId === '' ? domains[0]?.id ?? '' : selectedDomainId,
      scope: selectedScope === 'ALL_DOMAINS' ? ALL_DOMAINS_SCOPE : undefined,
      signature: selectedSignature === '' ? undefined : selectedSignature,
    },
    pause: selectedDomainId === '' || activeUseLegacyQuery,
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
  const [{ data: llmModelsData, error: llmModelsError }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<DomainAnalysisQueryResult, { domainId: string }>({
    query: DOMAIN_ANALYSIS_QUERY_LEGACY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '' || !activeUseLegacyQuery,
    requestPolicy: 'cache-and-network',
  });

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
  const transcriptCount = useMemo(
    () => countAnalyzedTranscripts(data?.domainAnalysis.models ?? [], visibleModelIds),
    [data?.domainAnalysis.models, visibleModelIds],
  );
  const cacheStatusCopy = useMemo(
    () => getCacheStatusCopy(data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt, transcriptCount),
    [data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt, transcriptCount],
  );
  const showPageLoader = domainsLoading
    || (selectedDomainId !== '' && data?.domainAnalysis == null && fetching && error == null)
    || (selectedDomainId !== '' && modelsAnalysisData == null && modelsAnalysisFetching && modelsAnalysisError == null)
    || (signatureData == null && signaturesLoading && signaturesError == null)
    || (llmModelsData == null && llmModelsError == null);
  const models = useMemo(
    () => buildModelEntries(data?.domainAnalysis.models ?? [], modelsAnalysisData?.modelsAnalysis.models ?? []),
    [data?.domainAnalysis.models, modelsAnalysisData?.modelsAnalysis.models],
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
  const isAllDomains = selectedScope === 'ALL_DOMAINS';
  const pageError = domainsError ?? signaturesError ?? error ?? modelsAnalysisError ?? llmModelsError;
  const showAgreementSection =
    selectedSignature !== ''
    && visibleModelIds.length >= 2
    && !(selectedScope === 'DOMAIN' && selectedDomainId === '')
    && llmModelsData != null;

  return (
    <div className="space-y-6">
      {pageError != null && (
        <ErrorMessage
          message={`Some model groups data failed to load: ${pageError.message ?? 'Unknown error'}`}
        />
      )}

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
        onSimilarityMethodChange={setSimilarityMethod}
      />

      {showPageLoader ? (
        <Loading size="lg" text="Loading model groups..." />
      ) : (
        <div className="space-y-6">
          <ModelGroupsSection
            clusterAnalysisByMethod={data?.domainAnalysis.clusterAnalysisByMethod}
            dataSource={dataSource}
            distanceMethod={similarityMethod}
            models={filteredModels}
            clusteringMethod={clusteringMethod}
            onClusteringMethodChange={setClusteringMethod}
          />
          <ModelSimilarityTableSection
            models={filteredModels}
            method={similarityMethod}
          />
          {showAgreementSection ? (
            <ModelAgreementSection
              modelIds={visibleModelIds}
              scope={selectedScope}
              domainId={selectedScope === 'DOMAIN' && selectedDomainId !== '' ? selectedDomainId : null}
              signature={selectedSignature}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
