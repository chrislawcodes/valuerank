import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { useAnalysis } from '../hooks/useAnalysis';
import { useRun } from '../hooks/useRun';
import { useRuns } from '../hooks/useRuns';
import type { AnalysisResult } from '../api/operations/analysis';
import type { Run, Transcript } from '../api/operations/runs';
import {
  ANALYSIS_BASE_PATH,
  buildAnalysisConditionDetailPath,
  buildAnalysisDetailPath,
  buildAnalysisTranscriptsPath,
  parseConditionKey,
} from '../utils/analysisRouting';
import { formatDisplayLabel } from '../utils/displayLabels';
import { requireRenderableTranscriptDecisionModelV2 } from '../utils/transcriptDecisionModel';
import { filterTranscriptsForPivotCell } from '../utils/scenarioUtils';
import {
  summarizeConditionDecisionBuckets,
} from '../utils/conditionDecisionSummary';

type AnalysisDetailMode = 'single' | 'paired';
type PairedConditionSource = 'current' | 'companion' | 'pooled';

type DetailRow = {
  id: string;
  label: string;
  summary: ReturnType<typeof summarizeConditionDecisionBuckets>;
  baseSearchParams: URLSearchParams;
};

const CONDITION_COPY = {
  countSummary: 'Canonical transcript counts by decision label. Click any non-zero count to open the matching transcripts.',
  unresolvedSummary: 'Unknown transcripts are shown in the final column. Known counts use only transcripts with canonical decision data.',
} as const;

function parseAnalysisDetailMode(value: string | null): AnalysisDetailMode {
  return value === 'paired' ? 'paired' : 'single';
}

function filterConditionTranscripts(
  run: Run | null | undefined,
  analysis: AnalysisResult | null | undefined,
  rowDim: string,
  colDim: string,
  row: string,
  col: string,
  modelId: string,
): Transcript[] {
  return filterTranscriptsForPivotCell({
    transcripts: run?.transcripts ?? [],
    scenarioDimensions: analysis?.visualizationData?.scenarioDimensions,
    rowDim,
    colDim,
    row,
    col,
    selectedModel: modelId,
  });
}

function buildBreadcrumbSearch(mode: AnalysisDetailMode): string {
  const params = new URLSearchParams();
  params.set('tab', 'scenarios');
  params.set('mode', mode);
  return params.toString();
}

function buildDetailRow(
  id: string,
  label: string,
  transcripts: Transcript[],
  baseSearchParams: URLSearchParams,
): DetailRow {
  const renderableTranscripts = transcripts.map((transcript) => (
    requireRenderableTranscriptDecisionModelV2(transcript, 'AnalysisConditionDetail page')
  ));

  return {
    id,
    label,
    summary: summarizeConditionDecisionBuckets(renderableTranscripts),
    baseSearchParams,
  };
}

export function AnalysisConditionDetail() {
  const navigate = useNavigate();
  const { id, conditionKey } = useParams<{ id: string; conditionKey: string }>();
  const [searchParams] = useSearchParams();
  const analysisMode = parseAnalysisDetailMode(searchParams.get('mode'));
  const selectedModel = searchParams.get('modelId') ?? searchParams.get('model') ?? '';
  const rowDim = searchParams.get('rowDim') ?? '';
  const colDim = searchParams.get('colDim') ?? '';
  const companionRunIdHint = searchParams.get('companionRunId') ?? null;
  const parsedCondition = parseConditionKey(conditionKey ?? '');

  const { run, loading, error } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: true,
  });

  const { analysis } = useAnalysis({
    runId: id || '',
    pause: !id || !run?.analysisStatus,
    enablePolling: false,
    analysisStatus: run?.analysisStatus ?? null,
  });

  // Companion resolution prefers the server-resolved paired sibling
  // (Definition.pairedSibling) over the legacy run-proximity heuristic. Order:
  //   1. ?companionRunId= URL hint (caller already picked a run)
  //   2. run.companionRunId (run config has a direct link)
  //   3. The most-recent COMPLETED run of run.definition.pairedSibling,
  //      preferring the same aggregate kind when possible
  const directCompanionRunId = run?.companionRunId ?? null;
  const pairedSiblingDefinitionId = run?.definition?.pairedSibling?.id ?? null;
  const hasExplicitCompanionId = companionRunIdHint != null || directCompanionRunId != null;

  // When neither URL nor run-config gave us a companion run, look up runs of
  // the paired sibling vignette and pick a representative one.
  const { runs: siblingRuns } = useRuns({
    definitionId: pairedSiblingDefinitionId ?? undefined,
    limit: 100,
    pause: analysisMode !== 'paired' || hasExplicitCompanionId || pairedSiblingDefinitionId == null,
  });

  const siblingFallbackRunId = useMemo(() => {
    if (siblingRuns == null || siblingRuns.length === 0) return null;
    const currentIsAggregate = run?.isAggregate === true
      || run?.tags?.some((tag) => tag.name === 'Aggregate') === true;
    const isAggregateKind = (candidate: Run) => (
      candidate.isAggregate === true
      || candidate.tags?.some((tag) => tag.name === 'Aggregate') === true
    );
    const completedSiblingRuns = siblingRuns.filter(
      (candidate) => candidate.status === 'COMPLETED' && candidate.id !== run?.id,
    );
    const sameKindRuns = completedSiblingRuns.filter(
      (candidate) => isAggregateKind(candidate) === currentIsAggregate,
    );
    const pool = sameKindRuns.length > 0
      ? sameKindRuns
      : completedSiblingRuns;
    const sorted = [...pool].sort((left, right) => {
      const leftMatchesCurrentKind = isAggregateKind(left) === currentIsAggregate;
      const rightMatchesCurrentKind = isAggregateKind(right) === currentIsAggregate;

      return Number(rightMatchesCurrentKind) - Number(leftMatchesCurrentKind)
        || new Date(right.completedAt ?? right.createdAt).getTime()
        - new Date(left.completedAt ?? left.createdAt).getTime();
    });
    return sorted[0]?.id ?? null;
  }, [run?.id, run?.isAggregate, run?.tags, siblingRuns]);

  const resolvedCompanionRunId = companionRunIdHint ?? directCompanionRunId ?? siblingFallbackRunId ?? null;

  const { run: companionRun } = useRun({
    id: resolvedCompanionRunId ?? '',
    pause: analysisMode !== 'paired' || resolvedCompanionRunId == null,
    enablePolling: true,
  });

  const { analysis: companionAnalysis } = useAnalysis({
    runId: resolvedCompanionRunId ?? '',
    pause: analysisMode !== 'paired' || resolvedCompanionRunId == null,
    enablePolling: false,
    analysisStatus: companionRun?.analysisStatus ?? null,
  });

  const breadcrumbSearch = useMemo(
    () => buildBreadcrumbSearch(analysisMode),
    [analysisMode],
  );

  const analysisPath = useMemo(() => (
    id ? buildAnalysisDetailPath(ANALYSIS_BASE_PATH, id) : ANALYSIS_BASE_PATH
  ), [id]);
  const analysisHomePath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('mode', analysisMode);
    const serialized = params.toString();
    return serialized.length > 0 ? `${analysisPath}?${serialized}` : analysisPath;
  }, [analysisMode, analysisPath]);

  const conditionPath = useMemo(() => {
    if (!id || !conditionKey) {
      return analysisPath;
    }

    const detailSearch = new URLSearchParams();
    if (rowDim) detailSearch.set('rowDim', rowDim);
    if (colDim) detailSearch.set('colDim', colDim);
    if (selectedModel) detailSearch.set('modelId', selectedModel);
    if (resolvedCompanionRunId) detailSearch.set('companionRunId', resolvedCompanionRunId);

    return buildAnalysisConditionDetailPath(
      ANALYSIS_BASE_PATH,
      id,
      conditionKey,
      detailSearch,
      new URLSearchParams(`mode=${analysisMode}`),
    );
  }, [analysisMode, analysisPath, colDim, conditionKey, id, resolvedCompanionRunId, rowDim, selectedModel]);
  const companionRunId = companionRun?.id;

  const detailRows = useMemo(() => {
    if (!parsedCondition || !rowDim || !colDim || !selectedModel || !run || !analysis) {
      return [] as DetailRow[];
    }

    const row = parsedCondition.row;
    const col = parsedCondition.col;
    const rows: DetailRow[] = [];
    const makeBaseSearch = (
      extras?: {
        companionRunId?: string;
        pairView?: 'condition-blended' | 'condition-split';
        sourceRun?: PairedConditionSource;
      },
    ) => {
      const params = new URLSearchParams({
        rowDim,
        colDim,
        row,
        col,
        modelId: selectedModel,
      });
      params.set('mode', analysisMode);
      if (extras?.companionRunId) params.set('companionRunId', extras.companionRunId);
      if (extras?.pairView) params.set('pairView', extras.pairView);
      if (extras?.sourceRun) params.set('sourceRun', extras.sourceRun);
      return params;
    };

    if (analysisMode === 'paired' && companionRun && companionAnalysis) {
      const currentTranscripts = filterConditionTranscripts(run, analysis, rowDim, colDim, row, col, selectedModel);
      const companionTranscripts = filterConditionTranscripts(companionRun, companionAnalysis, rowDim, colDim, row, col, selectedModel);
      const pooledTranscripts = [
        ...currentTranscripts,
        ...companionTranscripts,
      ];

      rows.push(buildDetailRow(
        'pooled',
        'Both directions combined',
        pooledTranscripts,
        makeBaseSearch({
          companionRunId,
          pairView: 'condition-blended',
          sourceRun: 'pooled',
        }),
      ));

      rows.push(buildDetailRow(
        'current',
        run?.definition?.name ?? 'Current vignette',
        currentTranscripts,
        makeBaseSearch({
          companionRunId,
          pairView: 'condition-split',
          sourceRun: 'current',
        }),
      ));

      rows.push(buildDetailRow(
        'companion',
        companionRun?.definition?.name ?? 'Companion vignette',
        companionTranscripts,
        makeBaseSearch({
          companionRunId,
          pairView: 'condition-split',
          sourceRun: 'companion',
        }),
      ));

      return rows;
    }

    rows.push(buildDetailRow(
      'single',
      run?.definition?.name ?? 'Current vignette',
      filterConditionTranscripts(run, analysis, rowDim, colDim, parsedCondition.row, parsedCondition.col, selectedModel),
      makeBaseSearch({
        sourceRun: 'current',
      }),
    ));

    return rows;
  }, [
    analysis,
    analysisMode,
    colDim,
    companionAnalysis,
    companionRun,
    companionRunId,
    parsedCondition,
    rowDim,
    run,
    selectedModel,
  ]);

  const decisionSummaryBuckets = useMemo(() => {
    const preferredRowIds = analysisMode === 'paired'
      ? ['current', 'single', 'companion', 'pooled']
      : ['single', 'current', 'companion', 'pooled'];

    for (const rowId of preferredRowIds) {
      const row = detailRows.find((candidate) => candidate.id === rowId);
      if (row?.summary.labelPair) {
        return row.summary.buckets;
      }
    }

    return detailRows[0]?.summary.buckets ?? [];
  }, [analysisMode, detailRows]);

  const hasUnresolvedTranscripts = detailRows.some((row) => row.summary.unknownCount > 0);

  if (loading && !run) {
    return <Loading size="lg" text="Loading condition detail..." />;
  }

  if (error) {
    return <ErrorMessage message={`Failed to load condition detail: ${error.message}`} />;
  }

  if (!run) {
    return <ErrorMessage message="Trial not found" />;
  }

  if (!analysis) {
    return <ErrorMessage message="Analysis not available for this trial." />;
  }

  if (!parsedCondition || !rowDim || !colDim || !selectedModel) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to={analysisHomePath} className="text-teal-700 hover:text-teal-800">
            Analysis
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>Conditions</span>
        </div>
        <ErrorMessage message="Missing condition detail parameters." />
      </div>
    );
  }

  const handleBucketClick = (row: DetailRow, bucketIndex: number) => {
    const bucket = row.summary.buckets[bucketIndex];
    if (!bucket || bucket.count === 0 || !bucket.filterParams) {
      return;
    }

    const params = new URLSearchParams(row.baseSearchParams);
    params.set('decisionStrength', bucket.filterParams.decisionStrength);
    if (bucket.filterParams.favoredValueKey) {
      params.set('favoredValueKey', bucket.filterParams.favoredValueKey);
    }

    navigate(buildAnalysisTranscriptsPath(ANALYSIS_BASE_PATH, run.id, params));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <Link to={analysisHomePath} className="text-teal-700 hover:text-teal-800">
            Analysis
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link to={`${analysisPath}?${breadcrumbSearch}`} className="text-teal-700 hover:text-teal-800">
            Conditions
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-700">{`${formatDisplayLabel(rowDim)} = ${formatDisplayLabel(parsedCondition.row)}, ${formatDisplayLabel(colDim)} = ${formatDisplayLabel(parsedCondition.col)}`}</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-medium text-gray-900">Condition Detail</h1>
          <p className="text-sm text-gray-600">
            Condition: <span className="font-medium text-gray-900">{formatDisplayLabel(rowDim)}</span> ={' '}
            <span className="font-medium text-gray-900">{formatDisplayLabel(parsedCondition.row)}</span>,{' '}
            <span className="font-medium text-gray-900">{formatDisplayLabel(colDim)}</span> ={' '}
            <span className="font-medium text-gray-900">{formatDisplayLabel(parsedCondition.col)}</span>
          </p>
          <p className="text-sm text-gray-600">
            Model: <span className="font-medium text-gray-900">{selectedModel}</span>
          </p>
          <p className="text-sm text-gray-500">
            {CONDITION_COPY.countSummary}
          </p>
        </div>
      </div>

      {analysisMode === 'paired' && (!companionRun || !companionAnalysis) && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Paired companion data is not available yet, so this detail view is showing the current vignette only.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Vignette Scope
              </th>
              {decisionSummaryBuckets.map((bucket, index) => (
                <th
                  key={`${index}-${bucket.label}`}
                  className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  <div className="mx-auto flex max-w-[8rem] flex-col items-center gap-1 whitespace-normal leading-tight">
                    <span>{bucket.label}</span>
                  </div>
                </th>
              ))}
              <th className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">
                n
              </th>
              <th className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">
                Unknown Count
              </th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {row.label}
                </td>
                {row.summary.buckets.map((bucket, index) => {
                  const count = bucket.count;
                  return (
                    <td key={`${row.id}-${index}`} className="px-3 py-3 text-center text-sm text-gray-700">
                      {count > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBucketClick(row, index)}
                          className="h-auto min-h-0 px-1 py-0 font-medium text-teal-700 hover:bg-transparent hover:text-teal-800"
                        >
                          {count}
                        </Button>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center text-sm text-gray-700">
                  {row.summary.knownCount}
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-700">
                  {row.summary.unknownCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasUnresolvedTranscripts && (
        <p className="text-xs text-gray-500">
          {CONDITION_COPY.unresolvedSummary}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Link to={`${analysisPath}?${breadcrumbSearch}`}>
          <Button type="button" variant="secondary" size="sm">
            Back To Conditions
          </Button>
        </Link>
        <Link to={conditionPath} className="text-xs text-gray-500 hover:text-gray-700">
          Share this detail view
        </Link>
      </div>
    </div>
  );
}
