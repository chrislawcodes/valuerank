/**
 * Overview Summary Table
 *
 * Renders the per-model summary grid with preference, win-rate, and repeat-pattern columns.
 */

import { useMemo, useRef } from 'react';
import { CopyVisualButton } from '../../ui/CopyVisualButton';
import { resolveScenarioAttributes } from '../../../utils/decisionLabels';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
} from '../../../utils/analysisRouting';
import type { AnalysisResult, VarianceAnalysis, VisualizationData } from '../../../api/operations/analysis';
import type { Run } from '../../../api/operations/runs';
import type { AnalysisSemanticsView, PreferenceViewModel, ReliabilityViewModel } from '../../analysis-v2/analysisSemantics';
import {
  buildConditionRows,
  formatPercent,
  getPreferredValueName,
  getPreferenceUnavailableReason,
  getMetricUnavailableReason,
  getRepeatPatternMetrics,
  mergeRepeatPatternMetrics,
  getOverviewUnavailableMessage,
} from './OverviewTabHelpers';
import type { RepeatPatternSource } from './OverviewTabTypes';
import { REPEAT_PATTERN_LABELS, SUMMARY_COLUMN_TITLES } from './OverviewTabTypes';
import {
  SummaryHeader,
  SummaryCell,
  ModeAvailabilitySection,
  PatternMetricButton,
  PairedPatternMetricButton,
} from './OverviewTabComponents';

export function OverviewSummaryTable({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  semantics,
  varianceAnalysis,
  visualizationData,
  companionAnalysis,
  expectedAttributes = [],
  completedBatches,
  aggregateSourceRunCount,
  coverageBatchCount,
  coveragePairedBatchCount,
  isAggregate,
  analysisMode,
  currentRun,
  currentAnalysis: _currentAnalysis,
  companionRun: _companionRun,
}: {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  semantics: AnalysisSemanticsView;
  varianceAnalysis?: VarianceAnalysis | null;
  visualizationData: VisualizationData | null | undefined;
  companionAnalysis?: AnalysisResult | null;
  expectedAttributes?: string[];
  completedBatches: number | '-';
  aggregateSourceRunCount: number | null;
  coverageBatchCount?: number | null;
  coveragePairedBatchCount?: number | null;
  isAggregate: boolean;
  analysisMode?: 'single' | 'paired';
  currentRun?: Run | null;
  currentAnalysis?: AnalysisResult | null;
  companionRun?: Run | null;
}) {
  const models = useMemo(() => {
    return Object.keys(semantics.preference.byModel)
      .sort((left, right) => left.localeCompare(right))
      .map((modelId) => {
        const preference = semantics.preference.byModel[modelId];
        const reliability = semantics.reliability.byModel[modelId];
        if (!preference || !reliability) {
          return null;
        }

        return {
          modelId,
          preference,
          reliability,
        };
      })
      .filter((model): model is {
        modelId: string;
        preference: PreferenceViewModel;
        reliability: ReliabilityViewModel;
      } => model !== null);
  }, [semantics.preference.byModel, semantics.reliability.byModel]);

  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, expectedAttributes, modelScenarioMatrix);
  }, [expectedAttributes, modelScenarioMatrix, scenarioDimensions]);
  const attributeA = availableAttributes[0] ?? '';
  const attributeB = availableAttributes[1] ?? availableAttributes[0] ?? '';
  const conditionRows = useMemo(
    () => buildConditionRows(scenarioDimensions, attributeA, attributeB),
    [attributeA, attributeB, scenarioDimensions],
  );
  const companionConditionRows = useMemo(
    () => buildConditionRows(companionAnalysis?.visualizationData?.scenarioDimensions, attributeA, attributeB),
    [attributeA, attributeB, companionAnalysis?.visualizationData?.scenarioDimensions],
  );
  const repeatPatternSources = useMemo<RepeatPatternSource[]>(() => {
    const sources: RepeatPatternSource[] = [{
      runId,
      varianceAnalysis,
      conditionRows,
    }];

    if (analysisMode === 'paired' && companionAnalysis) {
      sources.push({
        runId: companionAnalysis.runId,
        varianceAnalysis: companionAnalysis.varianceAnalysis,
        conditionRows: companionConditionRows,
      });
    }

    return sources;
  }, [analysisMode, companionAnalysis, companionConditionRows, conditionRows, runId, varianceAnalysis]);
  const isPooledAcrossRuns = repeatPatternSources.length > 1;
  const summaryUnavailableMessage = getOverviewUnavailableMessage(
    semantics,
    analysisMode,
    companionAnalysis != null,
  );

  const helperText = coverageBatchCount !== null && coverageBatchCount !== undefined
    ? coveragePairedBatchCount !== null && coveragePairedBatchCount !== undefined
      ? `Run-level evidence: ${coverageBatchCount} batches from coverage cell \u2022 ${coveragePairedBatchCount} paired batches`
      : `Run-level evidence: ${coverageBatchCount} batches from coverage cell`
    : analysisMode === 'paired' && companionAnalysis
      ? `Run-level evidence: pooled across ${repeatPatternSources.length} companion runs`
      : isAggregate
        ? aggregateSourceRunCount === null
          ? 'Run-level evidence: contributing source-run count unavailable'
          : `Run-level evidence: ${aggregateSourceRunCount} contributing source run${aggregateSourceRunCount === 1 ? '' : 's'}`
        : completedBatches === '-'
          ? 'Run-level evidence: completed batch count unavailable'
          : `Run-level evidence: ${completedBatches} completed batch${completedBatches === 1 ? '' : 'es'}`;

  const summaryRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={summaryRef} className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Overview Summary</h3>
          <p className="mt-1 text-xs text-gray-500">{helperText}</p>
        </div>
        <CopyVisualButton targetRef={summaryRef} label="overview summary" />
      </div>

      {summaryUnavailableMessage ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {summaryUnavailableMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Model" title={SUMMARY_COLUMN_TITLES.model} />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Preferred Value" title={SUMMARY_COLUMN_TITLES.preferredValue} />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Win Rate" title={SUMMARY_COLUMN_TITLES.winRate} />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Value Agreement" title={SUMMARY_COLUMN_TITLES.valueAgreement} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Stable %" title={SUMMARY_COLUMN_TITLES.stable} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Soft Lean %" title={SUMMARY_COLUMN_TITLES.softLean} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Torn %" title={SUMMARY_COLUMN_TITLES.torn} align="center" />
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">
                <SummaryHeader label="Unstable %" title={SUMMARY_COLUMN_TITLES.unstable} align="center" />
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map(({ modelId, preference, reliability }) => {
              const preferredValue = getPreferredValueName(preference);
              const preferredValueWinRate = (
                preference.topPrioritizedValues[0]
                ?? preference.neutralValues[0]
                ?? preference.topDeprioritizedValues[0]
              )?.winRate ?? null;
              const perSourceMetricsList = repeatPatternSources.map(
                (source) => getRepeatPatternMetrics(modelId, source.varianceAnalysis, source.conditionRows),
              );
              const repeatMetrics = mergeRepeatPatternMetrics(perSourceMetricsList);
              const primarySourceMetrics = perSourceMetricsList[0] ?? null;
              const companionSourceMetrics = perSourceMetricsList[1] ?? null;
              const repeatEvidenceDetail = repeatMetrics.status === 'available'
                ? `${repeatMetrics.classifiedCount} of ${repeatMetrics.repeatedCount} repeated conditions classified \u2022 ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`
                : `${repeatMetrics.reason} \u2022 ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`;

              return (
                <tr key={modelId}>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{modelId}</div>
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    {preferredValue ? (
                      <SummaryCell title={preferredValue}>{preferredValue}</SummaryCell>
                    ) : (
                      <SummaryCell title={getPreferenceUnavailableReason(preference)} showInfoIcon>—</SummaryCell>
                    )}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    {preferredValueWinRate !== null && preferredValueWinRate !== undefined ? (
                      <SummaryCell title={`Preferred value win rate: ${Math.round(preferredValueWinRate * 100)}%`}>
                        {Math.round(preferredValueWinRate * 100)}%
                      </SummaryCell>
                    ) : (
                      <SummaryCell title={getPreferenceUnavailableReason(preference)} showInfoIcon>—</SummaryCell>
                    )}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                    {reliability.directionalAgreement !== null ? (
                      <SummaryCell title={`Directional agreement: ${formatPercent(reliability.directionalAgreement)}`}>
                        {formatPercent(reliability.directionalAgreement)}
                      </SummaryCell>
                    ) : (
                      <SummaryCell title={getMetricUnavailableReason(reliability)} showInfoIcon>—</SummaryCell>
                    )}
                  </td>
                  {(['stable', 'softLean', 'torn', 'noisy'] as const).map((pattern) => {
                    const label = REPEAT_PATTERN_LABELS[pattern];
                    const count = repeatMetrics.status === 'available' ? repeatMetrics.counts[pattern] : 0;
                    const title = repeatMetrics.status === 'available'
                      ? isPooledAcrossRuns
                        ? `${label}: ${repeatMetrics.counts[pattern]} of ${repeatMetrics.classifiedCount} repeated conditions across both vignette orders`
                        : `${label}: ${repeatMetrics.counts[pattern]} of ${repeatMetrics.classifiedCount} repeated conditions \u2022 ${repeatMetrics.strongerConfidenceCount} condition${repeatMetrics.strongerConfidenceCount === 1 ? '' : 's'} with 10+ repeats`
                      : repeatEvidenceDetail;

                    return (
                      <td key={pattern} className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                        {repeatMetrics.status === 'available' && count > 0 && !isPooledAcrossRuns ? (
                          <PatternMetricButton
                            runId={runId}
                            analysisBasePath={analysisBasePath}
                            analysisSearchParams={analysisSearchParams}
                            modelId={modelId}
                            pattern={pattern}
                            metrics={repeatMetrics}
                            title={title}
                            rowDim={attributeA}
                            colDim={attributeB}
                          />
                        ) : repeatMetrics.status === 'available' && count > 0 && isPooledAcrossRuns
                            && companionAnalysis != null
                            && primarySourceMetrics !== null && primarySourceMetrics.status === 'available'
                            && companionSourceMetrics !== null && companionSourceMetrics.status === 'available' ? (
                          <PairedPatternMetricButton
                            runId={runId}
                            companionRunId={companionAnalysis.runId}
                            analysisBasePath={analysisBasePath}
                            analysisSearchParams={analysisSearchParams}
                            modelId={modelId}
                            pattern={pattern}
                            primaryMetrics={primarySourceMetrics}
                            companionMetrics={companionSourceMetrics}
                            title={title}
                            rowDim={attributeA}
                            colDim={attributeB}
                          />
                        ) : (
                          <SummaryCell title={title} showInfoIcon={repeatMetrics.status === 'unavailable'} align="center">
                            {repeatMetrics.status === 'available'
                              ? formatPercent(repeatMetrics.classifiedCount === 0 ? 0 : repeatMetrics.counts[pattern] / repeatMetrics.classifiedCount)
                              : '—'}
                          </SummaryCell>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-200 pt-4">
        {currentRun?.definition?.id != null ? (
          <ModeAvailabilitySection
            title="Paired Run Comparison"
            message={`Paired analysis has moved to its own page. Open /vignette/${currentRun.definition.id}/paired to see direction-balanced numbers across all completed runs.`}
          />
        ) : (
          <ModeAvailabilitySection
            title="Paired Run Comparison"
            message="Paired analysis has moved to a vignette-scoped page. This run is not linked to a vignette, so the new view is unreachable from here."
          />
        )}
      </div>
    </div>
  );
}
