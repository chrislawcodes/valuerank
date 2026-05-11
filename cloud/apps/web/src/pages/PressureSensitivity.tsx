import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { useSearchParams } from 'react-router-dom';
import { formatVnewLabel, isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { AnalysisContextBar } from '../components/analysis/AnalysisContextBar';
import { useDomains } from '../hooks/useDomains';
import { AVAILABLE_SIGNATURES_QUERY, type AvailableSignaturesQueryResult } from '../api/operations/available-signatures';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  type DomainAvailableSignaturesQueryResult,
} from '../api/operations/domainAnalysis';
import {
  PRESSURE_SENSITIVITY_QUERY,
  type PressureSensitivityQueryResult,
  type PressureSensitivityQueryVariables,
  type PressureSensitivityModel,
} from '../api/operations/pressureSensitivity';
import { PressureDirectionalBreakdown } from '../components/models/PressureDirectionalBreakdown';
import { PressureSensitivitySummary } from '../components/models/PressureSensitivitySummary';
import { PressureResponseByValueTable } from '../components/models/PressureResponseByValueTable';
import { PressureHighPressureByValueDomainTable } from '../components/models/PressureHighPressureByValueDomainTable';
import { PressureSensitivityGridSection } from '../components/models/PressureSensitivityGridSection';
import { PressureSensitivityCrossValueMap } from '../components/models/PressureSensitivityCrossValueMap';
import { PressureSensitivitySanityCheck } from '../components/models/PressureSensitivitySanityCheck';
import { PressureSensitivityLimitations } from '../components/models/PressureSensitivityLimitations';
import { formatQueryError } from '../utils/urqlError';
import { getCacheStatusCopy } from '../utils/domainAnalysisUtils';

const DEFAULT_SIGNATURE = 'vnewtd';

function formatPressureSensitivitySignatureLabel(signature: string): string {
  if (!isVnewSignature(signature)) {
    const defaultMatch = signature.match(/^v(\d+)td$/i);
    if (defaultMatch != null) return `v${defaultMatch[1]} @ default`;

    const tempMatch = signature.match(/^v(\d+)t(.+)$/i);
    if (tempMatch != null) return `v${tempMatch[1]} @ t=${tempMatch[2]}`;

    return signature;
  }

  try {
    return formatVnewLabel(parseVnewTemperature(signature));
  } catch {
    return signature;
  }
}

export function PressureSensitivity() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDomainParam = searchParams.get('domainId');
  // Treat empty-string ?domainId= as missing rather than firing a query with an invalid ID
  // (per Gemini Slice B review MEDIUM).
  const domainParam = rawDomainParam === '' ? null : rawDomainParam;
  const signatureParam = searchParams.get('signature');
  const hasExplicitDomain = domainParam != null && domainParam !== 'all';
  const urlDomainId = hasExplicitDomain ? domainParam : null;
  const [selectedModelIds, setSelectedModelIds] = useState<string[] | null>(null);

  const [{ data: domainSignatureData, error: domainSignatureError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    { domainId: string }
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: {
      domainId: urlDomainId ?? '',
    },
    pause: !hasExplicitDomain,
    requestPolicy: 'cache-and-network',
  });

  const [{ data: globalSignatureData, error: globalSignatureError }] = useQuery<AvailableSignaturesQueryResult>({
    query: AVAILABLE_SIGNATURES_QUERY,
    pause: hasExplicitDomain,
    requestPolicy: 'cache-and-network',
  });

  const signatureData = hasExplicitDomain ? domainSignatureData : globalSignatureData;
  const signatureError = hasExplicitDomain ? domainSignatureError : globalSignatureError;

  const availableSignatures = useMemo(
    () => {
      if (hasExplicitDomain) {
        return domainSignatureData?.domainAvailableSignatures.map((option) => option.signature) ?? [];
      }
      return globalSignatureData?.availableSignatures.map((entry) => entry.signature) ?? [];
    },
    [domainSignatureData, globalSignatureData, hasExplicitDomain],
  );

  const [{ data: llmModelsData, fetching: llmModelsLoading, error: llmModelsError }] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    requestPolicy: 'cache-and-network',
  });

  const activeModels = useMemo(() => llmModelsData?.llmModels ?? [], [llmModelsData]);
  const noActiveModels = !llmModelsLoading && activeModels.length === 0;
  const defaultModelIds = useMemo(() => {
    const defaults = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
    return defaults.length > 0 ? defaults : activeModels.map((model) => model.modelId);
  }, [activeModels]);
  const activeModelIdSet = useMemo(() => new Set(activeModels.map((model) => model.modelId)), [activeModels]);
  const modelOptions = useMemo(
    () => {
      const sorted = [...activeModels].sort((left, right) => left.displayName.localeCompare(right.displayName));
      const defaults = sorted.filter((model) => defaultModelIds.includes(model.modelId));
      const nonDefaults = sorted.filter((model) => !defaultModelIds.includes(model.modelId));
      return [...defaults, ...nonDefaults].map((model) => ({
        value: model.modelId,
        label: model.displayName,
        isDefault: defaultModelIds.includes(model.modelId),
      }));
    },
    [activeModels, defaultModelIds],
  );

  useEffect(() => {
    if (activeModels.length === 0) {
      return;
    }

    setSelectedModelIds((current) => {
      if (current == null) {
        return [...defaultModelIds];
      }

      const filtered = current.filter((modelId) => activeModelIdSet.has(modelId));
      if (filtered.length === current.length) {
        return current;
      }
      if (filtered.length > 0) {
        return filtered;
      }
      return current.length === 0 ? current : [...defaultModelIds];
    });
  }, [activeModelIdSet, activeModels.length, defaultModelIds, llmModelsLoading]);

  // Default signature picker: honor URL first, otherwise prefer the canonical
  // DEFAULT_SIGNATURE if available for the current signature scope, otherwise first available.
  const signatureChoice = (() => {
    if (signatureParam != null) return signatureParam;
    if (signatureError != null) return DEFAULT_SIGNATURE;
    if (signatureData == null) return null;
    if (availableSignatures.some((option) => option === DEFAULT_SIGNATURE)) {
      return DEFAULT_SIGNATURE;
    }
    return availableSignatures[0] ?? DEFAULT_SIGNATURE;
  })();
  const selectedSignature = signatureChoice ?? DEFAULT_SIGNATURE;

  // Write resolved defaults back to the URL on first render so tab nav and shareable
  // URLs stay in sync with what the page is actually querying.
  useEffect(() => {
    if (signatureParam != null || signatureChoice == null) return;
    if (urlDomainId == null) {
      setSearchParams({ domainId: 'all', signature: signatureChoice }, { replace: true });
      return;
    }
    setSearchParams({ domainId: urlDomainId, signature: signatureChoice }, { replace: true });
  }, [setSearchParams, signatureChoice, signatureParam, urlDomainId]);

  const queryVariables = useMemo<PressureSensitivityQueryVariables>(() => ({
    ...(urlDomainId != null ? { domainId: urlDomainId } : {}),
    ...(selectedModelIds != null ? { modelIds: selectedModelIds } : {}),
    signature: selectedSignature,
  }), [selectedModelIds, selectedSignature, urlDomainId]);

  const [{ data, fetching, error }] = useQuery<
    PressureSensitivityQueryResult,
    PressureSensitivityQueryVariables
  >({
    query: PRESSURE_SENSITIVITY_QUERY,
    variables: queryVariables,
    pause: signatureChoice == null || (selectedModelIds == null && !noActiveModels),
    requestPolicy: 'cache-and-network',
  });

  const models: PressureSensitivityModel[] = useMemo(
    () => data?.pressureSensitivity.models ?? [],
    [data],
  );
  const insufficient = data?.pressureSensitivity.insufficient ?? [];
  const excludedDefinitions = data?.pressureSensitivity.excludedDefinitions ?? [];
  const directionalSanityCheck = data?.pressureSensitivity.directionalSanityCheck;
  const transcriptCapHit = data?.pressureSensitivity.transcriptCapHit ?? false;
  const pressureConditionExcludedCount = data?.pressureSensitivity.pressureConditionExcludedCount ?? 0;

  const cacheStatus = data?.pressureSensitivity.cacheStatus ?? undefined;
  const generatedAt = data?.pressureSensitivity.generatedAt ?? undefined;
  const transcriptCount = useMemo(
    () => Math.round(models.reduce((sum, m) => sum + m.valuePairs.reduce((s, p) => s + p.n, 0), 0) / 2),
    [models],
  );
  const cacheStatusCopy = useMemo(
    () => getCacheStatusCopy(cacheStatus as 'FRESH' | 'UPDATING' | 'OUT_OF_DATE' | undefined, generatedAt, transcriptCount),
    [cacheStatus, generatedAt, transcriptCount],
  );

  const loading =
    (domainsLoading && domains.length === 0)
    || llmModelsLoading
    || signatureChoice == null
    || (selectedModelIds == null && !noActiveModels)
    || (fetching && data == null);
  const noModelsSelected = selectedModelIds != null && selectedModelIds.length === 0;
  const emptyState = models.length === 0 && insufficient.length === 0;
  const allInsufficient = models.length === 0 && insufficient.length > 0;

  const selectedDomainIds = hasExplicitDomain ? [urlDomainId!] : [];
  const domainSummary = hasExplicitDomain
    ? (domains.find((d) => d.id === urlDomainId)?.name ?? urlDomainId ?? 'Unknown')
    : 'All Domains';
  const signatureOptions = useMemo(
    () => availableSignatures.map((signature) => ({ value: signature, label: formatPressureSensitivitySignatureLabel(signature) })),
    [availableSignatures],
  );

  const handleDomainChange = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value == null) {
      next.set('domainId', 'all');
      next.set('signature', signatureParam ?? selectedSignature);
    } else {
      next.set('domainId', value);
      next.delete('signature');
    }
    setSearchParams(next, { replace: true });
  };

  const handleSignatureChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('signature', value);
    setSearchParams(next, { replace: true });
  };

  const handleModelSelectionChange = (value: string[]) => {
    setSelectedModelIds(value);
  };

  if (domainsError != null || signatureError != null || llmModelsError != null || error != null) {
    const pageErrorMessage = domainsError != null
      ? domainsError.message
      : signatureError != null
        ? formatQueryError('Pressure sensitivity signatures query', signatureError, {
          domainId: urlDomainId ?? 'all',
          scope: hasExplicitDomain ? 'domain' : 'all',
        })
        : llmModelsError != null
          ? formatQueryError('Pressure sensitivity active LLM models query', llmModelsError, {
            status: 'ACTIVE',
          })
          : formatQueryError('Pressure sensitivity report query', error, {
            domainId: urlDomainId ?? 'all',
            signature: selectedSignature,
            modelCount: selectedModelIds?.length ?? defaultModelIds.length,
          });

    return (
      <ErrorMessage
        message={`Failed to load pressure sensitivity report: ${pageErrorMessage}`}
      />
    );
  }

  if (!domainsLoading && domains.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No domains are available yet. Populate domains first, then reopen this report.
      </div>
    );
  }

  if (loading) {
    return <Loading text="Loading pressure sensitivity report..." />;
  }

  return (
    <div className="space-y-6">
      <AnalysisContextBar
        domain={{
          label: 'Domain',
          multi: true,
          singleSelect: true,
          summary: domainSummary,
          selectedIds: selectedDomainIds,
          options: domains.map((d) => ({ value: d.id, label: d.name })),
          actions: [
            {
              label: 'All Domains',
              isActive: !hasExplicitDomain,
              onClick: () => handleDomainChange(null),
            },
          ],
          onChange: (ids) => { handleDomainChange(ids[0] ?? null); },
          disabled: domainsLoading || (domains.length === 0 && !hasExplicitDomain),
        }}
        signature={{
          label: 'Signature',
          value: selectedSignature,
          onChange: handleSignatureChange,
          options:
            signatureOptions.length > 0
              ? signatureOptions
              : [{ value: selectedSignature, label: selectedSignature, disabled: true }],
          disabled: signatureOptions.length === 0,
        }}
        models={{
          label: 'Models',
          selectedModelIds,
          defaultModelIds,
          options: modelOptions,
          onChange: handleModelSelectionChange,
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

      {transcriptCapHit && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Coverage warning: this report scanned the maximum 500,000 transcripts and stopped before reaching the end of the data. Win rates and CIs may be biased toward earlier transcripts in the corpus.
          {pressureConditionExcludedCount > 0 && (
            <>{' '}Together with the {pressureConditionExcludedCount} excluded pressure condition{pressureConditionExcludedCount === 1 ? '' : 's'}, these limits are a lower bound on pressure sensitivity — the true effect could be larger.</>
          )}
        </section>
      )}

      {pressureConditionExcludedCount > 0 && !transcriptCapHit && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Coverage warning: {pressureConditionExcludedCount} pressure condition{pressureConditionExcludedCount === 1 ? '' : 's'} were excluded from this analysis. The remaining results are based on a subset of the available data.
        </section>
      )}

      {emptyState ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <p className="font-medium text-gray-900">
            {noActiveModels
              ? 'No active models are available yet.'
              : noModelsSelected
                ? 'Pick one or more models to see the report.'
                : 'No coverage yet.'}
          </p>
          <p className="mt-1">
            {noActiveModels
              ? 'Create or activate models first, then reopen this report.'
              : noModelsSelected
              ? 'Use the Models selector in the bar above to choose a default set or your own subset.'
              : 'This report depends on Aggregate-tagged runs with measurable transcripts. Once pipeline coverage is populated, the detail tables and heat maps will appear here.'}
          </p>
        </section>
      ) : allInsufficient ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <p className="font-medium">All models are below coverage thresholds.</p>
          <p className="mt-1">
            {insufficient.length} model{insufficient.length === 1 ? '' : 's'} have no value
            pairs that pass the per-cell coverage threshold (N ≥ 3 in both direction pools).
            See the insufficient-coverage section below for details.
          </p>
        </section>
      ) : (
        <>
          <PressureDirectionalBreakdown models={models} />
          <PressureResponseByValueTable models={models} />
          <PressureHighPressureByValueDomainTable models={models} />

          <PressureSensitivityGridSection models={models}>
            {({ selectedModelId, onSelectModel }) => (
              <>
                <PressureSensitivityCrossValueMap models={models} />

                {directionalSanityCheck && <PressureSensitivitySanityCheck data={directionalSanityCheck} />}

                <PressureSensitivityLimitations />

                <PressureSensitivitySummary
                  models={models}
                  selectedModelId={selectedModelId}
                  onSelectModel={onSelectModel}
                />
              </>
            )}
          </PressureSensitivityGridSection>
        </>
      )}

      {(insufficient.length > 0 || excludedDefinitions.length > 0) && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-600">
          <p className="text-sm font-medium text-gray-900">Coverage notes</p>
          {insufficient.length > 0 && (
            <p className="mt-2">
              {insufficient.length} model{insufficient.length === 1 ? '' : 's'} excluded:{' '}
              {insufficient.map((m) => `${m.label} (${m.reason})`).join(', ')}
            </p>
          )}
          {excludedDefinitions.length > 0 && (
            <p className="mt-2">
              {excludedDefinitions.length} definition
              {excludedDefinitions.length === 1 ? '' : 's'} excluded.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
