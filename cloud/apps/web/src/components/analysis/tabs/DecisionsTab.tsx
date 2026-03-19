/**
 * Decisions Tab
 *
 * Keeps the V1 decision-distribution surface while switching reliability
 * semantics onto the validated summary adapter.
 */

import { DecisionDistributionChart } from '../DecisionDistributionChart';
import { ModelConsistencyChart } from '../ModelConsistencyChart';
import type { VisualizationData } from '../../../api/operations/analysis';
import type { AnalysisSemanticsView, AvailabilityState } from '../../analysis-v2/analysisSemantics';

type DecisionsTabProps = {
  visualizationData: VisualizationData | null | undefined;
  dimensionLabels?: Record<string, string>;
  semantics: AnalysisSemanticsView;
  analysisMode?: 'single' | 'paired';
  isPooledAcrossCompanionRuns?: boolean;
};

function UnavailableCallout({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
      {message}
    </div>
  );
}

type UnavailableState = Extract<AvailabilityState, { status: 'unavailable' }>;

function getUnifiedUnavailableState(semantics: AnalysisSemanticsView): UnavailableState {
  if (semantics.reliability.rowAvailability.status === 'unavailable') {
    return semantics.reliability.rowAvailability;
  }

  const unavailableModels = Object.values(semantics.reliability.byModel)
    .filter((model) => model.availability.status === 'unavailable');

  if (
    unavailableModels.length > 0
    && unavailableModels.every(
      (model) => model.availability.status === 'unavailable' && model.availability.reason === 'no-repeat-coverage',
    )
  ) {
    return {
      status: 'unavailable',
      reason: 'no-repeat-coverage',
      message: 'This model has one sample per scenario, so baseline reliability is unavailable. Recomputing the same run without repeated samples will not populate this section.',
    };
  }

  return {
    status: 'unavailable',
    reason: 'invalid-summary-shape',
    message: 'Stored analysis summaries are invalid for this UI version.',
  };
}

export function DecisionsTab({
  visualizationData,
  dimensionLabels,
  semantics,
  analysisMode,
  isPooledAcrossCompanionRuns = false,
}: DecisionsTabProps) {
  const showDistribution = visualizationData != null;
  const showReliability = semantics.reliability.rowAvailability.status === 'available' && semantics.reliability.hasAnyAvailableModel;

  if (!showDistribution && !showReliability) {
    const unavailableState = getUnifiedUnavailableState(semantics);
    return (
      <div className="space-y-3">
        <UnavailableCallout message={unavailableState.message} />
        {unavailableState.reason !== 'aggregate-analysis' && (
          <p className="text-xs text-gray-500">Repeatability details live in Stability.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {showDistribution && (
        <DecisionDistributionChart
          visualizationData={visualizationData}
          dimensionLabels={dimensionLabels}
        />
      )}

      <div className={showDistribution ? 'border-t border-gray-200 pt-6' : ''}>
        <ModelConsistencyChart
          reliability={semantics.reliability}
          analysisMode={analysisMode}
          isPooledAcrossCompanionRuns={isPooledAcrossCompanionRuns}
        />
        <p className="mt-3 text-xs text-gray-500">Repeatability details live in Stability.</p>
      </div>
    </div>
  );
}
