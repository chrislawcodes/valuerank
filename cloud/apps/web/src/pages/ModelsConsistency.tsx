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
import { formatSignatureOptionLabel } from '../utils/domainAnalysisUtils';
import {
  MODELS_CONSISTENCY_QUERY,
  type ModelsConsistencyQueryResult,
  type ModelsConsistencyQueryVariables,
} from '../api/operations/modelsConsistency';
import { ConsistencyFilters } from '../components/models/ConsistencyFilters';
import { ConsistencyScatter } from '../components/models/ConsistencyScatter';
import { ConsistencyTable } from '../components/models/ConsistencyTable';
import { ConsistencyDrill } from '../components/models/ConsistencyDrill';
import { InsufficientCoverageFooter } from '../components/models/InsufficientCoverageFooter';

const DEFAULT_SIGNATURE = 'vnewtd';

function buildDomainOptions(domains: Array<{ id: string; name: string }>) {
  return domains.map((domain) => ({ value: domain.id, label: domain.name }));
}

export function ModelsConsistency() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [searchParams, setSearchParams] = useSearchParams();
  const domainParam = searchParams.get('domainId');
  const signatureParam = searchParams.get('signature');
  const hasDomainParam = searchParams.has('domainId');
  const domainFilter = domainParam === 'all' ? null : domainParam;
  const [providerId, setProviderId] = useState<string | null>(null);
  const [minScenarios, setMinScenarios] = useState(5);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const urlDomainId = hasDomainParam ? domainFilter : null;
  const hasExplicitDomain = hasDomainParam && domainParam !== 'all';

  const [{ data: signatureData, error: signatureError }] = useQuery<DomainAvailableSignaturesQueryResult, { domainId: string }>({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId: urlDomainId ?? '' },
    pause: !hasExplicitDomain,
    requestPolicy: 'cache-and-network',
  });

  const availableSignatures = useMemo(
    () => signatureData?.domainAvailableSignatures ?? [],
    [signatureData],
  );

  const signatureOptions = useMemo(
    () => availableSignatures.map((option) => ({
      value: option.signature,
      label: formatSignatureOptionLabel(option),
    })),
    [availableSignatures],
  );

  // Default picker: honor ?signature URL param first. Otherwise prefer the
  // canonical "vnewest @ default temperature" signature if it is actually
  // offered for this domain; fall back to the first available signature;
  // fall back to DEFAULT_SIGNATURE constant only when nothing is loaded yet.
  const signatureChoice = (() => {
    if (signatureParam != null) return signatureParam;
    if (!hasDomainParam || domainParam === 'all') return DEFAULT_SIGNATURE;
    if (signatureError != null) return DEFAULT_SIGNATURE;
    if (signatureData == null) return null;
    if (availableSignatures.some((option) => option.signature === DEFAULT_SIGNATURE)) {
      return DEFAULT_SIGNATURE;
    }
    return availableSignatures[0]?.signature ?? DEFAULT_SIGNATURE;
  })();
  const selectedSignature = signatureChoice ?? DEFAULT_SIGNATURE;

  useEffect(() => {
    if (signatureParam != null || signatureChoice == null) {
      return;
    }
    if (!hasDomainParam || domainParam === 'all') {
      setSearchParams({ domainId: 'all', signature: signatureChoice }, { replace: true });
      return;
    }
    if (urlDomainId != null) {
      setSearchParams({ domainId: urlDomainId, signature: signatureChoice }, { replace: true });
    }
  }, [domainParam, hasDomainParam, setSearchParams, signatureChoice, signatureParam, urlDomainId]);

  const queryVariables = useMemo<ModelsConsistencyQueryVariables>(() => ({
    ...(urlDomainId != null ? { domainId: urlDomainId } : {}),
    ...(providerId != null ? { providerId } : {}),
    minScenarios,
    signature: selectedSignature,
  }), [minScenarios, providerId, selectedSignature, urlDomainId]);

  const [{ data, fetching, error }] = useQuery<ModelsConsistencyQueryResult, ModelsConsistencyQueryVariables>({
    query: MODELS_CONSISTENCY_QUERY,
    variables: queryVariables,
    pause: signatureChoice == null,
    requestPolicy: 'cache-and-network',
  });

  const models = data?.modelsConsistency.models ?? [];
  const insufficient = data?.modelsConsistency.insufficient ?? [];
  const providerOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const model of models) {
      unique.set(model.providerName, model.providerName);
    }
    for (const row of insufficient) {
      unique.set(row.providerName, row.providerName);
    }
    return [...unique.values()].map((value) => ({ value, label: value }));
  }, [insufficient, models]);

  useEffect(() => {
    if (selectedModelId == null && models.length > 0) {
      setSelectedModelId(models[0]!.modelId);
      return;
    }
    if (selectedModelId != null && !models.some((model) => model.modelId === selectedModelId)) {
      setSelectedModelId(models[0]?.modelId ?? null);
    }
  }, [models, selectedModelId]);

  const selectedModel = selectedModelId != null
    ? models.find((model) => model.modelId === selectedModelId) ?? null
    : models[0] ?? null;

  const loading = (domainsLoading && domains.length === 0) || (signatureChoice == null) || (fetching && data == null);
  const emptyState = models.length === 0;

  const handleDomainChange = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value == null) {
      next.set('domainId', 'all');
      next.set('signature', signatureParam ?? DEFAULT_SIGNATURE);
    } else {
      next.set('domainId', value);
      next.delete('signature');
    }
    setSearchParams(next, { replace: true });
  };

  const handleProviderChange = (value: string | null) => {
    setProviderId(value);
  };

  const handleMinScenariosChange = (value: number) => {
    setMinScenarios(value);
  };

  const handleSignatureChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('signature', value);
    setSearchParams(next, { replace: true });
  };

  // Order matters: surface errors and empty-domain state BEFORE the loading
  // spinner so a failed useDomains() or an empty domain list does not leave
  // the page stuck on an infinite loading state.
  if (domainsError != null || error != null) {
    return <ErrorMessage message={`Failed to load consistency report: ${(domainsError ?? error)?.message ?? 'Unknown error'}`} />;
  }

  if (!domainsLoading && domains.length === 0 && !hasDomainParam) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No domains are available yet. Populate domains first, then reopen this report.</div>;
  }

  if (loading) {
    return <Loading text="Loading consistency report..." />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Models / Consistency</h1>
        <p className="text-sm text-gray-600">Repeatability shows same-answer behavior. Coherence shows whether answers follow pressure.</p>
      </div>

      <ConsistencyFilters
        domainId={urlDomainId}
        providerId={providerId}
        signature={selectedSignature}
        minScenarios={minScenarios}
        domainOptions={buildDomainOptions(domains)}
        providerOptions={providerOptions}
        signatureOptions={signatureOptions}
        onDomainChange={handleDomainChange}
        onProviderChange={handleProviderChange}
        onSignatureChange={handleSignatureChange}
        onMinScenariosChange={handleMinScenariosChange}
      />

      {emptyState ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <p className="font-medium text-gray-900">No models have sufficient coverage yet.</p>
          <p className="mt-1">This report depends on the aggregate analysis pipeline. Once the pipeline has populated repeat coverage, the scatter and table will appear here.</p>
        </section>
      ) : (
        <>
          <ConsistencyScatter models={models} selectedModelId={selectedModel?.modelId ?? null} onSelectModel={setSelectedModelId} />
          <ConsistencyTable models={models} onSelectModel={setSelectedModelId} selectedModelId={selectedModel?.modelId ?? null} />
          {selectedModel && <ConsistencyDrill model={selectedModel} domainId={urlDomainId} signature={selectedSignature} />}
        </>
      )}

      <InsufficientCoverageFooter insufficient={insufficient} />
    </div>
  );
}
