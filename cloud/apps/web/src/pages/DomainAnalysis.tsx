import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Button } from '../components/ui/Button';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  DOMAIN_ANALYSIS_QUERY,
  DOMAIN_ANALYSIS_QUERY_LEGACY,
  DOMAIN_FINDINGS_ELIGIBILITY_QUERY,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
  type DomainAvailableSignaturesQueryVariables,
  type DomainFindingsEligibilityQueryResult,
  type DomainFindingsEligibilityQueryVariables,
  type DomainAnalysisQueryResult,
  type DomainAnalysisQueryVariables,
} from '../api/operations/domainAnalysis';
import { ModelGroupsSection } from '../components/domains/ModelGroupsSection';
import { DominanceSection } from '../components/domains/DominanceSection';
import { SimilaritySection } from '../components/domains/SimilaritySection';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import { EvidenceScopeDisclosure, getEvidenceScopeState } from '../components/domains/EvidenceScopeDisclosure';
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
  if (isVnewSignature(signature)) {
    try { return parseVnewTemperature(signature); } catch { return null; }
  }
  const match = signature.match(/t(.+)$/);
  if (match != null) {
    const token = match[1] ?? '';
    if (token === 'd') return null;
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getSignaturePriority(option: DomainAvailableSignature): number {
  if (option.signature === 'vnewtd') return 0;
  if (!option.isVirtual && /td$/i.test(option.signature)) return 1;
  if (option.isVirtual) return 2;
  return 3;
}

function formatSignatureOptionLabel(option: DomainAvailableSignature): string {
  if (option.isVirtual) return option.label;
  const defaultMatch = option.signature.match(/^v(\d+)td$/i);
  if (defaultMatch != null) return `v${defaultMatch[1]} @ default`;
  const tempMatch = option.signature.match(/^v(\d+)t(.+)$/i);
  if (tempMatch != null) return `v${tempMatch[1]} @ t=${tempMatch[2]}`;
  return option.label;
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
    DomainAvailableSignaturesQueryResult, DomainAvailableSignaturesQueryVariables
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const signatureOptions = useMemo<DomainAvailableSignature[]>(() => {
    const options = signatureData?.domainAvailableSignatures ?? [];
    return options
      .map((option, index) => ({ option, index }))
      .sort((a, b) => {
        const p = getSignaturePriority(a.option) - getSignaturePriority(b.option);
        return p !== 0 ? p : a.index - b.index;
      })
      .map(({ option }) => option);
  }, [signatureData]);

  const [{ data: findingsEligibilityData, fetching: findingsEligibilityLoading, error: findingsEligibilityError }] = useQuery<
    DomainFindingsEligibilityQueryResult, DomainFindingsEligibilityQueryVariables
  >({
    query: DOMAIN_FINDINGS_ELIGIBILITY_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const hasValidSelectedSignature = useMemo(
    () => selectedSignature !== '' && signatureOptions.some((o) => o.signature === selectedSignature),
    [selectedSignature, signatureOptions],
  );
  const signatureSelectionReady = selectedDomainId !== '' && !signaturesLoading
    && (signatureOptions.length === 0 || hasValidSelectedSignature);

  useEffect(() => {
    if (domains.length === 0) return;
    if (selectedDomainId !== '' && domains.some((d) => d.id === selectedDomainId)) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (signatureOptions.length === 0) { setSelectedSignature(''); return; }
    if (selectedSignature !== '' && signatureOptions.some((o) => o.signature === selectedSignature)) return;
    setSelectedSignature(signatureOptions[0]?.signature ?? '');
  }, [selectedSignature, signatureOptions]);

  useEffect(() => { setExportError(null); }, [selectedDomainId, selectedSignature]);

  useEffect(() => {
    if (selectedDomainId === '') return;
    if (searchParams.get('domainId') === selectedDomainId && (searchParams.get('signature') ?? '') === selectedSignature) return;
    const next = new URLSearchParams(searchParams);
    next.set('domainId', selectedDomainId);
    next.set('scoreMethod', 'FULL_BT');
    if (selectedSignature === '') next.delete('signature');
    else next.set('signature', selectedSignature);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedDomainId, selectedSignature, setSearchParams]);

  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<DomainAnalysisQueryResult, DomainAnalysisQueryVariables>({
    query: DOMAIN_ANALYSIS_QUERY,
    variables: { domainId: selectedDomainId, scoreMethod: 'FULL_BT', signature: selectedSignature === '' ? undefined : selectedSignature },
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
    const isFieldError = message.includes('Unknown argument "scoreMethod"')
      || message.includes('Unknown argument "signature"')
      || message.includes('Cannot query field')
      || message.includes('Unknown field');
    if (isFieldError && !useLegacyQuery) setUseLegacyQuery(true);
  }, [scoredError, useLegacyQuery]);

  const data = useLegacyQuery ? legacyData : scoredData;
  const fetching = useLegacyQuery ? legacyFetching : scoredFetching;
  const error = useLegacyQuery ? legacyError : scoredError;
  const findingsEligibility = findingsEligibilityData?.domainFindingsEligibility;
  const evidenceScopeState = useMemo(
    () => getEvidenceScopeState(findingsEligibility, findingsEligibilityLoading, findingsEligibilityError),
    [findingsEligibility, findingsEligibilityLoading, findingsEligibilityError],
  );

  const models = useMemo<ModelEntry[]>(() => {
    const sourceModels = data?.domainAnalysis.models ?? [];
    return sourceModels.map((model) => {
      const valueMap = new Map(model.values.map((e) => [e.valueKey, e.score]));
      const winRateMap = new Map(model.values.map((e) => {
        const denom = e.prioritized + e.deprioritized;
        return [e.valueKey, denom > 0 ? (e.prioritized / denom) * 100 : null] as const;
      }));
      const values = VALUES.reduce<Record<ValueKey, number>>((acc, k) => { acc[k] = valueMap.get(k) ?? 0; return acc; }, {} as Record<ValueKey, number>);
      const winRates = VALUES.reduce<Record<ValueKey, number | null>>((acc, k) => { acc[k] = winRateMap.get(k) ?? null; return acc; }, {} as Record<ValueKey, number | null>);
      return { model: model.model, label: model.label, values, winRates };
    });
  }, [data]);

  const unavailableModels = useMemo<DomainAnalysisModelAvailability[]>(
    () => (data?.domainAnalysis.unavailableModels ?? []).map((m) => ({ model: m.model, label: m.label, reason: m.reason })),
    [data],
  );
  const missingDefinitionCount = data?.domainAnalysis.missingDefinitions?.length ?? 0;
  const allMissingDefinitionIds = useMemo(
    () => (data?.domainAnalysis.missingDefinitions ?? []).map((m) => m.definitionId),
    [data?.domainAnalysis.missingDefinitions],
  );

  const handleExport = async () => {
    if (selectedDomainId === '') return;
    setExportLoading(true);
    setExportError(null);
    try {
      await exportDomainTranscriptsAsCSV(selectedDomainId, selectedSignature !== '' ? selectedSignature : undefined);
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
      const t = parseTemperatureFromSignature(selectedSignature);
      if (t !== null) query.set('temperature', String(t));
    }
    navigate(`/domains/${selectedDomainId}/status?${query.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Findings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Structured domain interpretation across priorities, ranking behavior, and similarity for the selected domain.
        </p>
      </div>

      {(domainsError != null || signaturesError != null || error != null) && (
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
              onChange={(e) => setSelectedDomainId(e.target.value)}
              disabled={domainsLoading || domains.length === 0}
            >
              {domains.length === 0 && <option value="">No domains available</option>}
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>{domain.name}</option>
              ))}
            </select>
            <select
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              value={selectedSignature}
              onChange={(e) => setSelectedSignature(e.target.value)}
              disabled={signaturesLoading || signatureOptions.length === 0}
            >
              {signatureOptions.length === 0 && <option value="">No signatures with completed runs</option>}
              {signatureOptions.map((opt) => (
                <option key={opt.signature} value={opt.signature}>{formatSignatureOptionLabel(opt)}</option>
              ))}
            </select>
            <Button type="button" variant="secondary" size="sm" onClick={handleExport} disabled={selectedDomainId === '' || exportLoading}>
              {exportLoading ? 'Exporting\u2026' : 'Export CSV'}
            </Button>
          </div>
          {exportError !== null && <p className="mt-1 text-xs text-amber-700">{exportError}</p>}
        </div>
        {data?.domainAnalysis != null && (
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <p>{data.domainAnalysis.definitionsWithAnalysis} of {data.domainAnalysis.targetedDefinitions} latest vignettes currently have aggregate analysis data.</p>
            {data.domainAnalysis.definitionsWithAnalysis === 0 && data.domainAnalysis.targetedDefinitions > 0 && (
              <p className="text-amber-700">No latest vignettes produced analyzable transcript data for the selected signature.</p>
            )}
            {missingDefinitionCount > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-amber-700">Analysis filter excluded {missingDefinitionCount} vignette{missingDefinitionCount === 1 ? '' : 's'}.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={handleRunMissingVignettes} disabled={allMissingDefinitionIds.length === 0}>
                    Run Missing Vignettes
                  </Button>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-amber-800">
                  {(data.domainAnalysis.missingDefinitions ?? []).map((m) => (
                    <li key={m.definitionId}>
                      {m.definitionName} ({m.definitionId}) - {m.reasonLabel} - AIs: {m.missingAllModels ? 'All AIs' : m.missingModelLabels.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {selectedDomainId !== '' && <EvidenceScopeDisclosure state={evidenceScopeState} />}

      {(domainsLoading || signaturesLoading || (selectedDomainId !== '' && fetching)) ? (
        <Loading size="lg" text="Loading domain analysis..." />
      ) : (
        <>
          <ModelGroupsSection clusterAnalysis={data?.domainAnalysis.clusterAnalysis} />
          <ValuePrioritiesSection models={models} selectedDomainId={selectedDomainId} selectedSignature={selectedSignature === '' ? null : selectedSignature} />
          <DominanceSection models={models} unavailableModels={unavailableModels} />
          <SimilaritySection models={models} clusterAnalysis={data?.domainAnalysis.clusterAnalysis} />
        </>
      )}

      {unavailableModels.length > 0 && (
        <footer className="text-xs text-gray-500">
          <p className="font-medium text-gray-600">Data availability note</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {unavailableModels.map((m) => (
              <li key={m.model}>{m.label}: {m.reason} This model is excluded from analysis tables and graph selectors.</li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}
