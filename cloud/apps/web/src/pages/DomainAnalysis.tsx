import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import {
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  type DomainAnalysisQueryResult,
  type DomainAnalysisQueryVariables,
} from '../api/operations/domainAnalysis';
import { DominanceSection } from '../components/domains/DominanceSection';
import { SimilaritySection } from '../components/domains/SimilaritySection';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import {
  VALUES,
  type DomainAnalysisModelAvailability,
  type ModelEntry,
  type ValueKey,
} from '../data/domainAnalysisData';
import { useDefinitions } from '../hooks/useDefinitions';
import { useDomains } from '../hooks/useDomains';

const ALL_SIGNATURES = 'all';

function formatTrialSignature(version: number | null | undefined, temperature: number | null | undefined): string {
  const versionToken = version === null || version === undefined ? '?' : String(version);
  const tempToken = temperature === null || temperature === undefined || !Number.isFinite(temperature)
    ? 'd'
    : temperature.toFixed(3).replace(/\.?0+$/, '');
  return `v${versionToken}t${tempToken}`;
}

export function DomainAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [selectedDomainId, setSelectedDomainId] = useState<string>(searchParams.get('domainId') ?? '');
  const [selectedSignature, setSelectedSignature] = useState<string>(searchParams.get('signature') ?? ALL_SIGNATURES);
  const [scoreMethod, setScoreMethod] = useState<'LOG_ODDS' | 'FULL_BT'>(
    searchParams.get('scoreMethod') === 'FULL_BT' ? 'FULL_BT' : 'LOG_ODDS',
  );
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);
  const {
    definitions: domainDefinitions,
    loading: definitionsLoading,
    error: definitionsError,
  } = useDefinitions({
    domainId: selectedDomainId === '' ? undefined : selectedDomainId,
    limit: 1000,
  });

  const signatureOptions = useMemo(() => {
    const options = new Set<string>();
    for (const definition of domainDefinitions) {
      const breakdown = definition.trialConfig?.signatureBreakdown ?? [];
      if (breakdown.length > 0) {
        for (const item of breakdown) {
          options.add(item.signature);
        }
        continue;
      }
      const fallbackSignature = definition.trialConfig?.signature
        ?? formatTrialSignature(
          definition.trialConfig?.definitionVersion ?? definition.version,
          definition.trialConfig?.temperature,
        );
      options.add(fallbackSignature);
    }
    return Array.from(options).sort((left, right) => left.localeCompare(right));
  }, [domainDefinitions]);

  useEffect(() => {
    if (domains.length === 0) return;
    const selectedExists = selectedDomainId !== '' && domains.some((domain) => domain.id === selectedDomainId);
    if (selectedExists) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (selectedSignature === ALL_SIGNATURES) return;
    if (signatureOptions.includes(selectedSignature)) return;
    setSelectedSignature(ALL_SIGNATURES);
  }, [selectedSignature, signatureOptions]);

  useEffect(() => {
    if (selectedDomainId === '') return;
    if (
      searchParams.get('domainId') === selectedDomainId
      && searchParams.get('scoreMethod') === scoreMethod
      && (searchParams.get('signature') ?? ALL_SIGNATURES) === selectedSignature
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('domainId', selectedDomainId);
    next.set('scoreMethod', scoreMethod);
    if (selectedSignature === ALL_SIGNATURES) {
      next.delete('signature');
    } else {
      next.set('signature', selectedSignature);
    }
    setSearchParams(next, { replace: true });
  }, [scoreMethod, searchParams, selectedDomainId, selectedSignature, setSearchParams]);

  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: {
      domainId: selectedDomainId,
      scoreMethod,
      signature: selectedSignature === ALL_SIGNATURES ? undefined : selectedSignature,
    },
    pause: selectedDomainId === '' || useLegacyQuery,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<DomainAnalysisQueryResult, { domainId: string }>({
    query: DOMAIN_ANALYSIS_QUERY_LEGACY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '' || !useLegacyQuery,
    requestPolicy: 'cache-and-network',
  });

  useEffect(() => {
    const message = scoredError?.message ?? '';
    if ((message.includes('Unknown argument "scoreMethod"') || message.includes('Unknown argument "signature"')) && !useLegacyQuery) {
      setUseLegacyQuery(true);
      setScoreMethod('LOG_ODDS');
    }
  }, [scoredError, useLegacyQuery]);

  const data = useLegacyQuery ? legacyData : scoredData;
  const fetching = useLegacyQuery ? legacyFetching : scoredFetching;
  const error = useLegacyQuery ? legacyError : scoredError;

  const models = useMemo<ModelEntry[]>(() => {
    const sourceModels = data?.domainAnalysis.models ?? [];
    return sourceModels.map((model) => {
      const valueMap = new Map(model.values.map((entry) => [entry.valueKey, entry.score]));
      const values = VALUES.reduce<Record<ValueKey, number>>((acc, valueKey) => {
        acc[valueKey] = valueMap.get(valueKey) ?? 0;
        return acc;
      }, {} as Record<ValueKey, number>);
      return {
        model: model.model,
        label: model.label,
        values,
      };
    });
  }, [data]);

  const unavailableModels = useMemo<DomainAnalysisModelAvailability[]>(
    () => (data?.domainAnalysis.unavailableModels ?? []).map((model) => ({
      model: model.model,
      label: model.label,
      reason: model.reason,
    })),
    [data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Analysis</h1>
        <p className="mt-1 text-sm text-gray-600">
          Structured model-value analysis across priorities, ranking behavior, and similarity for the selected domain.
        </p>
      </div>

      {(domainsError || definitionsError || error) && (
        <ErrorMessage message={`Failed to load domain analysis: ${(domainsError ?? definitionsError ?? error)?.message ?? 'Unknown error'}`} />
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Domain Selection</h2>
            <p className="text-xs text-gray-600">Analysis is computed from live aggregate runs for latest vignettes in this domain.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <select
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              value={selectedDomainId}
              onChange={(event) => setSelectedDomainId(event.target.value)}
              disabled={domainsLoading || domains.length === 0}
            >
              {domains.length === 0 && <option value="">No domains available</option>}
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              value={selectedSignature}
              onChange={(event) => setSelectedSignature(event.target.value)}
              disabled={definitionsLoading || signatureOptions.length === 0}
            >
              <option value={ALL_SIGNATURES}>All signatures</option>
              {signatureOptions.map((signature) => (
                <option key={signature} value={signature}>
                  {signature}
                </option>
              ))}
            </select>
          </div>
        </div>
        {data?.domainAnalysis && (
          <p className="mt-2 text-xs text-gray-500">
            {data.domainAnalysis.definitionsWithAnalysis} of {data.domainAnalysis.targetedDefinitions} latest vignettes currently have aggregate analysis data.
          </p>
        )}
      </section>

      {(domainsLoading || definitionsLoading || (selectedDomainId !== '' && fetching)) ? (
        <Loading size="lg" text="Loading domain analysis..." />
      ) : (
        <>
          <ValuePrioritiesSection
            models={models}
            selectedDomainId={selectedDomainId}
            selectedSignature={selectedSignature === ALL_SIGNATURES ? null : selectedSignature}
            scoreMethod={scoreMethod}
            onScoreMethodChange={setScoreMethod}
            btEnabled={!useLegacyQuery}
          />
          <DominanceSection models={models} unavailableModels={unavailableModels} />
          <SimilaritySection models={models} />
        </>
      )}

      {unavailableModels.length > 0 && (
        <footer className="text-xs text-gray-500">
          <p className="font-medium text-gray-600">Data availability note</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {unavailableModels.map((model) => (
              <li key={model.model}>
                {model.label}: {model.reason} This model is excluded from analysis tables and graph selectors.
              </li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}
