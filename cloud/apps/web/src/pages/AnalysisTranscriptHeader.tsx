/**
 * AnalysisTranscriptHeader
 *
 * The top navigation bar shown on the AnalysisTranscripts page.
 * Contains the back button and breadcrumb labels derived from URL params.
 */

import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import {
  getDisplaySignature,
  formatRepeatPatternLabel,
  formatPairedConditionSourceLabel,
  type PairedConditionSource,
} from '../utils/analysisTranscriptParams';
import { formatDisplayLabel } from '../utils/displayLabels';
import { buildAnalysisTranscriptsPath, ANALYSIS_BASE_PATH } from '../utils/analysisRouting';

interface AggregateRun {
  id: string;
  signature: string;
  count: number;
}

interface DecisionSummary {
  headline: string;
}

interface AnalysisTranscriptHeaderProps {
  onBack: () => void;
  onNavigate: (path: string) => void;
  runId: string;
  definitionName: string | null | undefined;
  isAggregate: boolean;
  trialSignature: string;
  selectedAggregateSignature: string;
  aggregateRuns: AggregateRun[];
  searchParams: URLSearchParams;
  activeRowDim: string;
  activeColDim: string;
  row: string;
  col: string;
  selectedModel: string;
  decisionBucketLabel: string;
  pairedConditionSource: PairedConditionSource | null;
  companionDefinitionName: string | null | undefined;
  pairedValueLabel: string;
  decisionSummary: DecisionSummary;
  repeatPattern: string;
  conditionIds: string[];
  isPairedStabilityDrilldown: boolean;
  hasRepeatPatternParams: boolean;
  hasCellFilterParams: boolean;
}

export function AnalysisTranscriptHeader({
  onBack,
  onNavigate,
  runId,
  definitionName,
  isAggregate,
  trialSignature,
  selectedAggregateSignature,
  aggregateRuns,
  searchParams,
  activeRowDim,
  activeColDim,
  row,
  col,
  selectedModel,
  decisionBucketLabel,
  pairedConditionSource,
  companionDefinitionName,
  pairedValueLabel,
  decisionSummary,
  repeatPattern,
  conditionIds,
  isPairedStabilityDrilldown,
  hasRepeatPatternParams,
  hasCellFilterParams,
}: AnalysisTranscriptHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>
      <div className="text-sm text-gray-500 flex flex-wrap items-center gap-2">
        <span className="text-gray-700">{definitionName || 'Unnamed Definition'}</span>
        <span className="text-gray-300">•</span>
        {isAggregate ? (
          <>
            <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full font-medium">
              Aggregate View
            </span>
            <span className="font-mono bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
              {aggregateRuns.length > 1 ? (
                <select
                  className="bg-transparent border-none p-0 pr-4 text-xs font-mono cursor-pointer focus:ring-0 focus:outline-none focus:bg-gray-200"
                  value={selectedAggregateSignature}
                  onChange={(e) => {
                    const nextRun = aggregateRuns.find((candidate) => candidate.signature === e.target.value);
                    if (nextRun) {
                      onNavigate(buildAnalysisTranscriptsPath(ANALYSIS_BASE_PATH, nextRun.id, searchParams));
                    }
                  }}
                >
                  {aggregateRuns.map((candidate) => (
                    <option key={candidate.signature} value={candidate.signature}>
                      {getDisplaySignature(candidate.signature)}{candidate.count > 1 ? ` (${candidate.count} runs)` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                getDisplaySignature(selectedAggregateSignature)
              )}
            </span>
          </>
        ) : (
          <>
            <span className="font-mono">Trial {runId.slice(0, 8)}...</span>
            <span className="font-mono bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
              {getDisplaySignature(trialSignature)}
            </span>
          </>
        )}
        <span className="text-gray-300">•</span>
        <div className="contents">
          {isPairedStabilityDrilldown ? (
            <>
              Repeat Pattern: <span className="font-medium text-gray-900">{formatRepeatPatternLabel(repeatPattern)}</span>
              <span className="mx-2">•</span>
              Model: <span className="font-medium text-gray-900">{selectedModel}</span>
              <span className="mx-2">•</span>
              <span className="font-medium text-gray-900">Both vignette orders</span>
            </>
          ) : hasRepeatPatternParams ? (
            <>
              Repeat Pattern: <span className="font-medium text-gray-900">{formatRepeatPatternLabel(repeatPattern)}</span>
              <span className="mx-2">•</span>
              Model: <span className="font-medium text-gray-900">{selectedModel}</span>
              <span className="mx-2">•</span>
              Conditions: <span className="font-medium text-gray-900">{conditionIds.length}</span>
              {decisionSummary.headline !== '—' && (
                <>
                  <span className="mx-2">•</span>
                  Decision summary: <span className="font-medium text-gray-900">{decisionSummary.headline}</span>
                </>
              )}
            </>
          ) : (activeRowDim && activeColDim) ? (
            <>
              {hasCellFilterParams ? (
                <>
                  {activeRowDim}: <span className="font-medium text-gray-900">{row || '-'}</span>
                  <span className="mx-2">•</span>
                  {activeColDim}: <span className="font-medium text-gray-900">{col || '-'}</span>
                </>
              ) : (
                <>
                  {activeRowDim} × {activeColDim}
                </>
              )}
              <span className="mx-2">•</span>
              Model: <span className="font-medium text-gray-900">{selectedModel || 'All Models'}</span>
              {decisionBucketLabel && (
                <>
                  <span className="mx-2">•</span>
                  Favors: <span className="font-medium text-gray-900">{decisionBucketLabel}</span>
                </>
              )}
              {pairedConditionSource && (
                <>
                  <span className="mx-2">•</span>
                  Source: <span className="font-medium text-gray-900">{formatPairedConditionSourceLabel(pairedConditionSource, definitionName, companionDefinitionName)}</span>
                </>
              )}
              {pairedValueLabel && (
                <>
                  <span className="mx-2">•</span>
                  Paired Value: <span className="font-medium text-gray-900">{formatDisplayLabel(pairedValueLabel)}</span>
                </>
              )}
              {decisionSummary.headline !== '—' && (
                <>
                  <span className="mx-2">•</span>
                  Decision summary: <span className="font-medium text-gray-900">{decisionSummary.headline}</span>
                </>
              )}
            </>
          ) : (
            'Transcript Filter'
          )}
        </div>
      </div>
    </div>
  );
}
