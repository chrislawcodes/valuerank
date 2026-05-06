import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { useDefinition } from '../hooks/useDefinition';
import {
  DEFINITIONS_QUERY,
  type Definition,
  type DefinitionsQueryResult,
  type DefinitionsQueryVariables,
} from '../api/operations/definitions';
import {
  RUNS_QUERY,
  type Run,
  type RunsQueryResult,
  type RunsQueryVariables,
} from '../api/operations/runs';
import {
  PRESSURE_SENSITIVITY_QUERY,
  type PressureSensitivityQueryResult,
  type PressureSensitivityQueryVariables,
} from '../api/operations/pressureSensitivity';
import { PressureSensitivityDetail } from '../components/models/PressureSensitivityDetail';
import { PressureSensitivityLimitations } from '../components/models/PressureSensitivityLimitations';
import { PressureSensitivitySanityCheck } from '../components/models/PressureSensitivitySanityCheck';
import { getPairedOrientationLabels, isPairedMethodology } from '../utils/methodology';
import { deriveRunTrialMeta } from '../utils/runDefinitionContent';

const DEFAULT_SIGNATURE = 'vnewtd';
const PAIR_KEY_COMPANION_COLLISION = 'pair_key_companion_collision';
const COMPANION_MISSING = 'companion_missing';
const NOT_PAIRED = 'not_paired';

function getRunSortTime(run: Run): number {
  return new Date(run.completedAt ?? run.createdAt).getTime();
}

function getLatestCompletedSignature(runs: Run[]): string | null {
  const latestRun = [...runs]
    .filter((run) => run.status === 'COMPLETED')
    .sort((left, right) => getRunSortTime(right) - getRunSortTime(left))[0];

  return latestRun != null ? deriveRunTrialMeta(latestRun).trialSignature : null;
}

function matchesPairKey(definition: Definition, pairKey: string): boolean {
  return definition.content.methodology?.pair_key === pairKey;
}

export function VignettePairedAnalysis() {
  const { definitionId } = useParams<{ definitionId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const signatureParam = searchParams.get('signature');
  const { definition, loading: definitionLoading, error: definitionError } = useDefinition({
    id: definitionId ?? '',
    pause: definitionId == null,
  });

  const isPaired = definition != null && isPairedMethodology(definition.content);
  const pairKey = isPaired ? definition.content.methodology?.pair_key ?? null : null;
  const domainId = definition?.domainId ?? null;

  const [{ data: definitionCandidatesData, fetching: definitionCandidatesLoading, error: definitionCandidatesError }] =
    useQuery<DefinitionsQueryResult, DefinitionsQueryVariables>({
      query: DEFINITIONS_QUERY,
      variables: {
        domainId: domainId ?? undefined,
        hasRuns: true,
        limit: 1000,
      },
      pause: !isPaired || domainId == null || pairKey == null,
      requestPolicy: 'cache-and-network',
    });

  const candidateDefinitions = useMemo(() => {
    if (definition == null || pairKey == null) {
      return [] as Definition[];
    }

    return (definitionCandidatesData?.definitions ?? []).filter(
      (candidate) => candidate.id !== definition.id && matchesPairKey(candidate, pairKey),
    );
  }, [definition, definitionCandidatesData, pairKey]);

  const companionDefinition = candidateDefinitions.length === 1 ? candidateDefinitions[0] ?? null : null;

  const [{ data: selfRunsData, fetching: selfRunsLoading, error: selfRunsError }] = useQuery<
    RunsQueryResult,
    RunsQueryVariables
  >({
    query: RUNS_QUERY,
    variables: {
      definitionId: definitionId ?? undefined,
      status: 'COMPLETED',
      limit: 1000,
    },
    pause: !isPaired || definitionId == null,
    requestPolicy: 'cache-and-network',
  });

  const [{ data: companionRunsData, fetching: companionRunsLoading, error: companionRunsError }] = useQuery<
    RunsQueryResult,
    RunsQueryVariables
  >({
    query: RUNS_QUERY,
    variables: {
      definitionId: companionDefinition?.id,
      status: 'COMPLETED',
      limit: 1000,
    },
    pause: !isPaired || companionDefinition == null,
    requestPolicy: 'cache-and-network',
  });

  const resolvedSignature = useMemo(() => {
    if (signatureParam != null) {
      return signatureParam;
    }
    if (!isPaired || definition == null) {
      return null;
    }
    if (definitionCandidatesLoading || selfRunsLoading || companionRunsLoading) {
      return null;
    }

    const sourceRuns = companionDefinition != null
      ? [...(selfRunsData?.runs ?? []), ...(companionRunsData?.runs ?? [])]
      : [...(selfRunsData?.runs ?? [])];

    return getLatestCompletedSignature(sourceRuns) ?? DEFAULT_SIGNATURE;
  }, [
    companionDefinition,
    companionRunsData,
    companionRunsLoading,
    definition,
    definitionCandidatesLoading,
    isPaired,
    selfRunsData,
    selfRunsLoading,
    signatureParam,
  ]);

  useEffect(() => {
    if (signatureParam != null || resolvedSignature == null) {
      return;
    }

    setSearchParams({ signature: resolvedSignature }, { replace: true });
  }, [resolvedSignature, setSearchParams, signatureParam]);

  const [{ data: pressureSensitivityData, fetching: pressureSensitivityLoading, error: pressureSensitivityError }] =
    useQuery<PressureSensitivityQueryResult, PressureSensitivityQueryVariables>({
      query: PRESSURE_SENSITIVITY_QUERY,
      variables: {
        definitionId: definitionId ?? undefined,
        signature: resolvedSignature ?? DEFAULT_SIGNATURE,
      },
      pause: !isPaired || definition == null || resolvedSignature == null,
      requestPolicy: 'cache-and-network',
    });

  const pressureSensitivity = pressureSensitivityData?.pressureSensitivity ?? null;
  const excludedDefinitions = pressureSensitivity?.excludedDefinitions ?? [];
  const hasCollision = excludedDefinitions.some((entry) => entry.reason === PAIR_KEY_COMPANION_COLLISION);
  const hasCompanionMissing = excludedDefinitions.some((entry) => entry.reason === COMPANION_MISSING);
  const hasNotPairedResult = excludedDefinitions.some((entry) => entry.reason === NOT_PAIRED);
  const pairedLabels = definition != null ? getPairedOrientationLabels(definition.content) : null;
  const loading =
    definitionLoading
    || (isPaired && (definitionCandidatesLoading || selfRunsLoading || companionRunsLoading || pressureSensitivityLoading))
    || (signatureParam == null && resolvedSignature == null);
  const error =
    definitionError
    ?? definitionCandidatesError
    ?? selfRunsError
    ?? companionRunsError
    ?? pressureSensitivityError;

  if (error != null) {
    return <ErrorMessage message={`Failed to load paired analysis: ${error.message}`} />;
  }

  if (definitionLoading) {
    return <Loading size="lg" text="Loading paired analysis..." />;
  }

  if (definition == null) {
    return <ErrorMessage message="Vignette not found" />;
  }

  if (!isPaired) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="space-y-2">
            <p>This vignette is not part of a paired analysis.</p>
            <Link to="/models/pressure-sensitivity" className="font-medium text-sky-700 hover:text-sky-800">
              Back to the regular analysis page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Loading size="lg" text="Loading paired analysis..." />;
  }

  if (hasNotPairedResult) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="space-y-2">
            <p>This vignette is not part of a paired analysis.</p>
            <Link to="/models/pressure-sensitivity" className="font-medium text-sky-700 hover:text-sky-800">
              Back to the regular analysis page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Paired analysis</p>
              <h1 className="text-2xl font-semibold text-gray-900">{pairedLabels?.current ?? definition.name}</h1>
              <p className="text-sm text-gray-600">{definition.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-xs text-gray-700">
                {resolvedSignature}
              </span>
              <span className="text-gray-300">•</span>
              <Link to={`/definitions/${definition.id}`} className="text-teal-600 hover:text-teal-700">
                View vignette
              </Link>
            </div>
          </div>
        </div>
      </section>

      {hasCollision && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Cannot analyze this vignette pair — multiple companion vignettes share its pair_key. Contact support to resolve.</p>
          </div>
        </section>
      )}

      {!hasCollision && hasCompanionMissing && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Companion vignette has no completed runs yet — showing single-direction data.</p>
          </div>
        </section>
      )}

      {!hasCollision &&
        (pressureSensitivity?.models.length === 0 && !hasCompanionMissing && !hasNotPairedResult ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No completed runs yet for this vignette pair.
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {pressureSensitivity?.models.map((model) => (
                <PressureSensitivityDetail key={model.modelId} model={model} />
              ))}
            </div>

            {pressureSensitivity != null && (pressureSensitivity.pressureConditionExcludedCount > 0 || pressureSensitivity.transcriptCapHit) && (
              <PressureSensitivityLimitations />
            )}

            {pressureSensitivity?.directionalSanityCheck != null && (
              <PressureSensitivitySanityCheck data={pressureSensitivity.directionalSanityCheck} />
            )}
          </>
        ))}
    </div>
  );
}
