import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Button } from '../components/ui/Button';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
  type DomainAvailableSignaturesQueryVariables,
  type DomainAnalysisQueryResult,
  type DomainAnalysisQueryVariables,
  type RankingShape,
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
import { exportDomainTranscriptsAsCSV } from '../api/export';

function parseTemperatureFromSignature(signature: string): number | null {
  if (signature.trim() === '') return null;
  const vnewMatch = signature.match(/^vnewt(.+)$/);
  if (vnewMatch) {
    const token = vnewMatch[1] ?? '';
    if (token === 'd') return null;
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const standardMatch = signature.match(/t(.+)$/);
  if (standardMatch) {
    const token = standardMatch[1] ?? '';
    if (token === 'd') return null;
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function DomainAnalysis() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [selectedDomainId, setSelectedDomainId] = useState<string>(searchParams.get('domainId') ?? '');
  const [selectedSignature, setSelectedSignature] = useState<string>(searchParams.get('signature') ?? '');
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    DomainAvailableSignaturesQueryVariables
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const signatureOptions = useMemo<DomainAvailableSignature[]>(
    () => signatureData?.domainAvailableSignatures ?? [],
    [signatureData],
  );
  const hasValidSelectedSignature = useMemo(
    () => selectedSignature !== '' && signatureOptions.some((option) => option.signature === selectedSignature),
    [selectedSignature, signatureOptions],
  );
  const signatureSelectionReady = selectedDomainId !== ''
    && !signaturesLoading
    && (signatureOptions.length === 0 || hasValidSelectedSignature);

  useEffect(() => {
    if (domains.length === 0) return;
    const selectedExists = selectedDomainId !== '' && domains.some((domain) => domain.id === selectedDomainId);
    if (selectedExists) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (signatureOptions.length === 0) {
      setSelectedSignature('');
      return;
    }

    const selectedExists = selectedSignature !== ''
      && signatureOptions.some((option) => option.signature === selectedSignature);
    if (selectedExists) return;
    setSelectedSignature(signatureOptions[0]?.signature ?? '');
  }, [selectedSignature, signatureOptions]);

  useEffect(() => {
    setExportError(null);
  }, [selectedDomainId, selectedSignature]);

  useEffect(() => {
    if (selectedDomainId === '') return;
    if (
      searchParams.get('domainId') === selectedDomainId
      && (searchParams.get('signature') ?? '') === selectedSignature
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('domainId', selectedDomainId);
    next.set('scoreMethod', 'FULL_BT');
    if (selectedSignature === '') {
      next.delete('signature');
    } else {
      next.set('signature', selectedSignature);
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedDomainId, selectedSignature, setSearchParams]);

  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: {
      domainId: selectedDomainId,
      scoreMethod: 'FULL_BT',
      signature: selectedSignature === '' ? undefined : selectedSignature,
    },
    pause: selectedDomainId === '' || useLegacyQuery || !signatureSelectionReady,
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

  const rankingShapes = useMemo<Map<string, RankingShape>>(() => {
    const map = new Map<string, RankingShape>();
    for (const model of data?.domainAnalysis.models ?? []) {
      if (model.rankingShape != null) {
        map.set(model.model, model.rankingShape);
      }
    }
    return map;
  }, [data]);

  const unavailableModels = useMemo<DomainAnalysisModelAvailability[]>(
    () => (data?.domainAnalysis.unavailableModels ?? []).map((model) => ({
      model: model.model,
      label: model.label,
      reason: model.reason,
    })),
    [data],
  );
  const missingDefinitionCount = data?.domainAnalysis.missingDefinitions?.length ?? 0;
  const allMissingDefinitionIds = useMemo(
    () => (data?.domainAnalysis.missingDefinitions ?? []).map((missing) => missing.definitionId),
    [data?.domainAnalysis.missingDefinitions],
  );

  const handleExport = async () => {
    if (selectedDomainId === '') return;
    setExportLoading(true);
    setExportError(null);
    try {
      await exportDomainTranscriptsAsCSV(
        selectedDomainId,
        selectedSignature !== '' ? selectedSignature : undefined,
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRunMissingVignettes = () => {
    if (selectedDomainId === '' || allMissingDefinitionIds.length === 0) return;
    const query = new URLSearchParams();
    query.set('definitionIds', allMissingDefinitionIds.join(','));
    if (selectedSignature !== '') {
      query.set('signature', selectedSignature);
      const signatureTemperature = parseTemperatureFromSignature(selectedSignature);
      if (signatureTemperature !== null) {
        query.set('temperature', String(signatureTemperature));
      }
    }
    navigate(`/domains/${selectedDomainId}/run-trials?${query.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Analysis</h1>
        <p className="mt-1 text-sm text-gray-600">
          Structured model-value analysis across priorities, ranking behavior, and similarity for the selected domain.
        </p>
      </div>

      {(domainsError || signaturesError || error) && (
        <ErrorMessage message={`Failed to load domain analysis: ${(domainsError ?? signaturesError ?? error)?.message ?? 'Unknown error'}`} />
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Domain Selection</h2>
            <p className="text-xs text-gray-600">Analysis is computed from live aggregate runs for latest vignettes in this domain.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
              disabled={signaturesLoading || signatureOptions.length === 0}
            >
              {signatureOptions.length === 0 && (
                <option value="">
                  No signatures with completed runs
                </option>
              )}
              {signatureOptions.map((signatureOption) => (
                <option key={signatureOption.signature} value={signatureOption.signature}>
                  {signatureOption.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={selectedDomainId === '' || exportLoading}
            >
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
          {exportError !== null && (
            <p className="mt-1 text-xs text-amber-700">{exportError}</p>
          )}
        </div>
        {data?.domainAnalysis && (
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <p>
              {data.domainAnalysis.definitionsWithAnalysis} of {data.domainAnalysis.targetedDefinitions} latest vignettes currently have aggregate analysis data.
            </p>
            {data.domainAnalysis.definitionsWithAnalysis === 0 && data.domainAnalysis.targetedDefinitions > 0 && (
              <p className="text-amber-700">
                No latest vignettes produced analyzable transcript data for the selected signature.
              </p>
            )}
            {missingDefinitionCount > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-amber-700">
                    Analysis filter excluded {missingDefinitionCount}
                    {' '}
                    vignette{missingDefinitionCount === 1 ? '' : 's'}.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleRunMissingVignettes}
                    disabled={allMissingDefinitionIds.length === 0}
                  >
                    Run Missing Vignettes
                  </Button>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-amber-800">
                  {(data.domainAnalysis.missingDefinitions ?? []).map((missing) => (
                    <li key={missing.definitionId}>
                      {missing.definitionName}
                      {' '}
                      ({missing.definitionId}) - {missing.reasonLabel} - AIs: {missing.missingAllModels ? 'All AIs' : missing.missingModelLabels.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {(domainsLoading || signaturesLoading || (selectedDomainId !== '' && fetching)) ? (
        <Loading size="lg" text="Loading domain analysis..." />
      ) : (
        <>
          <ValuePrioritiesSection
            models={models}
            selectedDomainId={selectedDomainId}
            selectedSignature={selectedSignature === '' ? null : selectedSignature}
            rankingShapes={rankingShapes}
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
