/**
 * Start Paired Batch Page
 *
 * Dedicated page for launching a paired batch from a vignette detail page.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { computeLaunchTrialCount } from '@valuerank/shared';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Loading } from '../../components/ui/Loading';
import { RunForm } from '../../components/runs/RunForm';
import type { RunFormStateSnapshot } from '../../components/runs/RunForm';
import { useDefinition } from '../../hooks/useDefinition';
import { useExpandedScenarios } from '../../hooks/useExpandedScenarios';
import { useRunMutations } from '../../hooks/useRunMutations';
import type { StartRunInput } from '../../api/operations/runs';
import { getDefinitionMethodology, getDefinitionMethodologyLabel } from '../../utils/methodology';
import { formatPairLabel } from '../../utils/coverageGap';
import { VALUE_LABELS } from '../../components/domains/domainAnalysisData';

type MatchPairCounts = {
  pairKey: string;
  valueA: string;
  valueB: string;
  contributingDefinitionIds: string[];
  launchDefinitionId: string;
  laggingDirection: string;
  before: {
    directionA: { name: string; batches: number; conditions: number };
    directionB: { name: string; batches: number; conditions: number };
  };
};

type StartPairedBatchRouteState = {
  returnLabel?: string;
  returnTo?: string;
  matchPairCounts?: MatchPairCounts;
};

function renderFailure(
  title: string,
  message: string,
  backLabel: string,
  onBack: () => void,
) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          {backLabel}
        </Button>
      </div>
      <ErrorMessage message={`${title}: ${message}`} />
    </div>
  );
}

export function StartPairedBatchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const definitionId = id ?? '';
  const [runError, setRunError] = useState<string | null>(null);
  const [formSnapshot, setFormSnapshot] = useState<RunFormStateSnapshot | null>(null);
  const routeState = location.state as StartPairedBatchRouteState | null;

  const isRouteInvalid = definitionId === '' || definitionId === 'new';

  const {
    definition,
    loading: definitionLoading,
    error: definitionError,
  } = useDefinition({
    id: definitionId,
    pause: isRouteInvalid,
  });

  const resolvedContent = definition?.resolvedContent ?? definition?.content;
  const methodology = useMemo(
    () => (resolvedContent ? getDefinitionMethodology(resolvedContent) : null),
    [resolvedContent]
  );
  const methodologyLabel = useMemo(
    () => getDefinitionMethodologyLabel(resolvedContent, definition?.domain?.name ?? null),
    [definition?.domain?.name, resolvedContent]
  );
  const isPairedBatchEligible = methodology?.pair_key != null;
  const matchPairCounts = routeState?.matchPairCounts ?? null;
  const pairLabel = matchPairCounts != null
    ? formatPairLabel(matchPairCounts.valueA, matchPairCounts.valueB)
    : null;
  const backTo = routeState?.returnTo ?? (definition ? `/definitions/${definition.id}` : '/definitions');
  const backLabel = routeState?.returnLabel ?? 'Back to Vignette';

  const {
    totalCount: scenarioCount,
    loading: scenarioCountLoading,
    error: scenarioCountError,
  } = useExpandedScenarios({
    definitionId,
    pause: isRouteInvalid || definitionLoading || definition == null || !isPairedBatchEligible,
    limit: 1,
  });

  const { startRun, loading: isSubmitting } = useRunMutations();

  useEffect(() => {
    setRunError(null);
  }, [definitionId]);

  const handleStartRun = async (input: StartRunInput) => {
    setRunError(null);
    try {
      const submitInput = matchPairCounts != null
        ? ({
            ...input,
            launchMode: 'PAIRED_BATCH_TOPUP',
            topUpDirection: matchPairCounts.laggingDirection,
          } as StartRunInput)
        : input;
      const result = await startRun(submitInput);
      navigate(`/runs/${result.run.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start paired batch';
      setRunError(message);
      throw error;
    }
  };

  if (isRouteInvalid) {
    return renderFailure(
      'Invalid vignette',
      'This route needs a valid vignette ID to start a paired batch.',
      routeState?.returnLabel ?? 'Back to Vignettes',
      () => navigate(routeState?.returnTo ?? '/definitions')
    );
  }

  if (definitionLoading || (definition == null && definitionError == null)) {
    return <Loading size="lg" text="Loading vignette..." />;
  }

  if (definitionError) {
    return renderFailure(
      'Failed to load vignette',
      definitionError.message,
      backLabel,
      () => navigate(backTo)
    );
  }

  if (!definition) {
    return renderFailure(
      'Vignette not found',
      'The selected vignette could not be loaded.',
      backLabel,
      () => navigate(backTo)
    );
  }

  if (!isPairedBatchEligible) {
    return renderFailure(
      'Paired batch unavailable',
      'This vignette is not configured for paired-batch launches.',
      backLabel,
      () => navigate(backTo)
    );
  }

  const previewScenarioCount = scenarioCountLoading ? definition.scenarioCount ?? 0 : scenarioCount;
  const topUpTrials = matchPairCounts != null && formSnapshot != null
    ? computeLaunchTrialCount({
        scenarioCount: previewScenarioCount,
        samplePercentage: formSnapshot.isSpecificConditionTrial
          ? 100
          : formSnapshot.formState.samplePercentage,
        samplesPerScenario: formSnapshot.formState.samplesPerScenario,
        scenarioIds: formSnapshot.isSpecificConditionTrial
          ? formSnapshot.selectedConditionScenarioIds
          : undefined,
        modelCount: formSnapshot.formState.selectedModels.length,
      })
    : 0;
  const topUpBatches = matchPairCounts != null ? 1 : 0;
  const beforeA = matchPairCounts?.before.directionA ?? null;
  const beforeB = matchPairCounts?.before.directionB ?? null;
  const afterA = matchPairCounts == null || beforeA == null || beforeB == null
    ? null
    : beforeA.name === matchPairCounts.laggingDirection
      ? {
          ...beforeA,
          batches: beforeA.batches + topUpBatches,
          conditions: beforeA.conditions + topUpTrials,
        }
      : beforeA;
  const afterB = matchPairCounts == null || beforeA == null || beforeB == null
    ? null
    : beforeB.name === matchPairCounts.laggingDirection
      ? {
          ...beforeB,
          batches: beforeB.batches + topUpBatches,
          conditions: beforeB.conditions + topUpTrials,
        }
      : beforeB;
  const residualMismatch = afterA != null && afterB != null
    ? Math.abs(afterA.batches - afterB.batches) > 0 || Math.abs(afterA.conditions - afterB.conditions) > 0
    : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          {backLabel}
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-medium text-gray-900">Start Paired Batch</h1>
          {methodologyLabel && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              {methodologyLabel}
            </span>
          )}
        </div>
        <p className="mb-6 text-gray-600">
          Configure and start a paired batch for &quot;{definition.name}&quot;
        </p>
        {scenarioCountError && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {scenarioCountError.message}
          </div>
        )}
        {runError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {runError}
          </div>
        )}
        {matchPairCounts != null && pairLabel && beforeA != null && beforeB != null && afterA != null && afterB != null && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-amber-900">Match Pair Counts</p>
                <p className="text-sm text-amber-800">{pairLabel}</p>
              </div>
              <div className="text-xs text-amber-700">
                Top-up direction: {VALUE_LABELS[matchPairCounts.laggingDirection as keyof typeof VALUE_LABELS] ?? matchPairCounts.laggingDirection}
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-md border border-amber-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 text-amber-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Direction</th>
                    <th className="px-3 py-2 text-right font-medium">Batches</th>
                    <th className="px-3 py-2 text-right font-medium">Conditions</th>
                  </tr>
                </thead>
                <tbody>
                  {[beforeA, beforeB].map((beforeRow, index) => {
                    const afterRow = index === 0 ? afterA : afterB;
                    return (
                      <tr key={beforeRow.name} className="border-t border-amber-100">
                        <td className="px-3 py-2 text-left font-medium text-gray-900">
                          {VALUE_LABELS[beforeRow.name as keyof typeof VALUE_LABELS] ?? beforeRow.name}-first
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {beforeRow.batches} <span className="text-gray-400">→</span> {afterRow?.batches ?? beforeRow.batches}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {beforeRow.conditions} <span className="text-gray-400">→</span> {afterRow?.conditions ?? beforeRow.conditions}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-sm text-amber-800">
              Adds {topUpBatches} batch{topUpBatches === 1 ? '' : 'es'} and {topUpTrials} trial{topUpTrials === 1 ? '' : 's'}.
            </div>
            {residualMismatch && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900">
                This launch still leaves a mismatch after the top-up. Review the current batches before starting.
              </div>
            )}
          </div>
        )}
        <RunForm
          definitionId={definition.id}
          definitionContent={resolvedContent}
          scenarioCount={scenarioCountLoading ? definition.scenarioCount ?? 0 : scenarioCount}
          copyMode="paired-batch"
          defaultLaunchMode={matchPairCounts != null ? 'PAIRED_BATCH_TOPUP' : 'PAIRED_BATCH'}
          launchModeLocked={matchPairCounts != null}
          onStateChange={matchPairCounts != null ? setFormSnapshot : undefined}
          onSubmit={handleStartRun}
          onCancel={() => navigate(`/definitions/${definition.id}`)}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
