import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { Copy, Edit2, Plus, Play, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { ModelSelector } from '../components/runs/ModelSelector';
import { CostBreakdown } from '../components/runs/CostBreakdown';
import { useAvailableModels } from '../hooks/useAvailableModels';
import { useCostEstimate } from '../hooks/useCostEstimate';
import { useRunMutations } from '../hooks/useRunMutations';
import {
  SURVEYS_QUERY,
  CREATE_SURVEY_MUTATION,
  UPDATE_SURVEY_MUTATION,
  DELETE_SURVEY_MUTATION,
  DUPLICATE_SURVEY_MUTATION,
  type Survey,
  type SurveysQueryResult,
  type SurveyPlan,
  type CreateSurveyInput,
  type UpdateSurveyInput,
  type CreateSurveyMutationResult,
  type UpdateSurveyMutationResult,
  type DeleteSurveyMutationResult,
  type DuplicateSurveyMutationResult,
} from '../api/operations/surveys';

type SurveyFormState = {
  name: string;
  description: string;
  instructions: string;
  questions: string[];
  responses: string[];
};

type RunState = {
  selectedModels: string[];
  repetitions: number;
};

function getSurveyPlan(survey: Survey): SurveyPlan | null {
  if (!survey.analysisPlan || survey.analysisPlan.kind !== 'survey') {
    return null;
  }
  return survey.analysisPlan;
}

function getResponseLabels(plan: SurveyPlan | null): string[] {
  if (!plan) {
    return [];
  }

  if (Array.isArray(plan.responseOptions) && plan.responseOptions.length > 0) {
    return [...plan.responseOptions]
      .sort((left, right) => left.order - right.order)
      .map((option) => option.label)
      .filter((label) => label.trim() !== '');
  }

  if (plan.responseScale && Number.isInteger(plan.responseScale.min) && Number.isInteger(plan.responseScale.max)) {
    const labels: string[] = [];
    for (let value = plan.responseScale.min; value <= plan.responseScale.max; value += 1) {
      if (value === plan.responseScale.min && plan.responseScale.minLabel?.trim()) {
        labels.push(plan.responseScale.minLabel.trim());
      } else if (value === plan.responseScale.max && plan.responseScale.maxLabel?.trim()) {
        labels.push(plan.responseScale.maxLabel.trim());
      } else {
        labels.push(String(value));
      }
    }
    return labels;
  }

  return [];
}

function getSurveyVersion(plan: SurveyPlan | null): number {
  if (!plan) {
    return 1;
  }
  return Number.isInteger(plan.version) && plan.version > 0 ? plan.version : 1;
}

function getSurveyFamilyKey(survey: Survey): string {
  const plan = getSurveyPlan(survey);
  if (plan?.surveyKey && plan.surveyKey.trim() !== '') {
    return plan.surveyKey;
  }
  return survey.id;
}

function surveyToFormState(survey?: Survey): SurveyFormState {
  const plan = survey ? getSurveyPlan(survey) : null;
  const responseLabels = getResponseLabels(plan);
  return {
    name: survey?.name ?? '',
    description: survey?.hypothesis ?? '',
    instructions: plan?.instructions ?? '',
    questions: plan?.questions?.map((question) => question.text) ?? [''],
    responses: responseLabels.length > 0 ? responseLabels : ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
  };
}

function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return 'Unknown error';
}

export function Survey() {
  const navigate = useNavigate();
  const [{ data, fetching, error }, reexecuteQuery] = useQuery<SurveysQueryResult>({ query: SURVEYS_QUERY });
  const [, createSurvey] = useMutation<CreateSurveyMutationResult, { input: CreateSurveyInput }>(CREATE_SURVEY_MUTATION);
  const [, updateSurvey] = useMutation<UpdateSurveyMutationResult, { id: string; input: UpdateSurveyInput }>(UPDATE_SURVEY_MUTATION);
  const [, deleteSurvey] = useMutation<DeleteSurveyMutationResult, { id: string }>(DELETE_SURVEY_MUTATION);
  const [, duplicateSurvey] = useMutation<DuplicateSurveyMutationResult, { id: string; name?: string }>(DUPLICATE_SURVEY_MUTATION);
  const { startRun, loading: runLoading } = useRunMutations();

  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [runningSurvey, setRunningSurvey] = useState<Survey | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<SurveyFormState>(surveyToFormState());
  const [runState, setRunState] = useState<RunState>({ selectedModels: [], repetitions: 1 });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const surveys = useMemo(() => data?.surveys ?? [], [data?.surveys]);
  const surveyGroups = useMemo(() => {
    const grouped = new Map<string, Survey[]>();
    for (const survey of surveys) {
      const key = getSurveyFamilyKey(survey);
      const current = grouped.get(key) ?? [];
      current.push(survey);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([key, versions]) => {
        const sortedVersions = [...versions].sort((left, right) => {
          const leftVersion = getSurveyVersion(getSurveyPlan(left));
          const rightVersion = getSurveyVersion(getSurveyPlan(right));
          if (leftVersion !== rightVersion) {
            return rightVersion - leftVersion;
          }
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        });
        return {
          key,
          name: sortedVersions[0]?.name ?? 'Unnamed Survey',
          versions: sortedVersions,
        };
      })
      .sort((left, right) => {
        const leftUpdated = new Date(left.versions[0]?.updatedAt ?? 0).getTime();
        const rightUpdated = new Date(right.versions[0]?.updatedAt ?? 0).getTime();
        return rightUpdated - leftUpdated;
      });
  }, [surveys]);

  const { models, loading: modelsLoading } = useAvailableModels({ onlyAvailable: false, requestPolicy: 'cache-and-network' });
  const availableModelIds = useMemo(
    () => models.filter((model) => model.isAvailable).map((model) => model.id),
    [models]
  );

  useEffect(() => {
    if (runningSurvey === null) {
      return;
    }
    setRunState((prev) => {
      if (prev.selectedModels.length > 0) {
        return prev;
      }
      const defaultIds = models
        .filter((model) => model.isAvailable && model.isDefault)
        .map((model) => model.id);
      return { ...prev, selectedModels: defaultIds };
    });
  }, [models, runningSurvey]);

  const runningPlan = runningSurvey ? getSurveyPlan(runningSurvey) : null;
  const definitionId = runningPlan?.definitionId ?? '';
  const repetitions = runState.repetitions;

  const { costEstimate, loading: costLoading, error: costError } = useCostEstimate({
    definitionId,
    models: availableModelIds,
    samplePercentage: 100,
    samplesPerScenario: repetitions,
    pause: !runningSurvey || definitionId === '' || availableModelIds.length === 0,
  });

  const selectedCostEstimate = useMemo(() => {
    if (!costEstimate) {
      return null;
    }
    const selectedPerModel = costEstimate.perModel.filter((model) => runState.selectedModels.includes(model.modelId));
    const isUsingFallback = selectedPerModel.some((model) => model.isUsingFallback);
    return {
      ...costEstimate,
      total: selectedPerModel.reduce((sum, model) => sum + model.totalCost, 0),
      perModel: selectedPerModel,
      isUsingFallback,
      fallbackReason: isUsingFallback ? (costEstimate.fallbackReason ?? null) : null,
    };
  }, [costEstimate, runState.selectedModels]);

  const resetForm = (survey?: Survey) => {
    setEditingSurvey(survey ?? null);
    setFormState(surveyToFormState(survey));
    setSubmitError(null);
  };

  const openCreateModal = () => {
    resetForm(undefined);
    setIsFormOpen(true);
  };

  const openEditModal = (survey: Survey) => {
    resetForm(survey);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    setIsFormOpen(false);
    setEditingSurvey(null);
    setFormState(surveyToFormState());
    setSubmitError(null);
  };

  const openRunModal = (survey: Survey) => {
    setRunningSurvey(survey);
    setRunState({ selectedModels: [], repetitions: 1 });
    setRunError(null);
  };

  const closeRunModal = () => {
    setRunningSurvey(null);
    setRunState({ selectedModels: [], repetitions: 1 });
    setRunError(null);
  };

  const handleQuestionChange = (index: number, value: string) => {
    setFormState((prev) => {
      const nextQuestions = [...prev.questions];
      nextQuestions[index] = value;
      return { ...prev, questions: nextQuestions };
    });
  };

  const addQuestion = () => {
    setFormState((prev) => ({ ...prev, questions: [...prev.questions, ''] }));
  };

  const removeQuestion = (index: number) => {
    setFormState((prev) => {
      if (prev.questions.length === 1) {
        return prev;
      }
      return {
        ...prev,
        questions: prev.questions.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleResponseChange = (index: number, value: string) => {
    setFormState((prev) => {
      const nextResponses = [...prev.responses];
      nextResponses[index] = value;
      return { ...prev, responses: nextResponses };
    });
  };

  const addResponse = () => {
    setFormState((prev) => ({ ...prev, responses: [...prev.responses, ''] }));
  };

  const removeResponse = (index: number) => {
    setFormState((prev) => {
      if (prev.responses.length <= 2) {
        return prev;
      }
      return {
        ...prev,
        responses: prev.responses.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  };

  const handleDelete = async (survey: Survey) => {
    if (!confirm(`Delete survey "${survey.name}"?`)) {
      return;
    }
    const result = await deleteSurvey({ id: survey.id });
    if (result.error) {
      alert(`Failed to delete survey: ${result.error.message}`);
      return;
    }
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = formState.name.trim();
    const trimmedQuestions = formState.questions.map((question) => question.trim()).filter((question) => question !== '');
    const trimmedResponses = formState.responses.map((response) => response.trim()).filter((response) => response !== '');

    if (!trimmedName) {
      setSubmitError('Survey name is required.');
      return;
    }
    if (trimmedQuestions.length === 0) {
      setSubmitError('Add at least one question.');
      return;
    }
    if (trimmedResponses.length < 2) {
      setSubmitError('Add at least two response options.');
      return;
    }

    setIsSaving(true);
    setSubmitError(null);
    const inputBase = {
      name: trimmedName,
      description: formState.description.trim() || undefined,
      instructions: formState.instructions.trim() || undefined,
      responseOptions: trimmedResponses.map((label) => ({ label })),
      questions: trimmedQuestions.map((text) => ({ text })),
    };

    try {
      if (editingSurvey) {
        const result = await updateSurvey({ id: editingSurvey.id, input: inputBase });
        if (result.error) {
          throw result.error;
        }
      } else {
        const result = await createSurvey({ input: inputBase });
        if (result.error) {
          throw result.error;
        }
      }
      closeFormModal();
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (mutationError) {
      setSubmitError(getErrorMessage(mutationError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async (survey: Survey) => {
    const suggestedName = `${survey.name} (Copy)`;
    const requestedName = prompt('Name for duplicated survey', suggestedName);
    if (requestedName === null) {
      return;
    }
    const trimmedName = requestedName.trim();
    if (!trimmedName) {
      alert('Duplicate name is required.');
      return;
    }

    const result = await duplicateSurvey({ id: survey.id, name: trimmedName });
    if (result.error) {
      alert(`Failed to duplicate survey: ${result.error.message}`);
      return;
    }
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleRun = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!runningSurvey) {
      return;
    }
    const plan = getSurveyPlan(runningSurvey);
    if (!plan) {
      setRunError('Survey configuration is invalid.');
      return;
    }
    if (runState.selectedModels.length === 0) {
      setRunError('Select at least one AI model.');
      return;
    }

    setRunError(null);
    try {
      await startRun({
        definitionId: plan.definitionId,
        models: runState.selectedModels,
        samplePercentage: 100,
        samplesPerScenario: runState.repetitions,
        experimentId: runningSurvey.id,
      });
      closeRunModal();
      navigate(`/survey-results?surveyId=${runningSurvey.id}`);
    } catch (startError) {
      setRunError(getErrorMessage(startError));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Survey</h1>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          New Survey
        </Button>
      </div>

      {fetching ? (
        <Loading size="lg" text="Loading surveys..." />
      ) : error ? (
        <ErrorMessage message={`Failed to load surveys: ${error.message}`} />
      ) : surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <h2 className="text-lg font-medium text-gray-900">No surveys yet</h2>
          <p className="mt-2 text-sm text-gray-600">Create your first attitudinal survey.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Survey</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Version</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Description</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Questions</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Responses</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Runs</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Updated</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {surveyGroups.flatMap((group) =>
                group.versions.map((survey) => {
                  const plan = getSurveyPlan(survey);
                  const questionCount = plan?.questions.length ?? 0;
                  const responseCount = getResponseLabels(plan).length;
                  const surveyVersion = getSurveyVersion(plan);
                  return (
                    <tr key={survey.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{group.name}</td>
                      <td className="px-4 py-3 text-gray-700">v{surveyVersion}</td>
                      <td className="max-w-sm truncate px-4 py-3 text-gray-600">{survey.hypothesis || 'No description'}</td>
                      <td className="px-4 py-3 text-gray-700">{questionCount}</td>
                      <td className="px-4 py-3 text-gray-700">{responseCount}</td>
                      <td className="px-4 py-3 text-gray-700">{survey.runCount}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(survey.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditModal(survey)} title="Edit survey">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDuplicate(survey)} title="Duplicate survey">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(survey)} title="Delete survey">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => openRunModal(survey)}>
                            <Play className="mr-1 h-4 w-4" />
                            Run
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/survey-results?surveyId=${survey.id}`)}>
                            Results
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-medium text-gray-900">{editingSurvey ? 'Edit Survey' : 'Create Survey'}</h2>
            <form className="mt-4 space-y-4" onSubmit={handleSave}>
              {editingSurvey && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                  Saving changes creates survey version v{getSurveyVersion(getSurveyPlan(editingSurvey)) + 1}.
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  rows={2}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Instructions for Target AI</label>
                <textarea
                  value={formState.instructions}
                  onChange={(event) => setFormState((prev) => ({ ...prev, instructions: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  rows={3}
                  placeholder="Example: Answer from your own values. Pick the single best response option and explain briefly."
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Response Options</label>
                  <Button type="button" variant="ghost" size="sm" onClick={addResponse}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Response
                  </Button>
                </div>
                <div className="space-y-2">
                  {formState.responses.map((response, index) => (
                    <div key={`response-${index + 1}`} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={response}
                        onChange={(event) => handleResponseChange(index, event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder={`Response option ${index + 1}`}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeResponse(index)}
                        disabled={formState.responses.length <= 2}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-1">
                <div>
                  <p className="text-xs text-gray-500">
                    Response options are numbered automatically in order (1, 2, 3...). The AI will return the selected option number.
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Questions</label>
                  <Button type="button" variant="ghost" size="sm" onClick={addQuestion}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Question
                  </Button>
                </div>
                <div className="space-y-2">
                  {formState.questions.map((question, index) => (
                    <div key={`question-${index + 1}`} className="flex items-start gap-2">
                      <textarea
                        value={question}
                        onChange={(event) => handleQuestionChange(index, event.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder={`Question ${index + 1}`}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(index)}
                        disabled={formState.questions.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Button type="button" variant="secondary" size="sm" onClick={addQuestion}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Question
                  </Button>
                </div>
              </div>

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={closeFormModal}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSaving}>
                  {editingSurvey ? 'Save Changes' : 'Create Survey'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {runningSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-medium text-gray-900">Run Survey: {runningSurvey.name}</h2>
            <form className="mt-4 space-y-4" onSubmit={handleRun}>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Target AIs</label>
                <ModelSelector
                  models={models}
                  selectedModels={runState.selectedModels}
                  onSelectionChange={(selectedModels) => setRunState((prev) => ({ ...prev, selectedModels }))}
                  loading={modelsLoading}
                  disabled={runLoading}
                  costEstimate={selectedCostEstimate}
                  allModelsCostEstimate={costEstimate}
                  costLoading={costLoading}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">How many runs (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={runState.repetitions}
                  onChange={(event) =>
                    setRunState((prev) => ({
                      ...prev,
                      repetitions: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                    }))
                  }
                  className="w-40 rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>

              <CostBreakdown costEstimate={selectedCostEstimate} loading={costLoading} error={costError} compact />

              {runError && <p className="text-sm text-red-600">{runError}</p>}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={closeRunModal}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={runLoading}>
                  Start Survey Run
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
