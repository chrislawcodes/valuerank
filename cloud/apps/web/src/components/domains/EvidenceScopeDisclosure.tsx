import { useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DomainFindingsEligibility } from '../../api/operations/domainAnalysis';

export type EvidenceScopeState =
  | { kind: 'loading' }
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

export function getEvidenceScopeState(
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

export function EvidenceScopeDisclosure({
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
              {state.recommendedAction != null && (
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
                {state.latestEligibleEvaluationId != null && (
                  <div>
                    <span className="font-semibold text-gray-900">Latest eligible cohort:</span>{' '}
                    {state.latestEligibleEvaluationId.slice(-8)}
                  </div>
                )}
                {state.latestEligibleScopeCategory != null && (
                  <div>
                    <span className="font-semibold text-gray-900">Latest eligible scope:</span>{' '}
                    {state.latestEligibleScopeCategory.toLowerCase()}
                  </div>
                )}
                {state.latestEligibleCompletedAt != null && (
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
              {state.kind === 'error' && state.note != null && (
                <p className="text-xs text-gray-600">{state.note}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
