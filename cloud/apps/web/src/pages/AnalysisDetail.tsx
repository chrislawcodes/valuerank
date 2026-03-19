/**
 * AnalysisDetail Page
 *
 * Displays detailed analysis for a single run with full AnalysisPanel.
 */

import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { AnalysisPanel } from '../components/analysis/AnalysisPanel';
import { findCompanionPairedRun } from '../components/analysis/PairedRunComparisonCard';
import { useAnalysis } from '../hooks/useAnalysis';
import { useRun } from '../hooks/useRun';
import { useRuns } from '../hooks/useRuns';
import { getRunDefinitionContent } from '../utils/runDefinitionContent';
import type { AnalysisTab } from '../components/analysis/tabs';
import { ANALYSIS_BASE_PATH, buildAnalysisDetailPath, isAggregateAnalysis } from '../utils/analysisRouting';
import { getDefinitionMethodology, getDefinitionMethodologyLabel } from '../utils/methodology';

function parseAnalysisTab(value: string | null): AnalysisTab {
  if (value === 'overview' || value === 'decisions' || value === 'scenarios') {
    return value;
  }
  return 'overview';
}

type AnalysisDetailMode = 'single' | 'paired';

function parseAnalysisDetailMode(value: string | null): AnalysisDetailMode {
  return value === 'paired' ? 'paired' : 'single';
}

function buildAnalysisDetailParams(searchParams: URLSearchParams, mode: AnalysisDetailMode): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.set('mode', mode);
  return next;
}

function getDisplaySignature(signature: string | null | undefined): string {
  return signature && signature !== 'v?td' ? signature : 'Unknown Signature';
}

export function AnalysisDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = parseAnalysisTab(searchParams.get('tab'));
  const analysisMode = parseAnalysisDetailMode(searchParams.get('mode'));
  const handleModeChange = (mode: AnalysisDetailMode) => {
    const next = buildAnalysisDetailParams(searchParams, mode);
    navigate({
      pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, id || ''),
      search: next.toString().length > 0 ? `?${next.toString()}` : '',
    }, { replace: true });
  };

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
    pause: !run,
  });
  const companionRun = run == null
    ? null
    : findCompanionPairedRun(run, candidatePairedRuns);
  const { analysis: companionAnalysis } = useAnalysis({
    runId: companionRun?.id ?? '',
    pause: analysisMode !== 'paired' || companionRun == null,
    enablePolling: false,
    analysisStatus: companionRun?.analysisStatus ?? null,
  });

  // Loading state
  if (loading && !run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Loading size="lg" text="Loading analysis..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
      </div>
    );
  }

  // Not found
  if (!run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message="Trial not found" />
      </div>
    );
  }

  const isAggregate = isAggregateAnalysis(
    run.tags?.some((tag) => tag.name === 'Aggregate') ?? false,
    analysis?.analysisType,
  );

  const config = run.config as {
    definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
    temperature?: unknown;
  } | null;

  const runDefinitionVersion = typeof config?.definitionSnapshot?._meta?.definitionVersion === 'number'
    ? config.definitionSnapshot._meta.definitionVersion
    : typeof config?.definitionSnapshot?.version === 'number'
      ? config.definitionSnapshot.version
      : typeof run.definitionVersion === 'number'
        ? run.definitionVersion
        : null;

  const runTemperature = typeof config?.temperature === 'number' ? config.temperature : null;
  const trialSignature = formatTrialSignature(runDefinitionVersion, runTemperature);

  const latestDefinitionVersion = run.definition?.version;
  const isOldVersion = (
    runDefinitionVersion !== null
    && runDefinitionVersion !== undefined
    && latestDefinitionVersion !== null
    && latestDefinitionVersion !== undefined
    && runDefinitionVersion !== latestDefinitionVersion
  );
  const definitionContent = getRunDefinitionContent(run);
  const methodologyLabel = getDefinitionMethodologyLabel(
    definitionContent,
    run.definition?.domain?.name ?? null,
  );
  const methodology = getDefinitionMethodology(definitionContent);
  const runLaunchMode = run.config?.jobChoiceLaunchMode;
  const isPairedBatch = runLaunchMode === 'PAIRED_BATCH';
  const launchModeLabel = methodology?.family === 'job-choice'
    ? runLaunchMode === 'AD_HOC_BATCH'
      ? 'Ad Hoc Batch'
      : runLaunchMode === 'PAIRED_BATCH'
        ? 'Paired Batch'
        : null
    : null;
  const handleSingleVignetteChange = (nextRunId: string) => {
    if (!nextRunId || nextRunId === run.id) {
      return;
    }

    const next = buildAnalysisDetailParams(searchParams, 'single');
    navigate({
      pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, nextRunId),
      search: next.toString().length > 0 ? `?${next.toString()}` : '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Header
          runId={run.id}
          definitionId={run.definition?.id}
          definitionName={run.definition?.name}
          methodologyLabel={methodologyLabel}
          launchModeLabel={launchModeLabel}
          isAggregate={isAggregate}
          currentSignature={trialSignature}
        />
      </div>

      {!run.analysisStatus ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Analysis Available
          </h3>
          <p className="text-gray-500 mb-4">
            This trial does not have analysis data.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnalysisPanel
            runId={run.id}
            analysisStatus={run.analysisStatus}
            analysisBasePath={ANALYSIS_BASE_PATH}
            analysisSearchParams={searchParams}
            analysisMode={analysisMode}
            onAnalysisModeChange={handleModeChange}
            onSingleVignetteChange={handleSingleVignetteChange}
            companionAnalysis={analysisMode === 'paired' ? companionAnalysis : null}
            currentRun={run}
            companionRun={isPairedBatch ? companionRun : null}
            definitionContent={definitionContent}
            transcripts={run.transcripts}
            isOldVersion={isOldVersion}
            isAggregate={isAggregate}
            pendingSince={run.completedAt}
            initialTab={initialTab}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Header component with navigation.
 */
function Header({
  runId,
  definitionId,
  definitionName,
  methodologyLabel,
  launchModeLabel,
  isAggregate,
  currentSignature,
}: {
  runId: string;
  definitionId?: string | null;
  definitionName?: string | null;
  methodologyLabel?: string | null;
  launchModeLabel?: string | null;
  isAggregate?: boolean;
  currentSignature?: string | null;
}) {
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
                        navigate({
                          pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, nextRun.id),
                          search: currentSearch.length > 0 ? `?${currentSearch}` : '',
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
