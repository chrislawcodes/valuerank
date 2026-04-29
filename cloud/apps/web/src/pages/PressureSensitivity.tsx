import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { useDomains } from '../hooks/useDomains';
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
import { PressureSensitivitySummary } from '../components/models/PressureSensitivitySummary';
import { PressureSensitivityDetail } from '../components/models/PressureSensitivityDetail';
import { PressureSensitivityCrossValueMap } from '../components/models/PressureSensitivityCrossValueMap';
import { PressureSensitivitySanityCheck } from '../components/models/PressureSensitivitySanityCheck';
import { PressureSensitivityLimitations } from '../components/models/PressureSensitivityLimitations';
import { PressureSensitivityFilters } from '../components/models/PressureSensitivityFilters';
import { formatSignatureOptionLabel } from '../utils/domainAnalysisUtils';

const DEFAULT_SIGNATURE = 'vnewtd';

export function PressureSensitivity() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDomainParam = searchParams.get('domainId');
  // Treat empty-string ?domainId= as missing rather than firing a query with an invalid ID
  // (per Gemini Slice B review MEDIUM).
  const domainParam = rawDomainParam === '' ? null : rawDomainParam;
  const signatureParam = searchParams.get('signature');
  const hasDomainParam = domainParam != null;
  const domainFilter = domainParam === 'all' ? null : domainParam;
  const [providerId, setProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const defaultDomainId = domains[0]?.id ?? null;
  const urlDomainId = hasDomainParam ? domainFilter : defaultDomainId;
  const hasExplicitDomain = hasDomainParam && domainParam !== 'all';

  const [{ data: signatureData, error: signatureError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    { domainId: string }
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: {
      domainId: hasExplicitDomain && urlDomainId != null ? urlDomainId : (defaultDomainId ?? ''),
    },
    pause: !hasExplicitDomain && defaultDomainId == null,
    requestPolicy: 'cache-and-network',
  });

  const availableSignatures = useMemo(
    () => signatureData?.domainAvailableSignatures ?? [],
    [signatureData],
  );

  // Default signature picker: honor URL first, otherwise prefer the canonical
  // DEFAULT_SIGNATURE if available for this domain, otherwise first available.
  const signatureChoice = (() => {
    if (signatureParam != null) return signatureParam;
    if (hasDomainParam && domainParam === 'all') return DEFAULT_SIGNATURE;
    if (signatureError != null) return DEFAULT_SIGNATURE;
    if (signatureData == null) return null;
    if (availableSignatures.some((option) => option.signature === DEFAULT_SIGNATURE)) {
      return DEFAULT_SIGNATURE;
    }
    return availableSignatures[0]?.signature ?? DEFAULT_SIGNATURE;
  })();
  const selectedSignature = signatureChoice ?? DEFAULT_SIGNATURE;

  // Write resolved defaults back to the URL on first render so tab nav and shareable
  // URLs stay in sync with what the page is actually querying.
  useEffect(() => {
    if (signatureParam != null || signatureChoice == null) return;
    if (hasDomainParam && domainParam === 'all') {
      setSearchParams({ domainId: 'all', signature: signatureChoice }, { replace: true });
      return;
    }
    if (urlDomainId != null) {
      setSearchParams({ domainId: urlDomainId, signature: signatureChoice }, { replace: true });
    }
  }, [domainParam, hasDomainParam, setSearchParams, signatureChoice, signatureParam, urlDomainId]);

  const queryVariables = useMemo<PressureSensitivityQueryVariables>(() => ({
    ...(urlDomainId != null ? { domainId: urlDomainId } : {}),
    ...(providerId != null ? { providerId } : {}),
    signature: selectedSignature,
  }), [providerId, selectedSignature, urlDomainId]);

  const [{ data, fetching, error }] = useQuery<
    PressureSensitivityQueryResult,
    PressureSensitivityQueryVariables
  >({
    query: PRESSURE_SENSITIVITY_QUERY,
    variables: queryVariables,
    pause: (!hasDomainParam && urlDomainId == null) || signatureChoice == null,
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

  useEffect(() => {
    if (selectedModelId == null && models.length > 0) {
      setSelectedModelId(models[0]!.modelId);
      return;
    }
    if (selectedModelId != null && !models.some((m) => m.modelId === selectedModelId)) {
      setSelectedModelId(models[0]?.modelId ?? null);
    }
  }, [models, selectedModelId]);

  const selectedModel = selectedModelId != null
    ? models.find((m) => m.modelId === selectedModelId) ?? null
    : models[0] ?? null;

  const loading =
    (domainsLoading && domains.length === 0)
    || signatureChoice == null
    || (fetching && data == null);
  const emptyState = models.length === 0 && insufficient.length === 0;
  const allInsufficient = models.length === 0 && insufficient.length > 0;

  const domainOptions = useMemo(() => domains.map((d) => ({ value: d.id, label: d.name })), [domains]);
  const signatureOptions = useMemo(
    () => availableSignatures.map((option) => ({ value: option.signature, label: formatSignatureOptionLabel(option) })),
    [availableSignatures],
  );
  const providerOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const m of models) unique.set(m.providerName, m.providerName);
    for (const i of insufficient) unique.set(i.providerName, i.providerName);
    return [...unique.values()].map((value) => ({ value, label: value }));
  }, [models, insufficient]);

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

  if (domainsError != null || error != null) {
    return (
      <ErrorMessage
        message={`Failed to load pressure sensitivity report: ${(domainsError ?? error)?.message ?? 'Unknown error'}`}
      />
    );
  }

  if (!domainsLoading && domains.length === 0 && !hasDomainParam) {
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
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Models / Pressure Sensitivity</h1>
        <p className="text-sm text-gray-600">
          This report shows each model&apos;s pressure response — how much added pressure moves the model toward its own value over the other. The cross-model table ranks models by mean pressure response, the detail table breaks that out by value pair, and the heat map plus sanity check show whether the pattern is consistent across the grid.
        </p>
      </div>

      <PressureSensitivityFilters
        domainId={urlDomainId}
        providerId={providerId}
        signature={selectedSignature}
        domainOptions={domainOptions}
        providerOptions={providerOptions}
        signatureOptions={signatureOptions}
        onDomainChange={handleDomainChange}
        onProviderChange={setProviderId}
        onSignatureChange={handleSignatureChange}
      />

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
          <p className="font-medium text-gray-900">No coverage yet.</p>
          <p className="mt-1">
            This report depends on Aggregate-tagged runs with measurable transcripts. Once
            pipeline coverage is populated, the cross-model summary, per-model detail, and
            heat maps will appear here.
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
          <PressureSensitivitySummary
            models={models}
            selectedModelId={selectedModel?.modelId ?? null}
            onSelectModel={setSelectedModelId}
          />

          {selectedModel && <PressureSensitivityDetail model={selectedModel} />}

          <PressureSensitivityCrossValueMap models={models} />

          {directionalSanityCheck && <PressureSensitivitySanityCheck data={directionalSanityCheck} />}

          <PressureSensitivityLimitations />
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
          {providerId != null && (
            <p className="mt-2 text-gray-400">
              Provider filter active ({providerId}). Use the filters panel to clear.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
