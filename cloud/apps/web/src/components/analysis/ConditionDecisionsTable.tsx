import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats, VarianceAnalysis, VisualizationData } from '../../api/operations/analysis';
import { resolveScenarioAttributes } from '../../utils/decisionLabels';
import {
  ANALYSIS_BASE_PATH,
  type AnalysisBasePath,
  buildAnalysisTranscriptsPath,
} from '../../utils/analysisRouting';
import {
  buildOrientedConditionRows,
  getOrientationBucketLabel,
} from '../../utils/pairedScopeAdapter';
import type { OrientationInspectionMode, OrientedConditionRow } from '../../utils/pairedScopeAdapter';
import { formatDisplayLabel } from '../../utils/displayLabels';
import type { PairedOrientationLabels } from '../../utils/methodology';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';

type ConditionStats = {
  mean: number;
};

type ModelHeader = {
  familyKey: string;
  familyLabel: string;
  modelId: string;
  variantLabel: string;
};

type ConditionDecisionsTableProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  companionRunId?: string | null;
  orientationLabels: PairedOrientationLabels;
  analysisMode?: 'single' | 'paired';
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  varianceAnalysis?: VarianceAnalysis | null;
  expectedAttributes?: string[];
  title?: string;
  description?: string | null;
};

function inferModelFamily(modelId: string): { key: string; label: string } {
  const normalized = modelId.toLowerCase().replace(/^[^:]+:/, '');

  if (normalized.includes('deepseek')) {
    return { key: 'deepseek', label: 'DeepSeek' };
  }
  if (normalized.includes('claude')) {
    if (normalized.includes('sonnet')) {
      return { key: 'claude-sonnet', label: 'Sonnet' };
    }
    if (normalized.includes('haiku')) {
      return { key: 'claude-haiku', label: 'Haiku' };
    }
    if (normalized.includes('opus')) {
      return { key: 'claude-opus', label: 'Opus' };
    }
    return { key: 'claude', label: 'Claude' };
  }
  if (normalized.includes('gemini')) {
    return { key: 'gemini', label: 'Gemini' };
  }
  if (normalized.includes('grok')) {
    return { key: 'grok', label: 'Grok' };
  }
  if (normalized.includes('gpt')) {
    return { key: 'gpt', label: 'GPT' };
  }
  if (normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')) {
    const familyToken = normalized.split(/[-_\s.]/, 1)[0] ?? normalized;
    return { key: familyToken, label: familyToken.toUpperCase() };
  }
  if (normalized.includes('mistral')) {
    return { key: 'mistral', label: 'Mistral' };
  }

  return { key: normalized || modelId, label: formatModelDisplayName(normalized || modelId) };
}

function formatModelDisplayName(label: string): string {
  return formatDisplayLabel(label)
    .split(/([-\s]+)/)
    .map((part) => {
      if (/^[-\s]+$/.test(part)) return part;

      const normalized = part.toLowerCase();
      if (normalized === 'gpt') return 'GPT';
      if (normalized === 'xai') return 'xAI';
      if (normalized === 'openai') return 'OpenAI';
      if (normalized === 'anthropic') return 'Anthropic';
      if (normalized === 'google') return 'Google';
      if (normalized === 'deepseek') return 'DeepSeek';
      if (normalized === 'mistral') return 'Mistral';
      if (normalized === 'claude') return 'Claude';
      if (normalized === 'gemini') return 'Gemini';
      if (normalized === 'grok') return 'Grok';
      if (normalized === 'chat') return 'Chat';
      if (normalized === 'reasoner') return 'Reasoner';
      if (normalized === 'flash') return 'Flash';
      if (normalized === 'pro') return 'Pro';
      if (normalized === 'mini') return 'Mini';
      if (normalized === 'fast') return 'Fast';
      if (normalized === 'sonnet') return 'Sonnet';
      if (normalized === 'haiku') return 'Haiku';
      if (normalized === 'opus') return 'Opus';

      if (/^[a-z]/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }

      return part;
    })
    .join('');
}

function formatClaudeVariantLabel(variant: string): string {
  const tokens = variant
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);

  const style = tokens.find((token) => token === 'sonnet' || token === 'haiku' || token === 'opus');
  if (!style) {
    return formatModelDisplayName(variant);
  }

  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));
  let version = '';
  if (numericTokens.length >= 2) {
    version = `${numericTokens[0]}.${numericTokens[1]}`;
  } else if (numericTokens.length === 1) {
    version = numericTokens[0] ?? '';
  }

  const styleLabel = formatModelDisplayName(style);
  return version ? `${styleLabel} ${version}` : styleLabel;
}

function formatClaudeVersionLabel(variant: string): string {
  const tokens = variant
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);

  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));
  if (numericTokens.length >= 2) {
    return `${numericTokens[0]}.${numericTokens[1]}`;
  }
  if (numericTokens.length === 1) {
    return numericTokens[0] ?? '';
  }

  return formatModelDisplayName(variant);
}

function formatGrokVariantLabel(variant: string): string {
  const tokens = variant
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);

  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));
  let version = '';
  if (numericTokens.length >= 2) {
    version = `${numericTokens[0]}.${numericTokens[1]}`;
  } else if (numericTokens.length === 1) {
    version = numericTokens[0] ?? '';
  }

  if (tokens.includes('fast') && tokens.includes('reasoning')) {
    return `${version ? `${version} ` : ''}Fast\nReasoning`;
  }

  return formatModelDisplayName(variant);
}

function formatModelVariantLabel(modelId: string, familyKey: string): string {
  let variant = modelId.replace(/^[^:]+:/, '');

  if (familyKey === 'deepseek') {
    variant = variant.replace(/^deepseek[-_ ]*/i, '');
  } else if (familyKey === 'claude' || familyKey.startsWith('claude-')) {
    variant = variant.replace(/^(anthropic[-_ ]*)?claude[-_ ]*/i, '');
  } else if (familyKey === 'gemini') {
    variant = variant.replace(/^(google[-_ ]*)?gemini[-_ ]*/i, '');
  } else if (familyKey === 'grok') {
    variant = variant.replace(/^(xai[-_ ]*)?grok[-_ ]*/i, '');
  } else if (familyKey === 'gpt') {
    variant = variant.replace(/^(openai[-_ ]*)?gpt[-_ ]*/i, '');
  } else if (/^o[134]/.test(familyKey)) {
    variant = variant.replace(new RegExp(`^${familyKey}[-_ ]*`, 'i'), '');
  } else if (familyKey === 'mistral') {
    variant = variant.replace(/^mistral[-_ ]*/i, '');
  }

  if (!variant.trim()) {
    variant = modelId;
  }

  if (familyKey === 'claude') {
    return formatClaudeVariantLabel(variant);
  }
  if (familyKey.startsWith('claude-')) {
    return formatClaudeVersionLabel(variant);
  }
  if (familyKey === 'grok') {
    return formatGrokVariantLabel(variant);
  }

  return formatModelDisplayName(variant);
}

function buildModelHeaders(modelIds: string[]): ModelHeader[] {
  return modelIds.map((modelId) => {
    const family = inferModelFamily(modelId);
    return {
      familyKey: family.key,
      familyLabel: family.label,
      modelId,
      variantLabel: formatModelVariantLabel(modelId, family.key),
    };
  });
}

function getHeatmapColor(value: number): string {
  if (value < 1 || value > 5) return 'rgba(243, 244, 246, 0.4)';
  if (value <= 2.5) {
    const intensity = Math.max(0.1, (3 - value) / 2);
    return `rgba(59, 130, 246, ${intensity * 0.3})`;
  }
  if (value >= 3.5) {
    const intensity = Math.max(0.1, (value - 3) / 2);
    return `rgba(249, 115, 22, ${intensity * 0.3})`;
  }
  return 'rgba(156, 163, 175, 0.15)';
}

function getScoreTextColor(value: number): string {
  if (value <= 2.5) return 'text-blue-700';
  if (value >= 3.5) return 'text-orange-700';
  return 'text-gray-700';
}

function calculateConditionStatsFromVariance(
  modelId: string,
  scenarioIds: string[],
  varianceAnalysis?: VarianceAnalysis | null,
): ConditionStats | null {
  if (!varianceAnalysis) return null;

  const modelStats = varianceAnalysis.perModel[modelId];
  if (!modelStats?.perScenario) return null;

  let weightedMeanSum = 0;
  let totalCount = 0;

  scenarioIds.forEach((scenarioId) => {
    const scenarioStats = modelStats.perScenario[scenarioId];
    if (!scenarioStats || scenarioStats.sampleCount < 1) return;

    weightedMeanSum += scenarioStats.mean * scenarioStats.sampleCount;
    totalCount += scenarioStats.sampleCount;
  });

  if (totalCount === 0) return null;

  return { mean: weightedMeanSum / totalCount };
}

export function ConditionDecisionsTable({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  companionRunId,
  orientationLabels,
  analysisMode,
  perModel,
  visualizationData,
  varianceAnalysis,
  expectedAttributes = [],
  title = 'Condition Decisions',
  description = null,
}: ConditionDecisionsTableProps) {
  const meanTableRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
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
  const [selectedModels, setSelectedModels] = useState<string[]>(models);
  const canSplitOrientations = analysisMode === 'paired' && (varianceAnalysis?.orientationCorrectedCount ?? 0) > 0;
  const [inspectionMode, setInspectionMode] = useState<OrientationInspectionMode>('pooled');
  const canonicalOrientationLabel = orientationLabels.canonical;
  const flippedOrientationLabel = orientationLabels.flipped;

  useEffect(() => {
    setSelectedModels((current) => {
      const next = current.filter((modelId) => models.includes(modelId));
      return next.length > 0 ? next : models;
    });
  }, [models]);

  useEffect(() => {
    if (!canSplitOrientations && inspectionMode !== 'pooled') {
      setInspectionMode('pooled');
    }
  }, [canSplitOrientations, inspectionMode]);

  const visibleModels = useMemo(
    () => models.filter((modelId) => selectedModels.includes(modelId)),
    [models, selectedModels],
  );
  const modelHeaders = useMemo(() => buildModelHeaders(visibleModels), [visibleModels]);
  const groupedModelHeaders = useMemo(() => {
    const groups: Array<{
      familyKey: string;
      familyLabel: string;
      models: ModelHeader[];
    }> = [];
    const byFamily = new Map<string, (typeof groups)[number]>();

    modelHeaders.forEach((header) => {
      const existing = byFamily.get(header.familyKey);
      if (existing) {
        existing.models.push(header);
        return;
      }

      const nextGroup = {
        familyKey: header.familyKey,
        familyLabel: header.familyLabel,
        models: [header],
      };
      groups.push(nextGroup);
      byFamily.set(header.familyKey, nextGroup);
    });

    return groups;
  }, [modelHeaders]);
  const hasGroupedFamilies = useMemo(
    () =>
      groupedModelHeaders.some((group) =>
        group.models.some((header) => header.variantLabel !== group.familyLabel)
      ),
    [groupedModelHeaders],
  );

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => {
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

  const getMeanDecision = (modelId: string, scenarioIds: string[]): ConditionStats | null => {
    const varianceStats = calculateConditionStatsFromVariance(modelId, scenarioIds, varianceAnalysis);
    if (varianceStats) return varianceStats;

    const byScenario = modelScenarioMatrix?.[modelId];
    if (!byScenario) return null;

    const values: number[] = [];
    scenarioIds.forEach((scenarioId) => {
      const score = byScenario[scenarioId];
      if (typeof score === 'number' && Number.isFinite(score)) {
        values.push(score);
      }
    });

    if (values.length === 0) return null;
    return { mean: values.reduce((sum, v) => sum + v, 0) / values.length };
  };

  const sortedConditionRows = useMemo(() => {
    const nextRows = [...conditionRows];
    nextRows.sort((left, right) => {
      const conditionLeft = `${left.attributeALevel}||${left.attributeBLevel}||${left.orientationBucket}`;
      const conditionRight = `${right.attributeALevel}||${right.attributeBLevel}||${right.orientationBucket}`;

      return conditionLeft.localeCompare(conditionRight);
    });
    return nextRows;
  }, [conditionRows]);

  const handleCellClick = (modelId: string, row: OrientedConditionRow, options?: { decisionCode?: string }) => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      row: row.attributeALevel,
      col: row.attributeBLevel,
      model: modelId,
    });
    if (analysisMode === 'paired' && companionRunId) {
      params.set('companionRunId', companionRunId);
      params.set('pairView', canSplitOrientations && inspectionMode === 'split' ? 'condition-split' : 'condition-blended');
    }
    if (canSplitOrientations && inspectionMode === 'split') {
      params.set('orientationBucket', row.orientationBucket);
    }
    if (options?.decisionCode) {
      params.set('decisionCode', options.decisionCode);
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
                  onClick={() => setSelectedModels(models)}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-gray-600 hover:text-gray-800"
                  onClick={() => setSelectedModels([])}
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto">
                {models.map((modelId) => (
                  <label key={modelId} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(modelId)}
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
                  Split by order
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {canSplitOrientations && inspectionMode === 'split' && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          Split inspection keeps the pooled paired summary above, but breaks these tables into
          separate <span className="font-medium">{canonicalOrientationLabel}</span> and <span className="font-medium">{flippedOrientationLabel}</span> buckets so you can verify the pair directly.
        </div>
      )}

      <div ref={meanTableRef} className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead>
            {hasGroupedFamilies ? (
              <>
                <tr>
                  <th
                    rowSpan={2}
                    className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600"
                  >
                    {formatDisplayLabel(attributeA)}
                  </th>
                  <th
                    rowSpan={2}
                    className="w-36 border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 whitespace-normal break-words"
                  >
                    {formatDisplayLabel(attributeB)}
                  </th>
                  {groupedModelHeaders.map((group) => (
                    <th
                      key={group.familyKey}
                      colSpan={group.models.length}
                      rowSpan={
                        group.models.length === 1 && group.models[0]?.variantLabel === group.familyLabel
                          ? 2
                          : undefined
                      }
                      className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      {group.familyLabel}
                    </th>
                  ))}
                </tr>
                <tr>
                  {groupedModelHeaders.flatMap((group) =>
                    group.models.length === 1 && group.models[0]?.variantLabel === group.familyLabel
                      ? []
                      : group.models.map((header) => (
                          <th
                            key={header.modelId}
                            className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700 whitespace-pre-line break-words leading-4"
                            title={header.modelId}
                          >
                            {header.variantLabel}
                          </th>
                        ))
                  )}
                </tr>
              </>
            ) : (
              <tr>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                  {formatDisplayLabel(attributeA)}
                </th>
                <th className="w-36 border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 whitespace-normal break-words">
                  {formatDisplayLabel(attributeB)}
                </th>
                {modelHeaders.map((header) => (
                  <th
                    key={header.modelId}
                    className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700 whitespace-pre-line break-words leading-4"
                    title={header.modelId}
                  >
                    {header.variantLabel}
                  </th>
                ))}
              </tr>
            )}
          </thead>
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
                        {getOrientationBucketLabel(row.orientationBucket, orientationLabels)}
                      </span>
                    )}
                  </div>
                </td>
                {visibleModels.map((modelId) => {
                  const stats = getMeanDecision(modelId, row.scenarioIds);
                  const isOtherCell = stats === null;

                  return (
                    <td
                      key={`${row.id}-${modelId}`}
                      className="border border-gray-200 px-3 py-2 text-center text-sm transition-colors"
                      style={{ backgroundColor: stats === null ? undefined : getHeatmapColor(stats.mean) }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                        title={`View transcripts for ${modelId} | ${formatDisplayLabel(attributeA)}: ${formatDisplayLabel(row.attributeALevel)}, ${formatDisplayLabel(attributeB)}: ${formatDisplayLabel(row.attributeBLevel)}${canSplitOrientations && inspectionMode === 'split' ? ` | ${getOrientationBucketLabel(row.orientationBucket, orientationLabels)}` : ''}${isOtherCell ? ' | Decision: other' : ''}`}
                        onClick={() => handleCellClick(modelId, row, isOtherCell ? { decisionCode: 'other' } : undefined)}
                      >
                        {stats === null ? (
                          <span className="text-gray-500">-</span>
                        ) : (
                          <span className={`inline-flex flex-col items-center ${getScoreTextColor(stats.mean)}`}>
                            <span className="font-semibold">{stats.mean.toFixed(2)}</span>
                          </span>
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
      </div>
    </div>
  );
}
