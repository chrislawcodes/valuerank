/**
 * Overview Tab
 *
 * Displays per-model statistics with overall stats and top values.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats } from './types';
import type { VisualizationData } from '../../../api/operations/analysis';
import { Button } from '../../ui/Button';
import { CopyVisualButton } from '../../ui/CopyVisualButton';
import { getDecisionSideNames, mapDecisionSidesToScenarioAttributes } from '../../../utils/decisionLabels';

type OverviewTabProps = {
  runId: string;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  dimensionLabels?: Record<string, string>;
};

type ConditionRow = {
  id: string;
  attributeALevel: string;
  attributeBLevel: string;
  scenarioIds: string[];
};

type ConditionStats = {
  mean: number;
  sem: number | null;
};

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

function ConditionDecisionMatrix({
  runId,
  perModel,
  visualizationData,
  dimensionLabels,
}: {
  runId: string;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  dimensionLabels?: Record<string, string>;
}) {
  const countsTableRef = useRef<HTMLDivElement>(null);
  const meanTableRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  const models = useMemo(() => Object.keys(perModel).sort(), [perModel]);

  const availableAttributes = useMemo(() => {
    if (!scenarioDimensions) return [];
    const firstScenario = Object.values(scenarioDimensions)[0];
    if (!firstScenario) return [];
    return Object.keys(firstScenario).sort();
  }, [scenarioDimensions]);

  const attributeA = availableAttributes[0] ?? '';
  const attributeB = availableAttributes[1] ?? availableAttributes[0] ?? '';
  const [selectedModels, setSelectedModels] = useState<string[]>(models);

  useEffect(() => {
    setSelectedModels((current) => {
      const next = current.filter((modelId) => models.includes(modelId));
      return next.length > 0 ? next : models;
    });
  }, [models]);

  const visibleModels = useMemo(
    () => models.filter((modelId) => selectedModels.includes(modelId)),
    [models, selectedModels]
  );

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => {
      if (current.includes(modelId)) {
        return current.filter((id) => id !== modelId);
      }
      return [...current, modelId];
    });
  };

  const conditionRows = useMemo<ConditionRow[]>(() => {
    if (!scenarioDimensions || !attributeA || !attributeB) return [];

    const grouped = new Map<string, ConditionRow>();
    Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
      const aLevel = String(dimensions[attributeA] ?? 'N/A');
      const bLevel = String(dimensions[attributeB] ?? 'N/A');
      const id = `${aLevel}||${bLevel}`;
      const current = grouped.get(id);
      if (current) {
        current.scenarioIds.push(scenarioId);
        return;
      }
      grouped.set(id, {
        id,
        attributeALevel: aLevel,
        attributeBLevel: bLevel,
        scenarioIds: [scenarioId],
      });
    });

    return [...grouped.values()].sort((left, right) => {
      if (left.attributeALevel === right.attributeALevel) {
        return left.attributeBLevel.localeCompare(right.attributeBLevel);
      }
      return left.attributeALevel.localeCompare(right.attributeALevel);
    });
  }, [scenarioDimensions, attributeA, attributeB]);

  const getMeanDecision = useCallback(
    (modelId: string, scenarioIds: string[]): ConditionStats | null => {
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

      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (values.length < 2) return { mean, sem: 0 };

      const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
      const stdDev = Math.sqrt(variance);
      const sem = stdDev / Math.sqrt(values.length);
      return { mean, sem };
    },
    [modelScenarioMatrix]
  );

  const sideNames = useMemo(() => getDecisionSideNames(dimensionLabels), [dimensionLabels]);
  const sideAttributeMap = useMemo(
    () => mapDecisionSidesToScenarioAttributes(sideNames.aName, sideNames.bName, availableAttributes),
    [availableAttributes, sideNames.aName, sideNames.bName]
  );
  const lowSideAttribute = sideAttributeMap.lowAttribute;
  const highSideAttribute = sideAttributeMap.highAttribute;

  const getSensitivity = useCallback((modelId: string, attribute: string, side: 'low' | 'high'): number | null => {
    if (!scenarioDimensions || !modelScenarioMatrix) return null;
    const byScenario = modelScenarioMatrix[modelId];
    if (!byScenario) return null;

    const pairs: Array<{ x: number; y: number }> = [];
    Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
      const xRaw = dimensions[attribute];
      const yRaw = byScenario[scenarioId];
      const x = typeof xRaw === 'number' ? xRaw : Number.parseFloat(String(xRaw));
      if (!Number.isFinite(x) || typeof yRaw !== 'number' || !Number.isFinite(yRaw)) {
        return;
      }
      pairs.push({ x, y: yRaw });
    });

    if (pairs.length < 2) return null;
    const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
    const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
    let numerator = 0;
    let denominator = 0;
    pairs.forEach(({ x, y }) => {
      const centeredX = x - meanX;
      numerator += centeredX * (y - meanY);
      denominator += centeredX * centeredX;
    });
    if (denominator === 0) return null;
    const rawSlope = numerator / denominator;
    return side === 'low' ? -rawSlope : rawSlope;
  }, [modelScenarioMatrix, scenarioDimensions]);

  const countsByModel = useMemo(() => {
    const result: Record<string, {
      a: number;
      neutral: number;
      b: number;
      total: number;
      aSensitivity: number | null;
      bSensitivity: number | null;
    }> = {};
    if (!modelScenarioMatrix) return result;
    if (conditionRows.length === 0) return result;

    visibleModels.forEach((modelId) => {
      let a = 0;
      let neutral = 0;
      let b = 0;
      let total = 0;

      conditionRows.forEach((row) => {
        const stats = getMeanDecision(modelId, row.scenarioIds);
        if (stats === null) return;
        const rounded = Math.round(stats.mean);
        if (rounded < 1 || rounded > 5) return;

        total += 1;
        if (rounded <= 2) a += 1;
        else if (rounded === 3) neutral += 1;
        else b += 1;
      });

      result[modelId] = {
        a,
        neutral,
        b,
        total,
        aSensitivity: getSensitivity(modelId, lowSideAttribute, 'low'),
        bSensitivity: getSensitivity(modelId, highSideAttribute, 'high'),
      };
    });

    return result;
  }, [
    visibleModels,
    conditionRows,
    modelScenarioMatrix,
    getMeanDecision,
    getSensitivity,
    lowSideAttribute,
    highSideAttribute,
  ]);

  const handleCellClick = (modelId: string, row: ConditionRow, options?: { decisionCode?: string }) => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      row: row.attributeALevel,
      col: row.attributeBLevel,
      model: modelId,
    });
    if (options?.decisionCode) {
      params.set('decisionCode', options.decisionCode);
    }
    const url = `/analysis/${runId}/transcripts?${params.toString()}`;
    navigate(url);
  };

  const handleCountsCellClick = (modelId: string, decisionBucket: 'a' | 'neutral' | 'b') => {
    const params = new URLSearchParams({
      rowDim: attributeA,
      colDim: attributeB,
      model: modelId,
      decisionBucket,
    });
    const url = `/analysis/${runId}/transcripts?${params.toString()}`;
    navigate(url);
  };

  if (!scenarioDimensions || !modelScenarioMatrix) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Condition-level matrix data is unavailable. Recompute analysis to regenerate scenario dimensions.
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
      <div className="flex flex-wrap items-end gap-4">
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
      </div>

      <div ref={countsTableRef} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase text-gray-500">Decision Frequency</h4>
          <CopyVisualButton targetRef={countsTableRef} label="condition bucket counts table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                AI
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                {lowSideAttribute}
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                Neutral
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                {highSideAttribute}
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                {lowSideAttribute} Sensitivity
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                {highSideAttribute} Sensitivity
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleModels.map((modelId) => {
              const counts = countsByModel[modelId] ?? {
                a: 0,
                neutral: 0,
                b: 0,
                total: 0,
                aSensitivity: null,
                bSensitivity: null,
              };
              const maxCount = Math.max(counts.a, counts.neutral, counts.b);
              const highlightA = maxCount > 0 && counts.a === maxCount;
              const highlightNeutral = maxCount > 0 && counts.neutral === maxCount;
              const highlightB = maxCount > 0 && counts.b === maxCount;
              return (
                <tr key={modelId}>
                  <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    <span className="truncate" title={modelId}>
                      {modelId}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">({counts.total})</span>
                  </td>
                  <td
                    className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-blue-700 ${highlightA ? 'bg-blue-50' : ''}`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                      title={`View transcripts for ${modelId} where condition mean rounds to ${lowSideAttribute}`}
                      onClick={() => handleCountsCellClick(modelId, 'a')}
                    >
                      {counts.a}
                    </Button>
                  </td>
                  <td
                    className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 ${highlightNeutral ? 'bg-gray-100' : ''}`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                      title={`View neutral transcripts for ${modelId}`}
                      onClick={() => handleCountsCellClick(modelId, 'neutral')}
                    >
                      {counts.neutral}
                    </Button>
                  </td>
                  <td
                    className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-orange-700 ${highlightB ? 'bg-orange-50' : ''}`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-full min-h-0 w-full rounded-sm bg-transparent px-0 py-0 text-inherit hover:bg-transparent hover:ring-1 hover:ring-teal-300 focus:ring-teal-400 focus:ring-offset-0"
                      title={`View transcripts for ${modelId} where condition mean rounds to ${highSideAttribute}`}
                      onClick={() => handleCountsCellClick(modelId, 'b')}
                    >
                      {counts.b}
                    </Button>
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                    {counts.aSensitivity == null ? '-' : counts.aSensitivity.toFixed(3)}
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-center text-sm text-gray-700">
                    {counts.bSensitivity == null ? '-' : counts.bSensitivity.toFixed(3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
          {visibleModels.length === 0 && (
            <div className="mt-2 text-xs text-amber-700">Select at least one AI column to display data.</div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          Counts are per condition cell, based on each cell&apos;s mean decision rounded to the nearest 1-5.
        </div>
        <div className="text-xs text-gray-500">
          Sensitivity: positive means decisions move toward that attribute&apos;s side; negative means away.
        </div>
      </div>

      <div ref={meanTableRef} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase text-gray-500">Condition Decisions</h4>
          <CopyVisualButton targetRef={meanTableRef} label="condition by AI mean decision table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                Condition
              </th>
              {visibleModels.map((modelId) => (
                <th
                  key={modelId}
                  className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700"
                  title={modelId}
                >
                  {modelId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conditionRows.map((row) => (
              <tr key={row.id}>
                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  {attributeA}: {row.attributeALevel}, {attributeB}: {row.attributeBLevel}
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
                        title={`View transcripts for ${modelId} | ${attributeA}: ${row.attributeALevel}, ${attributeB}: ${row.attributeBLevel}${isOtherCell ? ' | Decision: other' : ''}`}
                        onClick={() => handleCellClick(modelId, row, isOtherCell ? { decisionCode: 'other' } : undefined)}
                      >
                        {stats === null ? (
                          <span className="text-gray-500">-</span>
                        ) : (
                          <span className={`inline-flex flex-col items-center ${getScoreTextColor(stats.mean)}`}>
                            <span className="font-semibold">{stats.mean.toFixed(2)}</span>
                            <span className="text-[10px] text-gray-500">
                              SEM {stats.sem == null ? '-' : stats.sem.toFixed(2)}
                            </span>
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
    </div>
  );
}

export function OverviewTab({ runId, perModel, visualizationData, dimensionLabels }: OverviewTabProps) {
  return (
    <ConditionDecisionMatrix
      runId={runId}
      perModel={perModel}
      visualizationData={visualizationData}
      dimensionLabels={dimensionLabels}
    />
  );
}
