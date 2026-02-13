import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart2, Download, RefreshCw } from 'lucide-react';
import { useQuery } from 'urql';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Badge } from '../components/ui/Badge';
import {
  AnalysisListFilters,
  VirtualizedAnalysisList,
  VirtualizedAnalysisFolderView,
  type AnalysisFilterState,
} from '../components/analysis';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import { useInfiniteRuns } from '../hooks/useInfiniteRuns';
import { useRun } from '../hooks/useRun';
import { useRunMutations } from '../hooks/useRunMutations';
import { SCENARIOS_QUERY, type ScenariosQueryResult } from '../api/operations/scenarios';
import type { Transcript } from '../api/operations/runs';
import { SURVEYS_QUERY, type SurveysQueryResult } from '../api/operations/surveys';

const defaultFilters: AnalysisFilterState = {
  analysisStatus: '',
  tagIds: [],
  viewMode: 'folder',
};

function getSurveyVersion(analysisPlan: unknown): number {
  if (!analysisPlan || typeof analysisPlan !== 'object') {
    return 1;
  }
  const maybeVersion = (analysisPlan as { version?: unknown }).version;
  return typeof maybeVersion === 'number' && Number.isInteger(maybeVersion) && maybeVersion > 0 ? maybeVersion : 1;
}

function escapeCsvCell(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function extractTranscriptText(content: unknown): string {
  if (!content || typeof content !== 'object') {
    return '';
  }
  const turns = (content as { turns?: unknown }).turns;
  if (!Array.isArray(turns)) {
    return '';
  }

  const responses: string[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') {
      continue;
    }
    const targetResponse = (turn as { targetResponse?: unknown }).targetResponse;
    if (typeof targetResponse === 'string' && targetResponse.trim() !== '') {
      responses.push(targetResponse.trim());
    }
  }
  return responses.join('\n\n');
}

function getDecisionCodeOptions(analysisPlan: unknown): string[] {
  if (!analysisPlan || typeof analysisPlan !== 'object') {
    return ['1', '2', '3', '4', '5'];
  }

  const plan = analysisPlan as {
    responseOptions?: Array<{ value?: unknown; order?: unknown }>;
    responseScale?: { min?: unknown; max?: unknown };
  };

  if (Array.isArray(plan.responseOptions) && plan.responseOptions.length > 0) {
    const values = plan.responseOptions
      .map((option, index) => {
        if (typeof option.value === 'number' && Number.isInteger(option.value) && option.value > 0) {
          return option.value;
        }
        if (typeof option.order === 'number' && Number.isInteger(option.order) && option.order > 0) {
          return option.order;
        }
        return index + 1;
      })
      .filter((value, index, arr) => value > 0 && arr.indexOf(value) === index)
      .sort((left, right) => left - right);
    if (values.length > 0) {
      return values.map(String);
    }
  }

  const min = plan.responseScale?.min;
  const max = plan.responseScale?.max;
  if (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min > 0 &&
    max >= min
  ) {
    const values: string[] = [];
    for (let i = min; i <= max; i += 1) {
      values.push(String(i));
    }
    return values;
  }

  return ['1', '2', '3', '4', '5'];
}

export function SurveyResults() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<AnalysisFilterState>(defaultFilters);
  const selectedSurveyIdFromUrl = searchParams.get('surveyId') ?? '';
  const { updateTranscriptDecision } = useRunMutations();
  const [{ data: surveysData, fetching: surveysLoading }] = useQuery<SurveysQueryResult>({
    query: SURVEYS_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const runnableSurveys = useMemo(
    () =>
      (surveysData?.surveys ?? [])
        .filter((survey) => survey.analysisPlan?.kind === 'survey' && survey.runCount > 0)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [surveysData?.surveys]
  );
  const fallbackSurveyId = runnableSurveys[0]?.id ?? '';
  const selectedSurveyId = selectedSurveyIdFromUrl || fallbackSurveyId;
  const selectedSurvey = runnableSurveys.find((survey) => survey.id === selectedSurveyId) ?? null;
  const decisionCodeOptions = useMemo(
    () => getDecisionCodeOptions(selectedSurvey?.analysisPlan),
    [selectedSurvey?.analysisPlan]
  );

  useEffect(() => {
    if (fallbackSurveyId && (!selectedSurveyIdFromUrl || !runnableSurveys.some((survey) => survey.id === selectedSurveyIdFromUrl))) {
      setSearchParams({ surveyId: fallbackSurveyId }, { replace: true });
    }
  }, [selectedSurveyIdFromUrl, fallbackSurveyId, runnableSurveys, setSearchParams]);

  const {
    runs,
    loading,
    loadingMore,
    error,
    hasNextPage,
    totalCount,
    loadMore,
    refetch,
    softRefetch,
  } = useInfiniteRuns({
    experimentId: selectedSurveyId || undefined,
    runType: 'survey',
    pause: !selectedSurveyId,
  });

  useEffect(() => {
    if (!selectedSurveyId) {
      return;
    }
    const intervalId = window.setInterval(() => {
      if (loading || loadingMore) {
        return;
      }
      softRefetch();
    }, 3000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedSurveyId, softRefetch, loading, loadingMore]);

  const surveyRuns = useMemo(() => {
    const allSurveyRuns = runs.filter((run) => (run.definition?.name ?? '').startsWith('[Survey]'));
    return selectedSurveyId
      ? allSurveyRuns.filter((run) => run.experimentId === selectedSurveyId)
      : allSurveyRuns;
  }, [runs, selectedSurveyId]);

  const latestRunId = surveyRuns[0]?.id ?? '';
  const latestDefinitionId = surveyRuns[0]?.definitionId ?? '';
  const { run: latestRun, refetch: refetchLatestRun } = useRun({
    id: latestRunId,
    pause: latestRunId === '',
    enablePolling: true,
  });

  const [{ data: scenariosData }] = useQuery<ScenariosQueryResult>({
    query: SCENARIOS_QUERY,
    variables: {
      definitionId: latestDefinitionId,
      limit: 500,
      offset: 0,
    },
    pause: latestDefinitionId === '',
    requestPolicy: 'cache-and-network',
  });

  const filteredRuns = useMemo(() => {
    const result = surveyRuns;
    if (filters.tagIds.length === 0) {
      return result;
    }
    return result.filter((run) => {
      const tags = run.definition?.tags ?? [];
      return tags.some((tag) => filters.tagIds.includes(tag.id));
    });
  }, [surveyRuns, filters.tagIds]);

  const matrixData = useMemo(() => {
    if (!latestRun || !scenariosData?.scenarios) {
      return null;
    }

    const models = [...new Set(latestRun.config.models)];

    const responses = new Map<string, string>();
    const numericBuckets = new Map<string, number[]>();
    for (const transcript of latestRun.transcripts) {
      if (!transcript.scenarioId || !models.includes(transcript.modelId) || !transcript.decisionCode) {
        continue;
      }
      const key = `${transcript.scenarioId}::${transcript.modelId}`;
      const decisionRaw = transcript.decisionCode.trim();
      const decisionNum = Number(decisionRaw);
      if (!Number.isNaN(decisionNum) && Number.isFinite(decisionNum)) {
        const bucket = numericBuckets.get(key) ?? [];
        bucket.push(decisionNum);
        numericBuckets.set(key, bucket);
      } else if (!responses.has(key)) {
        responses.set(key, decisionRaw);
      }
    }

    for (const [key, values] of numericBuckets) {
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      const formatted = Number.isInteger(avg) ? String(avg) : avg.toFixed(2);
      responses.set(key, formatted);
    }

    const rows = (scenariosData.scenarios ?? [])
      .map((scenario) => {
        const content = scenario.content as Record<string, unknown>;
        const prompt = String(content?.prompt ?? '');
        const chunkMatch = prompt.match(/Answer this question now \(Question \d+\):\s*(.+)/);
        const legacyMatch = prompt.match(/^Question:\s*(.+)$/m);
        const questionNumberRaw = content?.dimensions as Record<string, unknown> | undefined;
        const explicitQuestionText = typeof questionNumberRaw?.questionText === 'string' ? questionNumberRaw.questionText : '';
        const questionText = (explicitQuestionText || chunkMatch?.[1] || legacyMatch?.[1] || scenario.name).trim();
        const questionNumber = Number(questionNumberRaw?.questionNumber ?? Number.NaN);
        const order = Number.isFinite(questionNumber) ? questionNumber : Number.MAX_SAFE_INTEGER;
        return {
          scenarioId: scenario.id,
          order,
          questionText,
        };
      })
      .sort((left, right) => left.order - right.order || left.questionText.localeCompare(right.questionText));

    const transcriptsByCell = new Map<string, Transcript[]>();
    for (const transcript of latestRun.transcripts) {
      if (!transcript.scenarioId || !models.includes(transcript.modelId)) {
        continue;
      }
      const key = `${transcript.scenarioId}::${transcript.modelId}`;
      const existing = transcriptsByCell.get(key) ?? [];
      existing.push(transcript);
      transcriptsByCell.set(key, existing);
    }
    for (const [key, items] of transcriptsByCell) {
      items.sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        return rightTime - leftTime;
      });
      transcriptsByCell.set(key, items);
    }

    return { models, responses, rows, transcriptsByCell };
  }, [latestRun, scenariosData]);

  const handleAnalysisClick = (runId: string) => {
    navigate(`/analysis/${runId}`);
  };

  const handleDecisionOverride = async (transcriptId: string, decisionCode: string) => {
    await updateTranscriptDecision(transcriptId, decisionCode);
    refetchLatestRun();
    softRefetch();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Survey Results</h1>
          {latestRun?.status === 'SUMMARIZING' && (
            <Badge variant="warning" size="count">
              Summarizing
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refetch} disabled={loading || loadingMore}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading || loadingMore ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-6">
        {surveysLoading ? (
          <Loading size="md" text="Loading surveys..." />
        ) : runnableSurveys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            No surveys with runs yet.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Survey</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Version</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Runs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runnableSurveys.map((survey) => {
                    const isActive = survey.id === selectedSurveyId;
                    return (
                      <tr
                        key={survey.id}
                        onClick={() => setSearchParams({ surveyId: survey.id })}
                        className={`cursor-pointer ${
                          isActive ? 'bg-teal-50 text-teal-900' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-2 font-medium">{survey.name}</td>
                        <td className="px-4 py-2">v{getSurveyVersion(survey.analysisPlan)}</td>
                        <td className="px-4 py-2">{survey.runCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <AnalysisListFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      <div className="flex-1 min-h-0">
        {!selectedSurveyId ? (
          <div className="text-center py-12 text-gray-600">No surveys found yet.</div>
        ) : loading ? (
          <Loading size="lg" text="Loading survey runs..." />
        ) : error ? (
          <ErrorMessage message={`Failed to load survey results: ${error.message}`} />
        ) : filteredRuns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6 h-full">
            <SurveyMatrix
              matrixData={matrixData}
              runName={latestRun?.name ?? null}
              runStatus={latestRun?.status}
              summarizeProgress={latestRun?.summarizeProgress ?? null}
              decisionCodeOptions={decisionCodeOptions}
              onDecisionOverride={handleDecisionOverride}
              exportLabel={
                selectedSurvey
                  ? `${selectedSurvey.name}-v${getSurveyVersion(selectedSurvey.analysisPlan)}`
                  : 'survey-results'
              }
            />
            <div className="flex-1 min-h-0">
              {filters.viewMode === 'folder' ? (
                <VirtualizedAnalysisFolderView
                  runs={filteredRuns}
                  onRunClick={handleAnalysisClick}
                  hasNextPage={hasNextPage}
                  loadingMore={loadingMore}
                  totalCount={totalCount}
                  onLoadMore={loadMore}
                />
              ) : (
                <VirtualizedAnalysisList
                  runs={filteredRuns}
                  onRunClick={handleAnalysisClick}
                  hasNextPage={hasNextPage}
                  loadingMore={loadingMore}
                  totalCount={totalCount}
                  onLoadMore={loadMore}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SurveyMatrix({
  matrixData,
  runName,
  runStatus,
  summarizeProgress,
  decisionCodeOptions,
  onDecisionOverride,
  exportLabel,
}: {
  matrixData: {
    models: string[];
    responses: Map<string, string>;
    rows: Array<{ scenarioId: string; order: number; questionText: string }>;
    transcriptsByCell: Map<string, Transcript[]>;
  } | null;
  runName: string | null;
  runStatus?: string;
  summarizeProgress?: { completed: number; total: number } | null;
  decisionCodeOptions: string[];
  onDecisionOverride: (transcriptId: string, decisionCode: string) => Promise<void>;
  exportLabel: string;
}) {
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const isSummarizing = runStatus === 'SUMMARIZING';

  if (isSummarizing) {
    const progressText = summarizeProgress ? ` (${summarizeProgress.completed}/${summarizeProgress.total})` : '';
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-lg font-medium text-amber-900">Question x AI Matrix</h2>
        <p className="mt-1 text-sm text-amber-800">
          This run is summarizing{progressText}. Data is not available yet.
        </p>
      </div>
    );
  }

  if (!matrixData || matrixData.rows.length === 0 || matrixData.models.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-medium text-gray-900">Question x AI Matrix</h2>
        <p className="mt-1 text-sm text-gray-500">Matrix will appear once transcripts are available.</p>
      </div>
    );
  }

  const handleExportCsv = () => {
    const header = ['Question'];
    for (const modelId of matrixData.models) {
      header.push(`${modelId} decision code`);
      header.push(`${modelId} transcript`);
    }
    const lines = [header.map(escapeCsvCell).join(',')];

    for (const row of matrixData.rows) {
      const values = [row.questionText];
      for (const modelId of matrixData.models) {
        const key = `${row.scenarioId}::${modelId}`;
        const decision = matrixData.responses.get(key) ?? '';
        const transcripts = matrixData.transcriptsByCell.get(key) ?? [];
        const transcriptText = transcripts
          .map((transcript) => extractTranscriptText(transcript.content))
          .filter((text) => text.trim() !== '')
          .join('\n\n-----\n\n');
        values.push(decision);
        values.push(transcriptText);
      }
      lines.push(values.map((value) => escapeCsvCell(String(value))).join(','));
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = exportLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    link.href = url;
    link.download = `${safeName || 'survey-results'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Question x AI Matrix</h2>
          <p className="mt-1 text-sm text-gray-500">
            Showing latest run {runName ? `"${runName}"` : ''}. `*` indicates an LLM-classified decision code.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleExportCsv}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-700">Question</th>
              {matrixData.models.map((modelId) => (
                <th key={modelId} className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-700">
                  {modelId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixData.rows.map((row) => (
              <tr key={row.scenarioId}>
                <td className="border border-gray-200 px-3 py-2 text-gray-900">{row.questionText}</td>
                {matrixData.models.map((modelId) => {
                  const key = `${row.scenarioId}::${modelId}`;
                  const value = matrixData.responses.get(key) ?? '—';
                  const transcripts = matrixData.transcriptsByCell.get(key) ?? [];
                  const transcriptCount = transcripts.length;
                  const isOther = value.trim().toLowerCase() === 'other';
                  const targetTranscript = transcripts[0] ?? null;
                  const valueDisplay = targetTranscript?.decisionCodeSource === 'llm' ? `${value}*` : value;
                  return (
                    <td key={`${row.scenarioId}-${modelId}`} className="border border-gray-200 px-3 py-2 text-gray-700">
                      {transcriptCount > 0 && isOther && targetTranscript ? (
                        <div className="flex flex-col gap-1">
                          <select
                            value={targetTranscript.decisionCode?.trim() || 'other'}
                            onChange={async (event) => {
                              const nextDecision = event.target.value;
                              if (!nextDecision || nextDecision === 'other') {
                                return;
                              }
                              try {
                                setEditingCellKey(key);
                                await onDecisionOverride(targetTranscript.id, nextDecision);
                              } catch (error) {
                                // eslint-disable-next-line no-alert
                                alert(error instanceof Error ? error.message : 'Failed to update decision code');
                              } finally {
                                setEditingCellKey(null);
                              }
                            }}
                            disabled={editingCellKey === key}
                            className="h-8 rounded border border-gray-300 bg-white px-2 text-sm"
                            aria-label={`Set decision code for ${row.questionText} / ${modelId}`}
                          >
                            <option value="other">other</option>
                            {decisionCodeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto w-fit justify-start p-0 text-left text-xs text-teal-700 hover:text-teal-800 hover:underline"
                            onClick={() => setSelectedTranscript(targetTranscript)}
                          >
                            View transcript
                          </Button>
                        </div>
                      ) : transcriptCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-left text-teal-700 hover:text-teal-800 hover:underline"
                          onClick={() => setSelectedTranscript(transcripts[0] ?? null)}
                          title={targetTranscript?.decisionCodeSource === 'llm' ? 'View transcript (LLM-classified decision)' : 'View transcript'}
                        >
                          {valueDisplay}
                          {transcriptCount > 1 ? ` (n=${transcriptCount})` : ''}
                        </Button>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedTranscript && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <BarChart2 className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No survey analysis yet</h3>
      <p className="text-gray-500">Run this survey to populate results.</p>
    </div>
  );
}
