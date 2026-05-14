import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  FULL_PVQ_TRIAL_DETAIL_QUERY,
  type FullPvqTrialDetail,
  type FullPvqTrialDetailQueryResult,
  type FullPvqTrialDetailQueryVariables,
} from '../api/operations/fullPvq';

function formatMean(mean: number | null | undefined): string {
  return mean !== null && mean !== undefined ? mean.toFixed(2) : '—';
}

function formatScore(score: number | null | undefined): string {
  return score !== null && score !== undefined ? score.toFixed(0) : '—';
}

export function FullPvqCellDetail() {
  const [searchParams] = useSearchParams();
  const surveyId = searchParams.get('surveyId') ?? '';
  const framing = searchParams.get('framing') ?? 'straight';
  const category = searchParams.get('category') ?? '';
  const modelId = searchParams.get('modelId') ?? '';

  const [{ data, fetching, error }] = useQuery<FullPvqTrialDetailQueryResult, FullPvqTrialDetailQueryVariables>({
    query: FULL_PVQ_TRIAL_DETAIL_QUERY,
    variables: { surveyId, framing, category, modelId },
    requestPolicy: 'cache-and-network',
  });

  const trials: FullPvqTrialDetail[] = data?.fullPvqTrialDetail ?? [];
  const cleanTrials = trials.filter((trial) => trial.refused === false);
  const cleanMeans = cleanTrials
    .map((trial) => trial.categoryMean)
    .filter((value): value is number => value !== null && value !== undefined);
  const overallMean = cleanMeans.length > 0
    ? cleanMeans.reduce((sum, value) => sum + value, 0) / cleanMeans.length
    : null;
  const cleanTrialCount = cleanTrials.length;
  const displayName = trials[0] !== undefined ? trials[0].displayName : modelId;

  return (
    <div className="space-y-6">
      <Link
        to={`/archive/full-pvq-results?surveyId=${surveyId}&framing=${framing}`}
        className="text-sm font-medium text-teal-700 hover:text-teal-800"
      >
        ← Back to results
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">
          {category} — {displayName}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          <span>{framing === 'desire_for_human' ? 'Desire for Human' : 'Straight'} framing</span>
          <span>Overall mean: {overallMean !== null && overallMean !== undefined ? overallMean.toFixed(2) : 'N/A'}</span>
          <span>Clean trials: {cleanTrialCount}</span>
        </div>
      </div>

      {fetching ? (
        <Loading size="lg" text="Loading trial details..." />
      ) : error !== null && error !== undefined ? (
        <ErrorMessage message={`Failed to load trial details: ${error.message}`} />
      ) : trials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <h2 className="text-lg font-medium text-gray-900">No trial details available yet.</h2>
        </div>
      ) : (
        <div className="space-y-3">
          {trials.map((trial) => {
            const refusedClass = trial.refused ? 'opacity-50 text-gray-400' : 'bg-white text-gray-900';
            return (
              <article key={trial.transcriptId} className={`rounded-xl border border-gray-200 p-4 ${refusedClass}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-medium text-inherit">{new Date(trial.createdAt).toLocaleDateString()}</h2>
                      {trial.refused ? (
                        <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                          Refused
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm">Category mean: {formatMean(trial.categoryMean)}</p>
                  </div>

                  <Link
                    to={`/transcript/${trial.transcriptId}`}
                    className="text-sm font-medium text-teal-700 hover:text-teal-800"
                  >
                    View transcript
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {trial.categoryScores.map((score) => (
                    <span
                      key={score.questionId}
                      className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {score.questionId}: {formatScore(score.score)}
                    </span>
                  ))}
                </div>

                {trial.refused ? (
                  <p className="mt-3 text-sm text-gray-500">Excluded from averages.</p>
                ) : null}

                {trial.parseWarnings.length > 0 ? (
                  <div className="mt-3 space-y-1 text-sm text-amber-700">
                    <p className="font-medium">Parse warnings</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {trial.parseWarnings.map((warning, index) => (
                        <li key={`${trial.transcriptId}-warning-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
