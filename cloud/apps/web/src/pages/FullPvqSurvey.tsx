import { Fragment, type ChangeEvent, type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { TransitionNotice } from '../components/ui/TransitionNotice';
import { ModelSelector } from '../components/runs/ModelSelector';
import { useAvailableModels } from '../hooks/useAvailableModels';
import {
  FULL_PVQ_SURVEYS_QUERY,
  CREATE_FULL_PVQ_MUTATION,
  DELETE_FULL_PVQ_MUTATION,
  START_FULL_PVQ_RUN_MUTATION,
  type FullPvqSurvey,
  type FullPvqSurveysQueryResult,
  type CreateFullPvqMutationResult,
  type CreateFullPvqMutationVariables,
  type DeleteFullPvqMutationResult,
  type DeleteFullPvqMutationVariables,
  type StartFullPvqRunMutationResult,
  type StartFullPvqRunMutationVariables,
} from '../api/operations/fullPvq';

type SurveyRunState = {
  framing: 'straight' | 'desire_for_human';
  selectedModels: string[];
  samplesPerScenario: number;
};

function createDefaultRunState(): SurveyRunState {
  return {
    framing: 'straight',
    selectedModels: [],
    samplesPerScenario: 1,
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export function FullPvqSurvey() {
  const [{ data, fetching, error }, reexecuteQuery] = useQuery<FullPvqSurveysQueryResult>({
    query: FULL_PVQ_SURVEYS_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const [{ fetching: creating }, createFullPvq] = useMutation<CreateFullPvqMutationResult, CreateFullPvqMutationVariables>(
    CREATE_FULL_PVQ_MUTATION
  );
  const [{ fetching: deleting }, deleteFullPvq] = useMutation<DeleteFullPvqMutationResult, DeleteFullPvqMutationVariables>(
    DELETE_FULL_PVQ_MUTATION
  );
  const [{ fetching: starting }, startFullPvqRun] = useMutation<StartFullPvqRunMutationResult, StartFullPvqRunMutationVariables>(
    START_FULL_PVQ_RUN_MUTATION
  );
  const { models: availableModels, loading: availableModelsLoading } = useAvailableModels();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSurveyName, setNewSurveyName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [runStates, setRunStates] = useState<Record<string, SurveyRunState>>({});

  const surveys = data?.fullPvqSurveys ?? [];

  function getRunState(surveyId: string): SurveyRunState {
    const current = runStates[surveyId];
    return current !== undefined ? current : createDefaultRunState();
  }

  function updateRunState(surveyId: string, patch: Partial<SurveyRunState>): void {
    setRunStates((prev) => {
      const current = prev[surveyId];
      const base = current !== undefined ? current : createDefaultRunState();
      return {
        ...prev,
        [surveyId]: {
          ...base,
          ...patch,
        },
      };
    });
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedName = newSurveyName.trim();
    if (trimmedName === '') {
      setCreateError('Survey name is required.');
      return;
    }

    setCreateError(null);
    const result = await createFullPvq({ name: trimmedName });
    if (result.error !== undefined && result.error !== null) {
      setCreateError(result.error.message);
      return;
    }

    setCreateModalOpen(false);
    setNewSurveyName('');
    void reexecuteQuery({ requestPolicy: 'network-only' });
  }

  async function handleDeleteSurvey(survey: FullPvqSurvey): Promise<void> {
    const confirmed = window.confirm('Delete this survey?');
    if (confirmed === false) {
      return;
    }

    const result = await deleteFullPvq({ id: survey.id });
    if (result.error !== undefined && result.error !== null) {
      window.alert(`Failed to delete survey: ${result.error.message}`);
      return;
    }

    void reexecuteQuery({ requestPolicy: 'network-only' });
  }

  async function handleStartRun(survey: FullPvqSurvey): Promise<void> {
    const runState = getRunState(survey.id);
    if (runState.selectedModels.length === 0) {
      window.alert('Select at least one model before starting a run.');
      return;
    }

    const samplesPerScenario = runState.samplesPerScenario >= 1 ? runState.samplesPerScenario : 1;
    const result = await startFullPvqRun({
      surveyId: survey.id,
      framing: runState.framing,
      models: runState.selectedModels,
      samplesPerScenario,
    });

    if (result.error !== undefined && result.error !== null) {
      window.alert(`Failed to start run: ${result.error.message}`);
      return;
    }

    const jobCount = result.data?.startFullPvqRun.jobCount;
    if (jobCount !== undefined) {
      window.alert(`Run started. Job count: ${jobCount}`);
    }
  }

  function handleFramingChange(surveyId: string, event: ChangeEvent<HTMLSelectElement>): void {
    const framing = event.target.value === 'desire_for_human' ? 'desire_for_human' : 'straight';
    updateRunState(surveyId, { framing });
  }

  function handleSamplesChange(surveyId: string, event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = Number(event.target.value);
    const samplesPerScenario = Number.isInteger(nextValue) && nextValue >= 1 ? nextValue : 1;
    updateRunState(surveyId, { samplesPerScenario });
  }

  return (
    <div className="space-y-6">
      <TransitionNotice
        eyebrow="Archive Compatibility"
        title="Full PVQ surveys now live under Archive"
        description="Use this surface to manage historical full PVQ surveys and launch new archive runs."
        links={[
          { label: 'Open Archive home', to: '/archive' },
          { label: 'Open full PVQ results', to: '/archive/full-pvq-results' },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Full PVQ Surveys</h1>
          <p className="mt-2 text-sm text-gray-600">Archive management surface for full PVQ survey sets.</p>
        </div>
        <Button type="button" onClick={() => setCreateModalOpen(true)}>
          Create Full PVQ Survey
        </Button>
      </div>

      {fetching ? (
        <Loading size="lg" text="Loading full PVQ surveys..." />
      ) : error !== null && error !== undefined ? (
        <ErrorMessage message={`Failed to load full PVQ surveys: ${error.message}`} />
      ) : surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <h2 className="text-lg font-medium text-gray-900">No Full PVQ surveys yet.</h2>
          <p className="mt-2 text-sm text-gray-600">Create one to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Straight Trials</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Desire Trials</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Created</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {surveys.map((survey) => {
                const runState = getRunState(survey.id);
                return (
                  <Fragment key={survey.id}>
                    <tr className="align-top hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{survey.name}</td>
                      <td className="px-4 py-3 text-gray-700">{survey.straightTrialCount}</td>
                      <td className="px-4 py-3 text-gray-700">{survey.desireTrialCount}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(survey.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDeleteSurvey(survey)}
                            disabled={deleting || starting || creating}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="bg-slate-50 px-4 py-4">
                        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                          <div className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                Framing
                              </label>
                              <select
                                value={runState.framing}
                                onChange={(event) => handleFramingChange(survey.id, event)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                              >
                                <option value="straight">Straight (like me)</option>
                                <option value="desire_for_human">Desire for Human</option>
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                                Trials per model
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={runState.samplesPerScenario}
                                onChange={(event) => handleSamplesChange(survey.id, event)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                              />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleStartRun(survey)}
                                isLoading={starting}
                                disabled={deleting || creating}
                              >
                                Start Run
                              </Button>
                              <Link
                                to={`/archive/full-pvq-results?surveyId=${survey.id}&framing=straight`}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:min-h-0"
                              >
                                View Results
                              </Link>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                              Models
                            </label>
                            <ModelSelector
                              models={availableModels}
                              selectedModels={runState.selectedModels}
                              onSelectionChange={(nextModels) => updateRunState(survey.id, { selectedModels: nextModels })}
                              loading={availableModelsLoading}
                              disabled={starting}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-medium text-gray-900">Create Full PVQ Survey</h2>
            <form className="mt-4 space-y-4" onSubmit={handleCreateSubmit}>
              <div>
                <label htmlFor="full-pvq-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Survey name
                </label>
                <input
                  id="full-pvq-name"
                  type="text"
                  value={newSurveyName}
                  onChange={(event) => setNewSurveyName(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  autoFocus
                />
              </div>

              {createError !== null ? <p className="text-sm text-red-600">{createError}</p> : null}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setNewSurveyName('');
                    setCreateError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={creating}>
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
