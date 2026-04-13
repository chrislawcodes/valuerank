/**
 * Start Paired Batch Page
 *
 * Dedicated page for launching a paired batch from a vignette detail page.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Loading } from '../../components/ui/Loading';
import { RunForm } from '../../components/runs/RunForm';
import { useDefinition } from '../../hooks/useDefinition';
import { useExpandedScenarios } from '../../hooks/useExpandedScenarios';
import { useRunMutations } from '../../hooks/useRunMutations';
import type { StartRunInput } from '../../api/operations/runs';
import { getDefinitionMethodology, getDefinitionMethodologyLabel } from '../../utils/methodology';

type StartPairedBatchRouteState = {
  returnLabel?: string;
  returnTo?: string;
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
      const result = await startRun(input);
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
        <RunForm
          definitionId={definition.id}
          definitionContent={resolvedContent}
          scenarioCount={scenarioCountLoading ? definition.scenarioCount ?? 0 : scenarioCount}
          copyMode="paired-batch"
          onSubmit={handleStartRun}
          onCancel={() => navigate(`/definitions/${definition.id}`)}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
