import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats, VarianceAnalysis, VisualizationData } from '../../api/operations/analysis';
import type { Transcript } from '../../api/operations/runs';
import { resolveScenarioAttributes } from '../../utils/decisionLabels';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
  buildAnalysisTranscriptsPath,
} from '../../utils/analysisRouting';
import {
  buildOrientedConditionRows,
} from '../../utils/pairedScopeAdapter';
import type { OrientationInspectionMode, OrientedConditionRow } from '../../utils/pairedScopeAdapter';
import { compareConditionRows } from '../../utils/conditionOrdering';
import { formatDisplayLabel } from '../../utils/displayLabels';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import {
  buildCanonicalTranscriptIndex,
  collectCanonicalConditionTranscripts,
  getConditionCellDisplay,
  summarizeCanonicalConditionTranscripts,
  type CanonicalConditionSummary,
} from '../../utils/canonicalConditionSummary';
import {
  buildModelHeaders,
  groupModelHeadersByFamily,
  hasGroupedFamilyVariants,
} from './modelHeaderLabels';
import { ConditionDecisionsTableHead } from './ConditionDecisionsTableHead';

type ConditionDecisionsTableProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  companionRunId?: string | null;
  analysisMode?: 'single' | 'paired';
  perModel: Record<string, PerModelStats>;
  transcripts?: Transcript[];
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  expectedAttributes?: string[];
  title?: string;
  description?: string | null;
  currentVignetteName?: string | null;
  companionVignetteName?: string | null;
  /**
   * When provided, the component operates in controlled mode: these model IDs
   * are used directly as the visible columns and the local "AI Columns" dropdown
   * is hidden. When omitted, the local selector remains active.
   */
  externalSelectedModels?: string[];
};


export function ConditionDecisionsTable({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  companionRunId,
  analysisMode,
  perModel,
  transcripts = [],
  visualizationData,
  varianceAnalysis,
  expectedAttributes = [],
  title = 'Condition Decisions',
  description = null,
  currentVignetteName,
  companionVignetteName,
  externalSelectedModels,
}: ConditionDecisionsTableProps) {
  const meanTableRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  const transcriptIndex = useMemo(() => buildCanonicalTranscriptIndex(transcripts), [transcripts]);
  const models = useMemo(() => {
    const modelIds = new Set<string>(Object.keys(perModel));
    Object.keys(modelScenarioMatrix ?? {}).forEach((modelId) => modelIds.add(modelId));
    return [...modelIds].sort();
  }, [modelScenarioMatrix, perModel]);

  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, expectedAttributes, modelScenarioMatrix);
  }, [scenarioDimensions, expectedAttributes, modelScenarioMatrix]);

  const attributeA = availableAttributes[0] ?? '';
  const attributeB = availableAttributes[1] ?? availableAttributes[0] ?? '';

  // Local model selection (used when externalSelectedModels is not provided)
  const [localSelectedModels, setLocalSelectedModels] = useState<string[]>(models);
  const canSplitOrientations = analysisMode === 'paired' && (varianceAnalysis?.orientationCorrectedCount ?? 0) > 0;
  const [inspectionMode, setInspectionMode] = useState<OrientationInspectionMode>('pooled');
  const splitSourceLabels = canSplitOrientations
    ? {
        current: currentVignetteName ?? 'Current vignette',
        companion: companionVignetteName ?? 'Companion vignette',
      }
    : null;

  // Sync local selection when models list changes (uncontrolled path only)
  useEffect(() => {
    if (externalSelectedModels != null) return;
    setLocalSelectedModels((current) => {
      const next = current.filter((modelId) => models.includes(modelId));
      return next.length > 0 ? next : models;
    });
  }, [models, externalSelectedModels]);

  useEffect(() => {
    if (!canSplitOrientations && inspectionMode !== 'pooled') {
      setInspectionMode('pooled');
    }
  }, [canSplitOrientations, inspectionMode]);

  // Controlled path: use externalSelectedModels intersected with known models
  // Uncontrolled path: use localSelectedModels
  const visibleModels = useMemo(
    () => externalSelectedModels != null
      ? models.filter((modelId) => externalSelectedModels.includes(modelId))
      : models.filter((modelId) => localSelectedModels.includes(modelId)),
    [models, localSelectedModels, externalSelectedModels],
  );
  const modelHeaders = useMemo(() => buildModelHeaders(visibleModels), [visibleModels]);
  const groupedModelHeaders = useMemo(
    () => groupModelHeadersByFamily(modelHeaders),
    [modelHeaders],
  );
  const hasGroupedFamilies = useMemo(
    () => hasGroupedFamilyVariants(groupedModelHeaders),
    [groupedModelHeaders],
  );

  const toggleModel = (modelId: string) => {
    setLocalSelectedModels((current) => {
      if (current.includes(modelId)) {
        return current.filter((id) => id !== modelId);
      }
      return [...current, modelId];
    });
  };

  const conditionRows = useMemo<OrientedConditionRow[]>(() => {
    return buildOrientedConditionRows(
      scenarioDimensions,
      attributeA,
      attributeB,
      varianceAnalysis,
      canSplitOrientations && inspectionMode === 'split' ? 'split' : 'pooled',
    );
  }, [attributeA, attributeB, canSplitOrientations, inspectionMode, scenarioDimensions, varianceAnalysis]);

  const sortedConditionRows = useMemo(() => {
    const nextRows = [...conditionRows];
    nextRows.sort(compareConditionRows);
    return nextRows;
  }, [conditionRows]);

  const canonicalCellSummaries = useMemo(() => {
    const summaryMap = new Map<string, Map<string, CanonicalConditionSummary>>();

    sortedConditionRows.forEach((row) => {
      const rowSummaries = new Map<string, CanonicalConditionSummary>();
      visibleModels.forEach((modelId) => {
        const cellTranscripts = collectCanonicalConditionTranscripts(transcriptIndex, modelId, row.scenarioIds);
        rowSummaries.set(modelId, summarizeCanonicalConditionTranscripts(cellTranscripts));
      });
      summaryMap.set(row.id, rowSummaries);
    });

    return summaryMap;
  }, [sortedConditionRows, transcriptIndex, visibleModels]);

  const handleCellClick = (modelId: string, row: OrientedConditionRow, options?: { decisionStrength?: 'unknown' }) => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      row: row.attributeALevel,
      col: row.attributeBLevel,
      model: modelId,
    });
    if (analysisMode === 'paired' && companionRunId) {
      params.set('companionRunId', companionRunId);
      if (canSplitOrientations && inspectionMode === 'split') {
        params.set('pairView', 'condition-split');
        params.set('sourceRun', row.orientationBucket === 'canonical' ? 'current' : 'companion');
      } else {
        params.set('pairView', 'condition-blended');
        params.set('sourceRun', 'pooled');
      }
    }
    if (options?.decisionStrength) {
      params.set('decisionStrength', options.decisionStrength);
    }
    navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params, analysisSearchParams));
  };

  if (!scenarioDimensions || !modelScenarioMatrix) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Condition-level matrix data is unavailable. Recompute analysis to regenerate condition dimensions.
      </div>
    );
  }

  if (availableAttributes.length < 2) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Need at least two condition attributes to build an attribute A/B overview table.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700">{title}</h3>
          {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
        </div>
        <CopyVisualButton targetRef={meanTableRef} label="condition decisions table" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* Local AI Columns selector — hidden when page-level filter is active */}
        {externalSelectedModels == null && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-gray-500">AI Columns</label>
            <details className="relative">
              <summary className="min-w-52 cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                {visibleModels.length === models.length
                  ? 'All target AIs'
                  : `${visibleModels.length} of ${models.length} selected`}
              </summary>
              <div className="absolute z-10 mt-2 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-teal-700 hover:text-teal-800"
                    onClick={() => setLocalSelectedModels(models)}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-gray-600 hover:text-gray-800"
                    onClick={() => setLocalSelectedModels([])}
                  >
                    Clear
                  </Button>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {models.map((modelId) => (
                    <label key={modelId} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={localSelectedModels.includes(modelId)}
                        onChange={() => toggleModel(modelId)}
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="truncate" title={modelId}>
                        {modelId}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          {canSplitOrientations && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Inspection View</label>
              <div className="inline-flex rounded-md border border-gray-300 bg-white p-1 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`min-h-0 rounded px-3 py-1.5 text-sm ${inspectionMode === 'pooled' ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  aria-pressed={inspectionMode === 'pooled'}
                  onClick={() => setInspectionMode('pooled')}
                >
                  Pooled
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`min-h-0 rounded px-3 py-1.5 text-sm ${inspectionMode === 'split' ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  aria-pressed={inspectionMode === 'split'}
                  onClick={() => setInspectionMode('split')}
                >
                  Split by source
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {canSplitOrientations && inspectionMode === 'split' && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          Split inspection keeps the pooled paired summary above, but breaks these tables into
          separate <span className="font-medium">{splitSourceLabels?.current}</span> and <span className="font-medium">{splitSourceLabels?.companion}</span> buckets so you can verify the pair directly.
        </div>
      )}

      <div ref={meanTableRef} className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse">
          <ConditionDecisionsTableHead
            attributeA={attributeA}
            attributeB={attributeB}
            modelHeaders={modelHeaders}
            groupedModelHeaders={groupedModelHeaders}
            hasGroupedFamilies={hasGroupedFamilies}
          />
          <tbody>
            {sortedConditionRows.map((row) => (
              <tr key={row.id}>
                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  {formatDisplayLabel(row.attributeALevel)}
                </td>
                <td className="w-36 border border-gray-200 px-3 py-2 text-sm text-gray-700 align-top">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="max-w-[8rem] whitespace-normal break-words leading-5">
                      {formatDisplayLabel(row.attributeBLevel)}
                    </span>
                    {canSplitOrientations && inspectionMode === 'split' && (
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                        {row.orientationBucket === 'canonical'
                          ? splitSourceLabels?.current
                          : splitSourceLabels?.companion}
                      </span>
                    )}
                  </div>
                </td>
                {visibleModels.map((modelId) => {
                  const stats = canonicalCellSummaries.get(row.id)?.get(modelId)
                    ?? summarizeCanonicalConditionTranscripts([]);
                  const hasResolvedCanonicalEvidence = stats.totalTrials > 0;
                  const display = getConditionCellDisplay(stats);
                  const isOtherCell = !hasResolvedCanonicalEvidence;
                  const splitSourceLabel = row.orientationBucket === 'canonical'
                    ? splitSourceLabels?.current
                    : splitSourceLabels?.companion;
                  const title = `View transcripts for ${modelId} | ${formatDisplayLabel(attributeA)}: ${formatDisplayLabel(row.attributeALevel)}, ${formatDisplayLabel(attributeB)}: ${formatDisplayLabel(row.attributeBLevel)}${canSplitOrientations && inspectionMode === 'split' ? ` | ${splitSourceLabel}` : ''}${isOtherCell ? ' | Decision: other' : ''}${stats.unknownCount > 0 ? ` | Unknown: ${stats.unknownCount}` : ''}`;

                  return (
                    <td
                      key={`${row.id}-${modelId}`}
                      className="border border-gray-200 px-3 py-2 text-center text-sm transition-colors"
                      style={{ backgroundColor: hasResolvedCanonicalEvidence ? display.backgroundColor : undefined }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                        title={title}
                        onClick={() => handleCellClick(modelId, row, isOtherCell ? { decisionStrength: 'unknown' } : undefined)}
                      >
                        {hasResolvedCanonicalEvidence ? (
                          <span className={`inline-flex flex-col items-center ${display.textColorClass}`}>
                            <span className="font-semibold">{display.label}</span>
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </Button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {visibleModels.length === 0 && (
          <div className="mt-2 text-xs text-amber-700">Select at least one AI column to display data.</div>
        )}
        <div className="mt-2 text-xs text-gray-500">
          Unknown canonical trials are excluded from condition scores.
        </div>
      </div>
    </div>
  );
}
