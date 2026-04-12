import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
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
  type DomainFindingsEligibility,
} from '../api/operations/domainAnalysis';
import { ModelGroupsSection } from '../components/domains/ModelGroupsSection';
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
  if (isVnewSignature(signature)) {
    try {
      return parseVnewTemperature(signature);
    } catch {
      return null;
    }
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

function getSignaturePriority(option: DomainAvailableSignature): number {
  if (option.signature === 'vnewtd') return 0;
  if (!option.isVirtual && /td$/i.test(option.signature)) return 1;
  if (option.isVirtual) return 2;
  return 3;
}

function formatSignatureOptionLabel(option: DomainAvailableSignature): string {
  if (option.isVirtual) return option.label;
  const defaultMatch = option.signature.match(/^v(\d+)td$/i);
  if (defaultMatch) {
    return `v${defaultMatch[1]} @ default`;
  }
  const tempMatch = option.signature.match(/^v(\d+)t(.+)$/i);
  if (tempMatch) {
    return `v${tempMatch[1]} @ t=${tempMatch[2]}`;
  }
  return option.label;
}

type EvidenceScopeState =
  | {
      kind: 'loading';
    }
  | {
      kind: 'auditable' | 'diagnostic';
      label: string;
      summary: string;
      reasons: string[];
      recommendedAction: string | null;
      completedEligibleEvaluationCount: number;
      consideredScopeCategories: string[];
      latestEligibleEvaluationId: string | null;
      latestEligibleScopeCategory: string | null;
      latestEligibleCompletedAt: string | null;
    }
  | {
      kind: 'unavailable';
      label: 'scope unavailable';
      summary: string;
      reasons: string[];
      note: string | null;
    }
  | {
      kind: 'error';
      label: 'scope unavailable';
      summary: string;
      reasons: string[];
      note: string;
    };

function getEvidenceScopeState(
  findingsEligibilityData: DomainFindingsEligibility | undefined,
  findingsEligibilityLoading: boolean,
  findingsEligibilityError: { message: string } | undefined,
): EvidenceScopeState {
  if (findingsEligibilityData != null) {
    if (findingsEligibilityData.eligible === true || findingsEligibilityData.eligible === false) {
      return {
        kind: findingsEligibilityData.eligible ? 'auditable' : 'diagnostic',
        label: findingsEligibilityData.eligible ? 'auditable findings' : 'diagnostic evidence only',
        summary: findingsEligibilityData.summary,
        reasons: findingsEligibilityData.reasons ?? [],
        recommendedAction: findingsEligibilityData.recommendedActions[0] ?? null,
        completedEligibleEvaluationCount: findingsEligibilityData.completedEligibleEvaluationCount,
        consideredScopeCategories: findingsEligibilityData.consideredScopeCategories.map((scope) => scope.toLowerCase()),
        latestEligibleEvaluationId: findingsEligibilityData.latestEligibleEvaluationId,
        latestEligibleScopeCategory: findingsEligibilityData.latestEligibleScopeCategory,
        latestEligibleCompletedAt: findingsEligibilityData.latestEligibleCompletedAt,
      };
    }

    return {
      kind: 'unavailable',
      label: 'scope unavailable',
      summary: 'The current scope could not be confirmed.',
      reasons: findingsEligibilityData.reasons ?? [],
      note: null,
    };
  }

  if (findingsEligibilityLoading) {
    return { kind: 'loading' };
  }

  if (findingsEligibilityError != null) {
    return {
      kind: 'error',
      label: 'scope unavailable',
      summary: 'Eligibility data could not load.',
      reasons: [],
      note: findingsEligibilityError.message,
    };
  }

  return {
    kind: 'unavailable',
    label: 'scope unavailable',
    summary: 'The current scope could not be confirmed.',
    reasons: [],
    note: null,
  };
}

function EvidenceScopeDisclosure({
  state,
}: {
  state: EvidenceScopeState;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = 'domain-analysis-evidence-scope-details';

  if (state.kind === 'loading') {
    return (
      <div className="inline-flex min-h-[40px] items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading scope...
      </div>
    );
  }

  const isPositive = state.kind === 'auditable' || state.kind === 'diagnostic';
  const chipClasses = isPositive
    ? state.kind === 'auditable'
      ? 'border-green-200 bg-green-100 text-green-900'
      : 'border-amber-200 bg-amber-100 text-amber-900'
    : 'border-gray-300 bg-gray-100 text-gray-800';
  const buttonClasses = `inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${chipClasses} ${
    isPositive ? 'hover:brightness-95' : 'hover:bg-gray-200'
  }`;
  const badgeText = state.label;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-2">
        <Button
          type="button"
          className={buttonClasses}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          aria-label={isExpanded ? 'Hide evidence scope details' : 'Show evidence scope details'}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {!isPositive && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="whitespace-normal text-left">Current evidence scope: {badgeText}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
      </div>
      {state.kind === 'error' && (
        <p className="mt-1 text-xs text-gray-500">{state.summary}</p>
      )}

      {isExpanded && (
        <div
          id={detailsId}
          className="mt-3 max-h-[50vh] overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700"
        >
          <div
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
              isPositive ? (state.kind === 'auditable'
                ? 'border-green-200 bg-green-100 text-green-900'
                : 'border-amber-200 bg-amber-100 text-amber-900')
                : 'border-gray-300 bg-gray-100 text-gray-800'
            }`}
          >
            Current evidence scope: {badgeText}
          </div>
          <p className={`font-semibold ${isPositive ? 'text-gray-900' : 'text-gray-800'}`}>
            {state.summary}
          </p>

          {state.kind === 'auditable' || state.kind === 'diagnostic' ? (
            <div className="mt-3 space-y-3">
              {state.reasons.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasons</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {state.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {state.recommendedAction && (
                <p className="text-sm">
                  <span className="font-medium text-gray-900">Recommended next step:</span>{' '}
                  {state.recommendedAction}
                </p>
              )}
              <div className="grid gap-2 rounded-lg border border-white bg-white p-3 text-xs text-gray-700 sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-gray-900">Completed eligible evaluations:</span>{' '}
                  {state.completedEligibleEvaluationCount}
                </div>
                <div>
                  <span className="font-semibold text-gray-900">Scopes considered:</span>{' '}
                  {state.consideredScopeCategories.join(', ')}
                </div>
                {state.latestEligibleEvaluationId && (
                  <div>
                    <span className="font-semibold text-gray-900">Latest eligible cohort:</span>{' '}
                    {state.latestEligibleEvaluationId.slice(-8)}
                  </div>
                )}
                {state.latestEligibleScopeCategory && (
                  <div>
                    <span className="font-semibold text-gray-900">Latest eligible scope:</span>{' '}
                    {state.latestEligibleScopeCategory.toLowerCase()}
                  </div>
                )}
                {state.latestEligibleCompletedAt && (
                  <div>
                    <span className="font-semibold text-gray-900">Latest eligible completed:</span>{' '}
                    {new Date(state.latestEligibleCompletedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p>{state.kind === 'error' ? 'Eligibility data could not load.' : 'The current scope could not be confirmed.'}</p>
              {state.reasons.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Raw reason text</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {state.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {state.kind === 'error' && state.note && (
                <p className="text-xs text-gray-600">{state.note}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
    () => {
      const options = signatureData?.domainAvailableSignatures ?? [];
      return options
        .map((option, index) => ({ option, index }))
        .sort((left, right) => {
          const priorityDifference = getSignaturePriority(left.option) - getSignaturePriority(right.option);
          if (priorityDifference !== 0) return priorityDifference;
          return left.index - right.index;
        })
        .map(({ option }) => option);
    },
    [signatureData],
  );
  const [{ data: findingsEligibilityData, fetching: findingsEligibilityLoading, error: findingsEligibilityError }] = useQuery<
    DomainFindingsEligibilityQueryResult,
    DomainFindingsEligibilityQueryVariables
  >({
    query: DOMAIN_FINDINGS_ELIGIBILITY_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });
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
    const isUnknownArgumentError =
      message.includes('Unknown argument "scoreMethod"')
      || message.includes('Unknown argument "signature"');
    const isUnknownFieldError =
      message.includes('Cannot query field')
      || message.includes('Unknown field');
    if ((isUnknownArgumentError || isUnknownFieldError) && !useLegacyQuery) {
      setUseLegacyQuery(true);
    }
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
      const valueMap = new Map(model.values.map((entry) => [entry.valueKey, entry.score]));
      const winRateMap = new Map(model.values.map((entry) => {
        const denom = entry.prioritized + entry.deprioritized;
        const rate = denom > 0 ? (entry.prioritized / denom) * 100 : null;
        return [entry.valueKey, rate] as const;
      }));
      const values = VALUES.reduce<Record<ValueKey, number>>((acc, valueKey) => {
        acc[valueKey] = valueMap.get(valueKey) ?? 0;
        return acc;
      }, {} as Record<ValueKey, number>);
      const winRates = VALUES.reduce<Record<ValueKey, number | null>>((acc, valueKey) => {
        acc[valueKey] = winRateMap.get(valueKey) ?? null;
        return acc;
      }, {} as Record<ValueKey, number | null>);
      return {
        model: model.model,
        label: model.label,
        values,
        winRates,
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
                  {formatSignatureOptionLabel(signatureOption)}
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

      {selectedDomainId !== '' && (
        <EvidenceScopeDisclosure state={evidenceScopeState} />
      )}

      {(domainsLoading || signaturesLoading || (selectedDomainId !== '' && fetching)) ? (
        <Loading size="lg" text="Loading domain analysis..." />
      ) : (
        <>
          <ModelGroupsSection clusterAnalysis={data?.domainAnalysis.clusterAnalysis} />
          <ValuePrioritiesSection
            models={models}
            selectedDomainId={selectedDomainId}
            selectedSignature={selectedSignature === '' ? null : selectedSignature}
          />
          <DominanceSection models={models} unavailableModels={unavailableModels} />
          <SimilaritySection models={models} clusterAnalysis={data?.domainAnalysis.clusterAnalysis} />
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
