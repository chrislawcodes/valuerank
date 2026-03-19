import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { findCompanionPairedRun } from '../components/analysis/PairedRunComparisonCard';
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
import { deriveDecisionDimensionLabels } from '../utils/decisionLabels';
import { getPairedOrientationLabels } from '../utils/methodology';
import { filterTranscriptsForPivotCell } from '../utils/scenarioUtils';

type AnalysisDetailMode = 'single' | 'paired';
type JobChoicePresentationOrder = 'A_first' | 'B_first';
type DecisionCode = '1' | '2' | '3' | '4' | '5';
type OrientationBucket = 'canonical' | 'flipped';

type DecisionSummary = {
  counts: Record<DecisionCode, number>;
  resolvedCount: number;
  unresolvedCount: number;
  mean: number | null;
};

type DetailRow = {
  id: string;
  label: string;
  summary: DecisionSummary;
  baseSearchParams: URLSearchParams;
};

const DECISION_CODES: DecisionCode[] = ['1', '2', '3', '4', '5'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseAnalysisDetailMode(value: string | null): AnalysisDetailMode {
  return value === 'paired' ? 'paired' : 'single';
}

function getRunPresentationOrder(run: Run | null | undefined): JobChoicePresentationOrder | null {
  const fromConfig = run?.config?.jobChoicePresentationOrder;
  if (fromConfig === 'A_first' || fromConfig === 'B_first') {
    return fromConfig;
  }

  const content = run?.definition?.content;
  if (!isRecord(content) || !isRecord(content.methodology)) {
    return null;
  }

  const value = content.methodology.presentation_order;
  return value === 'A_first' || value === 'B_first' ? value : null;
}

function isDecisionCode(value: string | null | undefined): value is DecisionCode {
  return value === '1' || value === '2' || value === '3' || value === '4' || value === '5';
}

function summarizeDecisionCounts(transcripts: Transcript[]): DecisionSummary {
  const counts: Record<DecisionCode, number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };

  let resolvedCount = 0;
  let unresolvedCount = 0;
  let weightedSum = 0;

  transcripts.forEach((transcript) => {
    if (!isDecisionCode(transcript.decisionCode)) {
      unresolvedCount += 1;
      return;
    }

    counts[transcript.decisionCode] += 1;
    resolvedCount += 1;
    weightedSum += Number(transcript.decisionCode);
  });

  return {
    counts,
    resolvedCount,
    unresolvedCount,
    mean: resolvedCount > 0 ? weightedSum / resolvedCount : null,
  };
}

function formatMean(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
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
  return {
    id,
    label,
    summary: summarizeDecisionCounts(transcripts),
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

  const { runs: candidatePairedRuns } = useRuns({
    limit: 1000,
    pause: analysisMode !== 'paired' || !run,
  });

  const companionRunSummary = run == null
    ? null
    : findCompanionPairedRun(run, candidatePairedRuns);

  const { run: companionRun } = useRun({
    id: companionRunSummary?.id ?? '',
    pause: analysisMode !== 'paired' || companionRunSummary == null,
    enablePolling: true,
  });

  const { analysis: companionAnalysis } = useAnalysis({
    runId: companionRunSummary?.id ?? '',
    pause: analysisMode !== 'paired' || companionRunSummary == null,
    enablePolling: false,
    analysisStatus: companionRun?.analysisStatus ?? companionRunSummary?.analysisStatus ?? null,
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

    return buildAnalysisConditionDetailPath(
      ANALYSIS_BASE_PATH,
      id,
      conditionKey,
      detailSearch,
      new URLSearchParams(`mode=${analysisMode}`),
    );
  }, [analysisMode, analysisPath, colDim, conditionKey, id, rowDim, selectedModel]);

  const currentOrder = getRunPresentationOrder(run);
  const companionOrder = getRunPresentationOrder(companionRun);

  const aFirstRun = currentOrder === 'A_first'
    ? run
    : companionOrder === 'A_first'
      ? companionRun
      : null;
  const bFirstRun = currentOrder === 'B_first'
    ? run
    : companionOrder === 'B_first'
      ? companionRun
      : null;
  const aFirstAnalysis = currentOrder === 'A_first'
    ? analysis
    : companionOrder === 'A_first'
      ? companionAnalysis
      : null;
  const bFirstAnalysis = currentOrder === 'B_first'
    ? analysis
    : companionOrder === 'B_first'
      ? companionAnalysis
      : null;

  const orientationLabels = useMemo(
    () => getPairedOrientationLabels(
      aFirstRun?.definition?.content ?? bFirstRun?.definition?.content ?? run?.definition?.content ?? null,
    ),
    [aFirstRun?.definition?.content, bFirstRun?.definition?.content, run?.definition?.content],
  );

  const scoreLabels = useMemo(() => {
    const labels = deriveDecisionDimensionLabels(
      aFirstRun?.definition?.content ?? run?.definition?.content ?? null,
    );

    return DECISION_CODES.map((code) => ({
      code,
      label: labels?.[code] ?? `Decision ${code}`,
    }));
  }, [aFirstRun?.definition?.content, run?.definition?.content]);

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
        orientationBucket?: OrientationBucket;
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
      if (extras?.orientationBucket) params.set('orientationBucket', extras.orientationBucket);
      return params;
    };

    if (analysisMode === 'paired' && companionRun && companionAnalysis) {
      const pooledTranscripts = [
        ...filterConditionTranscripts(run, analysis, rowDim, colDim, row, col, selectedModel),
        ...filterConditionTranscripts(companionRun, companionAnalysis, rowDim, colDim, row, col, selectedModel),
      ];

      rows.push(buildDetailRow(
        'pooled',
        'Pooled',
        pooledTranscripts,
        makeBaseSearch({
          companionRunId: companionRun.id,
          pairView: 'condition-blended',
        }),
      ));

      if (aFirstRun && aFirstAnalysis) {
        rows.push(buildDetailRow(
          'canonical',
          aFirstRun.definition?.name ?? orientationLabels.canonical,
          filterConditionTranscripts(aFirstRun, aFirstAnalysis, rowDim, colDim, row, col, selectedModel),
          makeBaseSearch({
            companionRunId: companionRun.id,
            pairView: 'condition-split',
            orientationBucket: 'canonical',
          }),
        ));
      }

      if (bFirstRun && bFirstAnalysis) {
        rows.push(buildDetailRow(
          'flipped',
          bFirstRun.definition?.name ?? orientationLabels.flipped,
          filterConditionTranscripts(bFirstRun, bFirstAnalysis, rowDim, colDim, row, col, selectedModel),
          makeBaseSearch({
            companionRunId: companionRun.id,
            pairView: 'condition-split',
            orientationBucket: 'flipped',
          }),
        ));
      }

      return rows;
    }

    rows.push(buildDetailRow(
      'single',
      run.definition?.name ?? orientationLabels.current,
      filterConditionTranscripts(run, analysis, rowDim, colDim, parsedCondition.row, parsedCondition.col, selectedModel),
      makeBaseSearch(),
    ));

    return rows;
  }, [
    aFirstAnalysis,
    aFirstRun,
    analysis,
    analysisMode,
    bFirstAnalysis,
    bFirstRun,
    bFirstRun?.definition?.name,
    colDim,
    companionAnalysis,
    companionRun,
    companionRun?.id,
    aFirstRun?.definition?.name,
    orientationLabels.canonical,
    orientationLabels.current,
    orientationLabels.flipped,
    parsedCondition,
    rowDim,
    run,
    run?.definition?.name,
    selectedModel,
  ]);

  const hasUnresolvedTranscripts = detailRows.some((row) => row.summary.unresolvedCount > 0);

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

  const handleBucketClick = (row: DetailRow, decisionCode: DecisionCode) => {
    if (row.summary.counts[decisionCode] === 0) {
      return;
    }

    const params = new URLSearchParams(row.baseSearchParams);
    params.set('decisionCode', decisionCode);
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
          <span className="text-gray-700">{`${rowDim} = ${parsedCondition.row}, ${colDim} = ${parsedCondition.col}`}</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-medium text-gray-900">Condition Detail</h1>
          <p className="text-sm text-gray-600">
            Condition: <span className="font-medium text-gray-900">{rowDim}</span> ={' '}
            <span className="font-medium text-gray-900">{parsedCondition.row}</span>,{' '}
            <span className="font-medium text-gray-900">{colDim}</span> ={' '}
            <span className="font-medium text-gray-900">{parsedCondition.col}</span>
          </p>
          <p className="text-sm text-gray-600">
            Model: <span className="font-medium text-gray-900">{selectedModel}</span>
          </p>
          <p className="text-sm text-gray-500">
            Raw transcript counts by normalized 1-5 decision score. Click any non-zero count to open the matching transcripts.
          </p>
        </div>
      </div>

      {analysisMode === 'paired' && (!companionRun || !companionAnalysis) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Paired companion data is not available yet, so this detail view is showing the current vignette order only.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Vignette Order
              </th>
              {scoreLabels.map(({ code, label }) => (
                <th
                  key={code}
                  className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  <div className="mx-auto flex max-w-[8rem] flex-col items-center gap-1 whitespace-normal leading-tight">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-bold text-gray-700">
                      {code}
                    </span>
                    <span>{label}</span>
                  </div>
                </th>
              ))}
              <th className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">
                n
              </th>
              <th className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">
                Mean
              </th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {row.label}
                </td>
                {DECISION_CODES.map((code) => {
                  const count = row.summary.counts[code];
                  return (
                    <td key={`${row.id}-${code}`} className="px-3 py-3 text-center text-sm text-gray-700">
                      {count > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBucketClick(row, code)}
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
                  {row.summary.resolvedCount}
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-700">
                  {formatMean(row.summary.mean)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasUnresolvedTranscripts && (
        <p className="text-xs text-gray-500">
          Counts and means use only transcripts with normalized 1-5 decision scores. Unresolved transcripts for this condition are excluded.
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
