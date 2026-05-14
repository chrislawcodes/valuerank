import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  FULL_PVQ_RESULTS_QUERY,
  FULL_PVQ_SURVEY_QUERY,
  type FullPvqResults,
  type FullPvqResultsQueryResult,
  type FullPvqResultsQueryVariables,
  type FullPvqSurveyQueryResult,
  type FullPvqSurveyQueryVariables,
  type FullPvqModelScore,
} from '../api/operations/fullPvq';

function formatMean(mean: number | null): string {
  return mean !== null && mean !== undefined ? mean.toFixed(1) : '—';
}

function getScoreClass(mean: number | null): string {
  if (mean !== null && mean !== undefined && mean >= 5.0) {
    return 'bg-green-100 text-green-800';
  }
  if (mean !== null && mean !== undefined && mean < 2.0) {
    return 'bg-red-100 text-red-800';
  }
  return 'bg-white text-gray-900';
}

function getScoreForModel(scores: FullPvqModelScore[], modelId: string): FullPvqModelScore | null {
  const score = scores.find((entry) => entry.modelId === modelId);
  return score !== undefined ? score : null;
}

export function FullPvqResults() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const surveyId = searchParams.get('surveyId') ?? '';
  const framing = searchParams.get('framing') ?? 'straight';

  const [{ data: surveyData, fetching: surveyFetching, error: surveyError }] = useQuery<
    FullPvqSurveyQueryResult,
    FullPvqSurveyQueryVariables
  >({
    query: FULL_PVQ_SURVEY_QUERY,
    variables: { id: surveyId },
    requestPolicy: 'cache-and-network',
  });

  const [{ data: resultsData, fetching: resultsFetching, error: resultsError }] = useQuery<
    FullPvqResultsQueryResult,
    FullPvqResultsQueryVariables
  >({
    query: FULL_PVQ_RESULTS_QUERY,
    variables: { surveyId, framing },
    requestPolicy: 'cache-and-network',
  });

  const survey = surveyData?.fullPvqSurvey ?? null;
  const results: FullPvqResults = resultsData?.fullPvqResults ?? { models: [], categories: [] };
  const activeError = surveyError ?? resultsError;
  const loading = surveyFetching || resultsFetching;

  const surveyName = survey !== null ? survey.name : 'Full PVQ Results';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/archive/full-pvq" className="text-sm font-medium text-teal-700 hover:text-teal-800">
          ← Back to surveys
        </Link>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setSearchParams({ surveyId, framing: 'straight' })}
            variant={framing === 'straight' ? 'primary' : 'secondary'}
          >
            Straight
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setSearchParams({ surveyId, framing: 'desire_for_human' })}
            variant={framing === 'desire_for_human' ? 'primary' : 'secondary'}
          >
            Desire for Human
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">{surveyName}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {framing === 'desire_for_human' ? 'Desire for Human' : 'Straight'} framing results.
        </p>
      </div>

      {loading ? (
        <Loading size="lg" text="Loading full PVQ results..." />
      ) : activeError !== null && activeError !== undefined ? (
        <ErrorMessage message={`Failed to load full PVQ results: ${activeError.message}`} />
      ) : results.models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <h2 className="text-lg font-medium text-gray-900">No completed trials for this survey and framing yet.</h2>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Category</th>
                {results.models.map((model) => (
                  <th key={model.modelId} className="px-4 py-3 text-center font-medium text-gray-700">
                    {model.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.categories.map((category) => (
                <tr key={category.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{category.name}</td>
                  {results.models.map((model) => {
                    const score = getScoreForModel(category.scores, model.modelId);
                    const mean = score?.mean ?? null;
                    return (
                      <td key={`${category.name}-${model.modelId}`} className="px-2 py-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/archive/full-pvq-cell?surveyId=${surveyId}&framing=${framing}&category=${encodeURIComponent(
                                category.name
                              )}&modelId=${encodeURIComponent(model.modelId)}`
                            )
                          }
                          variant="secondary"
                          className={`w-full text-center font-medium transition-colors ${getScoreClass(mean)}`}
                        >
                          {formatMean(mean)}
                        </Button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
