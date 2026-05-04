import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Select } from '../components/ui/Select';
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
import { ModelGroupsSection } from '../components/domains/ModelGroupsSection';
import { ModelSimilarityTableSection } from '../components/models/ModelSimilarityTableSection';
import { useDomains } from '../hooks/useDomains';
import { VALUES, type ModelEntry, type ValueKey } from '../data/domainAnalysisData';
import { formatSignatureOptionLabel, getCacheStatusCopy, getSignaturePriority } from '../utils/domainAnalysisUtils';

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
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);

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
  const cacheStatusCopy = useMemo(
    () => getCacheStatusCopy(data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt),
    [data?.domainAnalysis.cacheStatus, data?.domainAnalysis.generatedAt],
  );
  const showPageLoader = domainsLoading
    || (selectedDomainId !== '' && data?.domainAnalysis == null && fetching)
    || (selectedDomainId !== '' && modelsAnalysisData == null && modelsAnalysisFetching);
  const models = useMemo(
    () => buildModelEntries(data?.domainAnalysis.models ?? [], modelsAnalysisData?.modelsAnalysis.models ?? []),
    [data?.domainAnalysis.models, modelsAnalysisData?.modelsAnalysis.models],
  );
  const isAllDomains = selectedScope === 'ALL_DOMAINS';
  const domainSelectionSection = (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Domain Selection</h2>
          <p className="text-xs text-gray-600">
            {isAllDomains
              ? 'Cross-domain analysis is read-only and pools every visible domain that matches the selected signature.'
              : 'Model groups are shown from the latest saved snapshot for this domain.'}
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
                  : signatureOptions.map((option) => ({
                    value: option.signature,
                    label: formatSignatureOptionLabel(option),
                  }))
              }
              value={selectedSignature}
              onChange={(value) => setSelectedSignature(value)}
              disabled={signaturesLoading || signatureOptions.length === 0}
            />
          </div>
        </div>
      </div>
    </section>
  );

  if (domainsError != null || signaturesError != null || error != null || modelsAnalysisError != null) {
    return (
      <div className="space-y-6">
        {domainSelectionSection}
        <ErrorMessage message={`Failed to load model groups report: ${(domainsError ?? signaturesError ?? error ?? modelsAnalysisError)?.message ?? 'Unknown error'}`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {domainSelectionSection}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Models</p>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Model Groups</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Clustered model families for the selected domain and signature.
        </p>
        {cacheStatusCopy != null && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${cacheStatusCopy.badgeClassName}`}>
              {cacheStatusCopy.badgeLabel}
            </span>
            <span>{cacheStatusCopy.detail}</span>
          </div>
        )}
      </div>

      {showPageLoader ? (
        <Loading size="lg" text="Loading model groups..." />
      ) : (
        <div className="space-y-6">
          <ModelGroupsSection
            clusterAnalysis={data?.domainAnalysis.clusterAnalysis}
            models={models}
          />
          <ModelSimilarityTableSection models={models} />
        </div>
      )}
    </div>
  );
}
