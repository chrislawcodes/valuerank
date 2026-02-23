import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import {
  DOMAIN_ANALYSIS_QUERY,
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
import { useDomains } from '../hooks/useDomains';

export function DomainAnalysis() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');

  useEffect(() => {
    if (selectedDomainId !== '' || domains.length === 0) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  const [{ data, fetching, error }] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

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

      {(domainsError || error) && (
        <ErrorMessage message={`Failed to load domain analysis: ${(domainsError ?? error)?.message ?? 'Unknown error'}`} />
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Domain Selection</h2>
            <p className="text-xs text-gray-600">Analysis is computed from live aggregate runs for latest vignettes in this domain.</p>
          </div>
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
        </div>
        {data?.domainAnalysis && (
          <p className="mt-2 text-xs text-gray-500">
            {data.domainAnalysis.definitionsWithAnalysis} of {data.domainAnalysis.targetedDefinitions} latest vignettes currently have aggregate analysis data.
          </p>
        )}
      </section>

      {(domainsLoading || (selectedDomainId !== '' && fetching)) ? (
        <Loading size="lg" text="Loading domain analysis..." />
      ) : (
        <>
          <ValuePrioritiesSection models={models} />
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
