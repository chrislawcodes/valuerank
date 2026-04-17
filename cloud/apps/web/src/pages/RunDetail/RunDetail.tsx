/**
 * RunDetail Page
 *
 * Displays details of a single run including progress and results.
 */

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { formatRunName } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { RunProgress } from '../../components/runs/RunProgress';
import { RunResults } from '../../components/runs/RunResults';
import { SummarizationControls } from '../../components/runs/SummarizationControls';
import { RerunDialog } from '../../components/runs/RerunDialog';
import { useRun } from '../../hooks/useRun';
import { useAnalysis } from '../../hooks/useAnalysis';
import { RunHeader } from './RunHeader';
import { RunMetadata } from './RunMetadata';
import { RunNameEditor } from './RunNameEditor';
import { AnalysisBanner } from './AnalysisBanner';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { formatTemperatureSetting } from '../../lib/temperature';
import { getDefinitionMethodology, getDefinitionMethodologyLabel } from '../../utils/methodology';
import { StalledModelsBanner, UnresolvableBanner, formatRunDate, getDisplaySignature } from './RunDetailBanners';
import { useRunDetailHandlers } from './useRunDetailHandlers';

export function RunDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { run, loading, error, refetch } = useRun({
    id: id ?? '',
    pause: !id,
    enablePolling: true,
  });
  const { analysis } = useAnalysis({
    runId: id ?? '',
    pause: !id,
    enablePolling: false,
    analysisStatus: run?.analysisStatus ?? null,
  });

  const scenarioDimensionsFromTranscripts = (() => {
    const transcripts = run?.transcripts;
    if (!transcripts) return undefined;
    const result: Record<string, Record<string, string | number>> = {};
    let hasAny = false;
    for (const t of transcripts) {
      if (t.scenarioId && t.dimensionValues && Object.keys(t.dimensionValues).length > 0) {
        result[t.scenarioId] = t.dimensionValues;
        hasAny = true;
      }
    }
    return hasAny ? result : undefined;
  })();

  const handlers = useRunDetailHandlers(run ?? null, refetch);

  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
      <ArrowLeft className="w-4 h-4 mr-1" />
      Back to Trials
    </Button>
  );

  if (loading && !run) {
    return <div className="space-y-6"><div className="flex items-center gap-4">{backButton}</div><Loading size="lg" text="Loading run..." /></div>;
  }
  if (error) {
    return <div className="space-y-6"><div className="flex items-center gap-4">{backButton}</div><ErrorMessage message={`Failed to load run: ${error.message}`} /></div>;
  }
  if (!run) {
    return <div className="space-y-6"><div className="flex items-center gap-4">{backButton}</div><ErrorMessage message="Trial not found" /></div>;
  }

  const isActive = run.status === 'PENDING' || run.status === 'RUNNING' || run.status === 'SUMMARIZING';
  const isPaused = run.status === 'PAUSED';
  const isTerminal = run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED';
  const trialSignature = formatTrialSignature(run.definitionVersion ?? run.definition?.version ?? null, run.config?.temperature ?? null);
  const methodology = getDefinitionMethodology(run.definition?.content);
  const methodologyLabel = getDefinitionMethodologyLabel(run.definition?.content, run.definition?.domain?.name ?? null);
  const isPairedRun = methodology?.pair_key != null;
  const launchModeLabel = isPairedRun
    ? run.config?.jobChoiceLaunchMode === 'AD_HOC_BATCH' ? 'Ad Hoc Batch'
    : run.config?.jobChoiceLaunchMode === 'PAIRED_BATCH' ? 'Paired Batch' : null
    : null;

  return (
    <div className="space-y-6">
      <RunHeader
        runId={run.id}
        status={run.status}
        isTerminal={isTerminal}
        onPause={handlers.handlePause}
        onResume={handlers.handleResume}
        onCancel={handlers.handleCancel}
        onRerun={() => setIsRerunDialogOpen(true)}
        onDelete={() => setIsDeleteConfirmOpen(true)}
      />

      <StalledModelsBanner run={run} />
      <UnresolvableBanner data={run.unresolvableTranscriptCount} />

      {(run.status === 'SUMMARIZING' || isTerminal) && run.transcriptCount > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-700">Summarization</h3>
              <p className="text-xs text-gray-500 mb-2">Attribute Values</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {run.status === 'SUMMARIZING'
                  ? `Processing ${run.summarizeProgress?.completed ?? 0} of ${run.summarizeProgress?.total ?? 0} transcripts`
                  : run.summarizeProgress
                    ? `${run.summarizeProgress.completed} of ${run.transcriptCount} transcripts summarized`
                    : 'Summarization not started'}
              </p>
            </div>
            <SummarizationControls
              runId={run.id}
              status={run.status}
              summarizeProgress={run.summarizeProgress}
              transcriptCount={run.transcriptCount}
              onCancelSummarization={handlers.handleCancelSummarization}
              onRestartSummarization={handlers.handleRestartSummarization}
              onSuccess={() => { }}
              onError={() => { }}
              size="sm"
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <Play className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/definitions/${run.definitionId}`}
                  className="text-xl font-medium text-gray-900 hover:text-teal-600 transition-colors flex items-center gap-2"
                >
                  {run.definition?.name || 'Unnamed Vignette'}
                  {(run.definitionVersion || run.definition?.version) && (
                    <span className="text-gray-500 font-normal text-base">v{run.definitionVersion ?? run.definition?.version}</span>
                  )}
                </Link>
                {methodologyLabel && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">{methodologyLabel}</span>
                )}
                {launchModeLabel && (
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${launchModeLabel === 'Paired Batch' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-700'}`}>
                    {launchModeLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <RunNameEditor name={run.name} formattedName={formatRunName(run)} onSave={handlers.handleSaveName} variant="subtitle" />
                <span className="text-sm text-gray-500">
                  · <span className="font-mono">{getDisplaySignature(trialSignature)}</span> · {run.definition?.name || 'Vignette'} · {formatRunDate(run.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <RunMetadata createdAt={run.createdAt} startedAt={run.startedAt} completedAt={run.completedAt} temperature={run.config?.temperature} />

        <div className="mb-6">
          <AnalysisBanner runId={run.id} analysisStatus={run.analysisStatus} runStatus={run.status} />
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-medium text-gray-700">Progress</h3>
            {isPairedRun && run.config?.jobChoiceLaunchMode === 'PAIRED_BATCH' && (
              <span className="text-xs font-medium text-teal-600">· 1 of 2 vignettes</span>
            )}
          </div>
          <RunProgress run={run} showPerModel={true} />
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Start Evaluation Trial</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Models:</span>
              <div className="mt-1">
                {run.config?.models?.map((model) => (
                  <span key={model} className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs mr-2 mb-1">{model}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Sample:</span>
              <span className="ml-2 text-gray-900">{run.config?.samplePercentage ?? 100}%</span>
            </div>
            <div>
              <span className="text-gray-500">Temperature:</span>
              <span className="ml-2 text-gray-900">{formatTemperatureSetting(run.config?.temperature)}</span>
            </div>
          </div>
        </div>

        {(isTerminal || run.transcriptCount > 0) && (
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Results</h3>
            {handlers.exportError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{handlers.exportError}</div>
            )}
            <RunResults
              run={run}
              onExport={() => void handlers.handleExport()}
              isExporting={handlers.isExporting}
              onExportAdjudication={isPairedRun ? () => void handlers.handleExportAdjudication() : undefined}
              isExportingAdjudication={handlers.isExportingAdjudication}
              onExportTranscripts={() => void handlers.handleExportTranscripts()}
              isExportingTranscripts={handlers.isExportingTranscripts}
              scenarioDimensions={analysis?.visualizationData?.scenarioDimensions ?? scenarioDimensionsFromTranscripts}
              onUpdateTranscriptDecision={handlers.handleUpdateTranscriptDecision}
            />
          </div>
        )}
      </div>

      {(isActive || isPaused) && (
        <div className="text-center text-sm text-gray-500">
          {isActive ? 'Updating every 5 seconds...' : 'Trial is paused'}
        </div>
      )}

      <RerunDialog
        run={run}
        scenarioCount={run.runProgress?.total}
        isOpen={isRerunDialogOpen}
        onClose={() => setIsRerunDialogOpen(false)}
        onSuccess={handlers.handleRerunSuccess}
      />

      <DeleteConfirmModal
        isOpen={isDeleteConfirmOpen}
        isDeleting={handlers.isDeleting}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => void handlers.handleDelete()}
      />
    </div>
  );
}
