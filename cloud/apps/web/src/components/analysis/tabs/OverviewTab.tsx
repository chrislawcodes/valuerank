/**
 * Overview Tab
 *
 * Displays a semantics-backed summary table above condition-level drilldowns.
 */

import type { PerModelStats } from './types';
import type { AnalysisResult, VarianceAnalysis, VisualizationData } from '../../../api/operations/analysis';
import type { Run } from '../../../api/operations/runs';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
} from '../../../utils/analysisRouting';
import type {
  AnalysisSemanticsView,
} from '../../analysis-v2/analysisSemantics';
import { OverviewSummaryTable } from './OverviewSummaryTable';

type OverviewTabProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  definitionContent?: unknown;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  expectedAttributes?: string[];
  semantics: AnalysisSemanticsView;
  completedBatches: number | '-';
  aggregateSourceRunCount: number | null;
  coverageBatchCount?: number | null;
  coveragePairedBatchCount?: number | null;
  isAggregate: boolean;
  analysisMode?: 'single' | 'paired';
  companionAnalysis?: AnalysisResult | null;
  currentRun?: Run | null;
};

export function OverviewTab({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  definitionContent: _definitionContent,
  perModel: _perModel,
  visualizationData,
  varianceAnalysis,
  expectedAttributes = [],
  semantics,
  completedBatches,
  aggregateSourceRunCount,
  coverageBatchCount,
  coveragePairedBatchCount,
  isAggregate,
  analysisMode,
  companionAnalysis,
  currentRun,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <OverviewSummaryTable
        runId={runId}
        analysisBasePath={analysisBasePath}
        analysisSearchParams={analysisSearchParams}
        semantics={semantics}
        varianceAnalysis={varianceAnalysis}
        visualizationData={visualizationData}
        companionAnalysis={companionAnalysis}
        expectedAttributes={expectedAttributes}
        completedBatches={completedBatches}
        aggregateSourceRunCount={aggregateSourceRunCount}
        coverageBatchCount={coverageBatchCount}
        coveragePairedBatchCount={coveragePairedBatchCount}
        isAggregate={isAggregate}
        analysisMode={analysisMode}
        currentRun={currentRun}
      />
    </div>
  );
}
