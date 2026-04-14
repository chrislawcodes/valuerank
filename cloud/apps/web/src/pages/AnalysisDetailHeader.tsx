/**
 * AnalysisDetailHeader
 *
 * Page header for AnalysisDetail. Shows navigation, vignette name,
 * methodology/launch-mode badges, and an aggregate-run selector.
 *
 * Extracted from AnalysisDetail.tsx to keep that file under the 400-line limit.
 */

import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { Button } from '../components/ui/Button';
import { useRuns } from '../hooks/useRuns';
import { ANALYSIS_BASE_PATH, buildAnalysisDetailPath } from '../utils/analysisRouting';

export const COVERAGE_CONTEXT_QUERY_KEYS = ['coverageBatchCount', 'coveragePairedBatchCount'] as const;

function getDisplaySignature(signature: string | null | undefined): string {
  return signature && signature !== 'v?td' ? signature : 'Unknown Signature';
}

export type AnalysisDetailHeaderProps = {
  runId: string;
  definitionId?: string | null;
  definitionName?: string | null;
  methodologyLabel?: string | null;
  launchModeLabel?: string | null;
  isAggregate?: boolean;
  currentSignature?: string | null;
};

export function AnalysisDetailHeader({
  runId,
  definitionId,
  definitionName,
  methodologyLabel,
  launchModeLabel,
  isAggregate,
  currentSignature,
}: AnalysisDetailHeaderProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { runs } = useRuns({
    definitionId: isAggregate ? (definitionId || undefined) : undefined,
    status: 'COMPLETED',
    limit: 1000,
    pause: !isAggregate || !definitionId,
  });

  const aggregateRuns = runs.filter(r => (r.tags ?? []).some(t => t.name === 'Aggregate')).map(r => {
    const config = r.config as {
      definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
      temperature?: unknown;
    } | null;
    const defVersion = typeof config?.definitionSnapshot?._meta?.definitionVersion === 'number'
      ? config.definitionSnapshot._meta.definitionVersion
      : typeof config?.definitionSnapshot?.version === 'number'
        ? config.definitionSnapshot.version
        : typeof r.definitionVersion === 'number'
          ? r.definitionVersion
          : null;
    const temp = typeof config?.temperature === 'number' ? config.temperature : null;
    return { id: r.id, signature: formatTrialSignature(defVersion, temp) };
  }).reduce<Array<{ id: string; signature: string; count: number }>>((acc, run) => {
    const existing = acc.find((item) => item.signature === run.signature);
    if (existing) {
      existing.count += 1;
      if (run.id === runId) {
        existing.id = run.id;
      }
      return acc;
    }
    acc.push({ ...run, count: 1 });
    return acc;
  }, []);

  const selectedAggregateSignature = aggregateRuns.find((run) => run.id === runId)?.signature ?? currentSignature ?? 'v?td';
  const currentSearch = searchParams.toString();

  return (
    <div className="flex items-start justify-between flex-1 mr-4 gap-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Analysis
        </Button>
        <span className="text-gray-300">|</span>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          {definitionName || 'Unnamed Definition'}
          {methodologyLabel && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              {methodologyLabel}
            </span>
          )}
          {launchModeLabel && (
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                launchModeLabel === 'Paired Batch'
                  ? 'bg-teal-100 text-teal-800'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {launchModeLabel}
            </span>
          )}
          <span className="mx-1">•</span>
          {isAggregate ? (
            <div className="flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full font-medium flex items-center">
                Aggregate View
              </span>
              <span className="font-mono bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
                {aggregateRuns.length > 1 ? (
                  <select
                    className="bg-transparent border-none p-0 pr-4 text-xs font-mono cursor-pointer focus:ring-0 focus:outline-none focus:bg-gray-200"
                    value={selectedAggregateSignature}
                    onChange={(e) => {
                      const nextRun = aggregateRuns.find((run) => run.signature === e.target.value);
                      if (nextRun) {
                        const nextSearchParams = new URLSearchParams(currentSearch);
                        for (const key of COVERAGE_CONTEXT_QUERY_KEYS) {
                          nextSearchParams.delete(key);
                        }
                        navigate({
                          pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, nextRun.id),
                          search: nextSearchParams.toString().length > 0 ? `?${nextSearchParams.toString()}` : '',
                        });
                      }
                    }}
                  >
                    {aggregateRuns.map(r => (
                      <option key={r.signature} value={r.signature}>
                        {getDisplaySignature(r.signature)}{r.count > 1 ? ` (${r.count} runs)` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  getDisplaySignature(currentSignature)
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono">Trial {runId.slice(0, 8)}...</span>
              <span className="font-mono bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
                {getDisplaySignature(currentSignature)}
              </span>
            </div>
          )}
        </div>
      </div>
      {!isAggregate && (
        <Link
          to={`/runs/${runId}`}
          className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700"
        >
          <Play className="w-4 h-4" />
          View Trial
        </Link>
      )}
    </div>
  );
}
