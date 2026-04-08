import { ChevronRight, Clock3, Loader2, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../ui/Badge';
import { getBatchRuntimeState, getBatchStageLabel } from './launch-state';
import {
  formatTimestamp,
  getPrimaryProgressText,
  getProgressBarTone,
  getProgressPercent,
} from './DomainEvaluationStatusPanel.helpers';
import type {
  DomainEvaluation,
  DomainEvaluationMember,
  DomainEvaluationStatus,
  DomainTrialRunsStatusQueryResult,
} from '../../../api/operations/domains';

type RunStatusRow = DomainTrialRunsStatusQueryResult['domainTrialRunsStatus'][number];

type DomainEvaluationStatusPanelProps = {
  domainName: string;
  evaluation: (DomainEvaluation & { members: DomainEvaluationMember[] }) | null;
  evaluationStatus: DomainEvaluationStatus | null;
  runStatuses: RunStatusRow[];
  fetching: boolean;
  lastUpdatedAt: number | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
};

type RowView = {
  runId: string;
  definitionId: string;
  definitionName: string;
  status: string;
  analysisStatus: string | null;
  updatedAt: string | null;
  stalledModels: string[];
  latestErrorMessage: string | null;
  modelStatuses: RunStatusRow['modelStatuses'];
};

export function DomainEvaluationStatusPanel({
  domainName,
  evaluation,
  evaluationStatus,
  runStatuses,
  fetching,
  lastUpdatedAt,
  selectedRunId,
  onSelectRun,
}: DomainEvaluationStatusPanelProps) {
  const memberByRunId = new Map((evaluation?.members ?? []).map((member) => [member.runId, member]));
  const rows: RowView[] = [];

  for (const status of runStatuses) {
    const member = memberByRunId.get(status.runId);
    if (!member) continue;
    rows.push({
      runId: status.runId,
      definitionId: status.definitionId,
      definitionName: member.definitionNameAtLaunch,
      status: status.status,
      analysisStatus: status.analysisStatus,
      updatedAt: status.updatedAt,
      stalledModels: status.stalledModels ?? [],
      latestErrorMessage: status.modelStatuses.find((model) => model.latestErrorMessage != null)?.latestErrorMessage ?? null,
      modelStatuses: status.modelStatuses,
    });
  }

  for (const member of evaluation?.members ?? []) {
    if (rows.some((row) => row.runId === member.runId)) continue;
    rows.push({
      runId: member.runId,
      definitionId: member.definitionIdAtLaunch,
      definitionName: member.definitionNameAtLaunch,
      status: member.runStatus,
      analysisStatus: null,
      updatedAt: member.runCompletedAt ?? member.runStartedAt ?? member.createdAt,
      stalledModels: [],
      latestErrorMessage: null,
      modelStatuses: [],
    });
  }

  const liveRows = rows.filter((row) => getBatchRuntimeState(row) === 'LIVE');
  const exceptionRows = rows.filter((row) => getBatchRuntimeState(row) === 'EXCEPTION');
  const completeRows = rows.filter((row) => row.status === 'COMPLETED' && row.analysisStatus === 'completed');
  const total = evaluationStatus?.totalRuns ?? rows.length;
  const analysisCompleteCount = evaluationStatus?.completedRuns ?? completeRows.length;
  const remainingCount = Math.max(0, total - analysisCompleteCount);

  const percentComplete = total > 0 ? Math.round((analysisCompleteCount / total) * 100) : 0;
  const counts = {
    done: analysisCompleteCount,
    complete: completeRows.length,
    remaining: remainingCount,
    live: liveRows.length,
    failed: evaluationStatus?.failedRuns ?? exceptionRows.length,
  };

  if (!evaluation && rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">Status</h2>
        <p className="mt-1 text-sm text-gray-600">No active launch is available for {domainName}.</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Status</h2>
          <p className="text-sm text-gray-600">
            Live batches, summarizing batches, and analysis stages for {domainName}.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {fetching && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing live status
            </span>
          )}
          {!fetching && lastUpdatedAt && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              Last refresh {new Date(lastUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Batches complete</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{percentComplete}%</div>
          <div className="mt-2 h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-teal-500" style={{ width: `${percentComplete}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Done</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{counts.done}</div>
          <div className="text-xs text-gray-600">Run work finished</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Remaining</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{counts.remaining}</div>
          <div className="text-xs text-gray-600">Still needed for this launch</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Currently processing</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{counts.live}</div>
          <div className="text-xs text-gray-600">Moving right now</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Failed</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{counts.failed}</div>
          <div className="text-xs text-gray-600">Needs attention</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1 font-medium text-gray-700">
          Analysis complete: {counts.complete}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1">
          Rows leave the live list once they stop moving.
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Live processing</h3>
          <p className="text-sm text-gray-600">Rows stay here while the batch is actively moving or analyzing.</p>
        </div>
        {liveRows.length === 0 ? (
          <p className="text-sm text-gray-500">No batches are actively moving right now.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {liveRows.map((row) => {
                  const selected = selectedRunId === row.runId;
                  const runtime = getBatchRuntimeState(row);
                  return (
                    <tr
                      key={row.runId}
                      className={`cursor-pointer transition-colors hover:bg-teal-50/40 ${selected ? 'bg-teal-50/70' : ''}`}
                      onClick={() => onSelectRun(row.runId)}
                    >
                      <td className="px-4 py-3 align-top">
                        <Link
                          to={`/runs/${row.runId}`}
                          className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.definitionName}
                        </Link>
                        <div className="text-xs text-gray-500">Batch {row.runId.slice(-8)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={runtime === 'EXCEPTION' ? 'error' : runtime === 'LIVE' ? 'warning' : 'neutral'} size="count">
                            {getBatchStageLabel(row)}
                          </Badge>
                          {row.analysisStatus && <Badge variant="info" size="count">Analysis {row.analysisStatus}</Badge>}
                        </div>
                        {row.stalledModels.length > 0 && (
                          <div className="mt-1 text-xs text-amber-700">
                            Stalled models: {row.stalledModels.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        <div>{getPrimaryProgressText(row)}</div>
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100">
                          <div className={`h-1.5 rounded-full ${getProgressBarTone(row)}`} style={{ width: `${getProgressPercent(row)}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">{formatTimestamp(row.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Needs attention</h3>
          <p className="text-sm text-gray-600">Stalled or failed batches live here until the issue is reviewed.</p>
        </div>
        {exceptionRows.length === 0 ? (
          <p className="text-sm text-gray-500">No stalled or failed batches right now.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Problem</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {exceptionRows.map((row) => {
                  const selected = selectedRunId === row.runId;
                  const problem = row.stalledModels.length > 0
                    ? `Stalled model${row.stalledModels.length === 1 ? '' : 's'}`
                    : row.analysisStatus === 'failed'
                      ? 'Analysis failed'
                      : row.status === 'FAILED'
                        ? 'Run failed'
                        : row.status === 'CANCELLED'
                          ? 'Run cancelled'
                          : 'Needs review';
                  return (
                    <tr
                      key={row.runId}
                      className={`cursor-pointer transition-colors hover:bg-amber-50/50 ${selected ? 'bg-amber-50/80' : ''}`}
                      onClick={() => onSelectRun(row.runId)}
                    >
                      <td className="px-4 py-3 align-top">
                        <Link
                          to={`/runs/${row.runId}`}
                          className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.definitionName}
                        </Link>
                        <div className="text-xs text-gray-500">Batch {row.runId.slice(-8)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <Badge variant="error" size="count">{problem}</Badge>
                        </div>
                          <div className="mt-1 text-xs text-gray-600">
                            {row.latestErrorMessage ?? (row.stalledModels.length > 0 ? row.stalledModels.join(', ') : 'Review the log details.')}
                          </div>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        <div>{getPrimaryProgressText(row)}</div>
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100">
                          <div className={`h-1.5 rounded-full ${getProgressBarTone(row)}`} style={{ width: `${getProgressPercent(row)}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">
                        <div className="flex items-center gap-2">
                          {formatTimestamp(row.updatedAt)}
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fetching && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Refreshing the current launch state.
        </div>
      )}

      {evaluation?.status === 'COMPLETED' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          <AlertTriangle className="h-4 w-4" />
          This launch has completed. Open a row to review the run details.
        </div>
      )}
    </section>
  );
}
