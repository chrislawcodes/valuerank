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

const DEFAULT_SIGNATURE = 'vnewtd';

export function PressureSensitivity() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [searchParams, setSearchParams] = useSearchParams();
  const domainParam = searchParams.get('domainId');
  const signatureParam = searchParams.get('signature');
  const hasDomainParam = searchParams.has('domainId');
  const domainFilter = domainParam === 'all' ? null : domainParam;
  // setProviderId is wired in Slice D (Filters component); declared here so the query
  // already accepts the variable.
  const [providerId] = useState<string | null>(null);
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
          How much do models move when pressure on a value changes? Three Δ metrics
          across the (own × opponent) pressure grid.
        </p>
      </div>

      {/* Filters placeholder — populated in Slice D */}
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
        Filters (Slice D): Domain, Provider — currently using URL params (domainId={String(urlDomainId)}, signature={selectedSignature})
      </div>

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
            pairs that pass the per-cell coverage threshold (N ≥ 3 in both pressure bands).
            See the insufficient-coverage section below for details.
          </p>
        </section>
      ) : (
        <>
          {/* Cross-model summary — populated in Slice C */}
          <section className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
            Cross-model summary (Slice C): {models.length} model{models.length === 1 ? '' : 's'} measured.
          </section>

          {/* Per-model detail — populated in Slice C */}
          {selectedModel && (
            <section className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
              Per-model detail (Slice C): {selectedModel.label} — {selectedModel.valuePairs.length}{' '}
              pair{selectedModel.valuePairs.length === 1 ? '' : 's'} measured. Aggregate sensitivity
              ={' '}
              {selectedModel.aggregateSensitivity.value != null
                ? selectedModel.aggregateSensitivity.value.toFixed(3)
                : '—'}
              .
            </section>
          )}

          {/* Cross-value heat map — populated in Slice D */}
          <section className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
            Cross-value heat map (Slice D)
          </section>

          {/* Directional sanity check — populated in Slice D */}
          {directionalSanityCheck && (
            <section className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
              Directional sanity check (Slice D): {directionalSanityCheck.measuredCount} measured;{' '}
              {directionalSanityCheck.positivePct.toFixed(0)}% positive,{' '}
              {directionalSanityCheck.flatPct.toFixed(0)}% flat,{' '}
              {directionalSanityCheck.negativePct.toFixed(0)}% negative;{' '}
              {directionalSanityCheck.unmeasurableCount} unmeasurable.
            </section>
          )}

          {/* Limitations — populated in Slice D */}
          <section className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
            Limitations panel (Slice D)
          </section>
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
              Provider filter active ({providerId}). Use the filters panel (Slice D) to clear.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
