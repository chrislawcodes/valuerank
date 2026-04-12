/**
 * AnalysisTranscripts Page
 *
 * Shows filtered transcripts for a pivot cell in a full page view.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { TranscriptList } from '../components/runs/TranscriptList';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import { AnalysisScopeBanner } from '../components/analysis/AnalysisScopeBanner';
import type { Transcript } from '../api/operations/runs';
import { formatDisplayLabel } from '../utils/displayLabels';
import { formatPairedConditionSourceLabel } from '../utils/analysisTranscriptParams';
import { useAnalysisTranscriptsData } from '../hooks/useAnalysisTranscriptsData';
import { AnalysisTranscriptHeader } from './AnalysisTranscriptHeader';
import { PairedStabilityView } from './PairedStabilityView';

export function AnalysisTranscripts() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);

  const {
    loading,
    error,
    run,
    companionRun,
    isAggregate,
    trialSignature,
    selectedAggregateSignature,
    aggregateRuns,
    searchParams,
    row,
    col,
    selectedModel,
    repeatPattern,
    selectedTranscriptId,
    pairedValueLabel,
    pairView,
    pairedConditionSource,
    analysisMode,
    conditionIds,
    activeRowDim,
    activeColDim,
    hasCellFilterParams,
    hasRepeatPatternParams,
    hasDirectTranscriptParam,
    hasBucketFilterParams,
    hasPairedValueFilterParams,
    hasPairedConditionFilterParams,
    isPairedStabilityDrilldown,
    scenarioDimensions,
    companionScenarioDimensions,
    mergedScenarioDimensions,
    decisionBucketLabel,
    filteredTranscripts,
    primaryStabilityTranscripts,
    companionStabilityTranscripts,
    decisionSummary,
    pairedConditionStateError,
    reportStateError,
    handleDecisionChange,
    updatingTranscriptIds,
  } = useAnalysisTranscriptsData(id);

  useEffect(() => {
    if (!hasDirectTranscriptParam) return;
    const matched = filteredTranscripts.find((t) => t.id === selectedTranscriptId) ?? null;
    setSelectedTranscript(matched);
  }, [filteredTranscripts, hasDirectTranscriptParam, selectedTranscriptId]);

  useEffect(() => {
    if (!selectedTranscript) return;
    const matched = filteredTranscripts.find((t) => t.id === selectedTranscript.id);
    if (!matched || matched === selectedTranscript) return;
    setSelectedTranscript(matched);
  }, [filteredTranscripts, selectedTranscript]);

  const transcriptCoverage = filteredTranscripts.reduce(
    (acc, transcript) => {
      const metadata = transcript.decisionModelV2?.raw;
      const canonical = transcript.decisionModelV2?.canonical ?? null;
      if (metadata?.manualOverride) acc.manual += 1;
      if (metadata?.parseClass === 'exact') {
        acc.exact += 1;
      } else if (metadata?.parseClass === 'fallback_resolved') {
        acc.fallback += 1;
      } else if (metadata?.parseClass === 'ambiguous') {
        acc.ambiguous += 1;
      }
      if (
        canonical == null
        || canonical.direction === 'unknown'
        || canonical.strength === 'unknown'
        || canonical.source === 'error'
        || metadata?.parseClass === 'unparseable'
      ) {
        acc.unresolved += 1;
      }
      return acc;
    },
    { exact: 0, fallback: 0, ambiguous: 0, manual: 0, unresolved: 0 }
  );

  const listDisplayMode = 'audit' as const;
  const viewerDisplayMode = 'audit' as const;
  const decisionColumnLabel = 'Decision summary';
  const decisionColumnTooltip = 'Shows the canonical decision headline and summary from the backend transcript data.';

  const backButton = (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>
    </div>
  );

  if (loading && !run) {
    return (
      <div className="space-y-6">
        {backButton}
        <Loading size="lg" text="Loading transcripts..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {backButton}
        <ErrorMessage message={`Failed to load transcripts: ${error.message}`} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6">
        {backButton}
        <ErrorMessage message="Trial not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalysisTranscriptHeader
        onBack={() => navigate(-1)}
        onNavigate={(path) => navigate(path)}
        runId={run.id}
        definitionName={run.definition?.name}
        isAggregate={isAggregate}
        trialSignature={trialSignature}
        selectedAggregateSignature={selectedAggregateSignature}
        aggregateRuns={aggregateRuns}
        searchParams={searchParams}
        activeRowDim={activeRowDim}
        activeColDim={activeColDim}
        row={row}
        col={col}
        selectedModel={selectedModel}
        decisionBucketLabel={decisionBucketLabel}
        pairedConditionSource={pairedConditionSource}
        companionDefinitionName={companionRun?.definition?.name}
        pairedValueLabel={pairedValueLabel}
        decisionSummary={decisionSummary}
        repeatPattern={repeatPattern}
        conditionIds={conditionIds}
        isPairedStabilityDrilldown={isPairedStabilityDrilldown}
        hasRepeatPatternParams={hasRepeatPatternParams}
        hasCellFilterParams={hasCellFilterParams}
      />

      {analysisMode && (
        <AnalysisScopeBanner analysisMode={analysisMode} compact />
      )}

      {hasPairedValueFilterParams && pairedValueLabel && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
          Blended paired inspection is active for <span className="font-medium">{formatDisplayLabel(pairedValueLabel)}</span>. This list merges transcripts from both companion runs for the selected model.
        </div>
      )}

      {hasPairedConditionFilterParams && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
          {pairView === 'condition-split' && pairedConditionSource ? (
            <>
              Paired source inspection is active for the <span className="font-medium">{formatPairedConditionSourceLabel(pairedConditionSource, run?.definition?.name, companionRun?.definition?.name)}</span> transcripts in this condition cell.
            </>
          ) : (
            <>
              Blended paired inspection is active for this condition cell. This list merges transcripts from both companion runs for the selected model.
            </>
          )}
        </div>
      )}

      {!scenarioDimensions && !hasRepeatPatternParams && !hasDirectTranscriptParam && !hasPairedValueFilterParams && !hasPairedConditionFilterParams && !isPairedStabilityDrilldown && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Condition dimension data is not available for this run. Recompute analysis to enable pivot filtering.
        </div>
      )}

      {!isPairedStabilityDrilldown && filteredTranscripts.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">Decision coverage</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              Exact {transcriptCoverage.exact}
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
              Fallback {transcriptCoverage.fallback}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              Ambiguous {transcriptCoverage.ambiguous}
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
              Manual {transcriptCoverage.manual}
            </span>
          </div>
          {transcriptCoverage.unresolved > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {transcriptCoverage.unresolved} transcript{transcriptCoverage.unresolved === 1 ? '' : 's'} in this view still do not have an analyzable canonical decision.
              Open those transcripts to review the raw evidence.
            </p>
          )}
        </div>
      )}

      {isPairedStabilityDrilldown ? (
        <PairedStabilityView
          repeatPattern={repeatPattern}
          primaryRunName={run?.definition?.name}
          companionRunName={companionRun?.definition?.name}
          primaryTranscripts={primaryStabilityTranscripts}
          companionTranscripts={companionStabilityTranscripts}
          primaryScenarioDimensions={scenarioDimensions}
          companionScenarioDimensions={companionScenarioDimensions}
          onSelectTranscript={setSelectedTranscript}
          onDecisionChange={handleDecisionChange}
          updatingTranscriptIds={updatingTranscriptIds}
          decisionColumnLabel={decisionColumnLabel}
          decisionColumnTooltip={decisionColumnTooltip}
          decisionDisplayMode={listDisplayMode}
        />
      ) : pairedConditionStateError ? (
        <ErrorMessage message={pairedConditionStateError.message} />
      ) : reportStateError ? (
        <ErrorMessage message={reportStateError.message} />
      ) : !hasDirectTranscriptParam && !hasRepeatPatternParams && !hasPairedValueFilterParams && !hasPairedConditionFilterParams && scenarioDimensions && !hasCellFilterParams && !hasBucketFilterParams ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Missing filter parameters. Return to the pivot table and click a cell to view transcripts.
        </div>
      ) : filteredTranscripts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          {hasRepeatPatternParams ? 'No transcripts found for these conditions.' : 'No transcripts found for this condition.'}
        </div>
      ) : (
        <TranscriptList
          transcripts={filteredTranscripts}
          onSelect={setSelectedTranscript}
          groupByModel={false}
          scenarioDimensions={mergedScenarioDimensions}
          onDecisionChange={handleDecisionChange}
          updatingTranscriptIds={updatingTranscriptIds}
          decisionColumnLabel={decisionColumnLabel}
          decisionColumnTooltip={decisionColumnTooltip}
          decisionDisplayMode={listDisplayMode}
        />
      )}

      {selectedTranscript && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
          onDecisionChange={handleDecisionChange}
          decisionUpdating={updatingTranscriptIds.has(selectedTranscript.id)}
          decisionDisplayMode={viewerDisplayMode}
        />
      )}
    </div>
  );
}
