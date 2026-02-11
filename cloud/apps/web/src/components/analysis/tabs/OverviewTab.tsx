/**
 * Overview Tab
 *
 * Displays per-model statistics with overall stats and top values.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats } from './types';
import { formatPercent } from './types';
import type { VisualizationData } from '../../../api/operations/analysis';
import { Button } from '../../ui/Button';

type OverviewTabProps = {
  runId: string;
  perModel: Record<string, PerModelStats>;
  visualizationData: VisualizationData | null | undefined;
  dimensionLabels?: Record<string, string>;
};

/**
 * Model stats row component.
 */
function ModelStatsRow({ modelId, stats }: { modelId: string; stats: PerModelStats }) {
  // Get top 3 values by win rate
  const sortedValues = Object.entries(stats.values)
    .sort(([, a], [, b]) => b.winRate - a.winRate)
    .slice(0, 3);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900 truncate" title={modelId}>
          {modelId}
        </h4>
        <span className="text-sm text-gray-500">Transcripts: {stats.sampleSize}</span>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-sm">
        <div>
          <span className="text-gray-500">Mean:</span>
          <span className="ml-1 font-medium">{stats.overall.mean.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">StdDev:</span>
          <span className="ml-1 font-medium">{stats.overall.stdDev.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Min:</span>
          <span className="ml-1 font-medium">{stats.overall.min.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Max:</span>
          <span className="ml-1 font-medium">{stats.overall.max.toFixed(2)}</span>
        </div>
      </div>

      {/* Top values */}
      {sortedValues.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">Top Values by Win Rate</p>
          <div className="flex flex-wrap gap-2">
            {sortedValues.map(([valueId, valueStats]) => (
              <span
                key={valueId}
                className="inline-flex items-center px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-xs"
                title={`${formatPercent(valueStats.winRate)} (${valueStats.count.prioritized}/${valueStats.count.prioritized + valueStats.count.deprioritized})`}
              >
                {valueId}: {formatPercent(valueStats.winRate)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ConditionRow = {
  id: string;
  attributeALevel: string;
  attributeBLevel: string;
  scenarioIds: string[];
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

function extractAttributeName(label: string): string {
  const prefixes = [
    'Strongly Support ',
    'Somewhat Support ',
    'Strongly Oppose ',
    'Somewhat Oppose ',
  ];
  for (const prefix of prefixes) {
    if (label.startsWith(prefix)) return label.slice(prefix.length).trim();
  }
  return label.trim();
}

function getDecisionSideNames(dimensionLabels?: Record<string, string>): { aName: string; bName: string } {
  const aName = dimensionLabels?.['1'] ? extractAttributeName(dimensionLabels['1']) : 'Attribute A';
  const bName = dimensionLabels?.['5'] ? extractAttributeName(dimensionLabels['5']) : 'Attribute B';
  return { aName, bName };
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

  const [attributeA, setAttributeA] = useState<string>(availableAttributes[0] ?? '');
  const [attributeB, setAttributeB] = useState<string>(availableAttributes[1] ?? availableAttributes[0] ?? '');
  const [selectedModels, setSelectedModels] = useState<string[]>(models);

  useEffect(() => {
    const nextA = availableAttributes[0] ?? '';
    const nextB = availableAttributes[1] ?? availableAttributes[0] ?? '';

    if (!availableAttributes.includes(attributeA)) {
      setAttributeA(nextA);
    }
    if (!availableAttributes.includes(attributeB)) {
      setAttributeB(nextB);
    }
  }, [availableAttributes, attributeA, attributeB]);

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

  const getMeanDecision = (modelId: string, scenarioIds: string[]): number | null => {
    const byScenario = modelScenarioMatrix?.[modelId];
    if (!byScenario) return null;

    let sum = 0;
    let count = 0;
    scenarioIds.forEach((scenarioId) => {
      const score = byScenario[scenarioId];
      if (typeof score === 'number' && Number.isFinite(score)) {
        sum += score;
        count += 1;
      }
    });

    return count > 0 ? sum / count : null;
  };

  const sideNames = useMemo(() => getDecisionSideNames(dimensionLabels), [dimensionLabels]);

  const countsByModel = useMemo(() => {
    const result: Record<string, { a: number; neutral: number; b: number; total: number }> = {};
    if (!modelScenarioMatrix) return result;
    if (conditionRows.length === 0) return result;

    visibleModels.forEach((modelId) => {
      let a = 0;
      let neutral = 0;
      let b = 0;
      let total = 0;

      conditionRows.forEach((row) => {
        const mean = getMeanDecision(modelId, row.scenarioIds);
        if (mean === null) return;
        const rounded = Math.round(mean);
        if (rounded < 1 || rounded > 5) return;

        total += 1;
        if (rounded <= 2) a += 1;
        else if (rounded === 3) neutral += 1;
        else b += 1;
      });

      result[modelId] = { a, neutral, b, total };
    });

    return result;
  }, [visibleModels, conditionRows, modelScenarioMatrix]);

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
          <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Attribute A</label>
          <select
            value={attributeA}
            onChange={(event) => setAttributeA(event.target.value)}
            className="block w-52 rounded-md border-gray-300 text-sm shadow-sm focus:border-teal-500 focus:ring-teal-500"
          >
            {availableAttributes.map((attribute) => (
              <option key={attribute} value={attribute}>
                {attribute}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Attribute B</label>
          <select
            value={attributeB}
            onChange={(event) => setAttributeB(event.target.value)}
            className="block w-52 rounded-md border-gray-300 text-sm shadow-sm focus:border-teal-500 focus:ring-teal-500"
          >
            {availableAttributes.map((attribute) => (
              <option key={attribute} value={attribute}>
                {attribute}
              </option>
            ))}
          </select>
        </div>
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

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                AI
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                {sideNames.aName}
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                Neutral
              </th>
              <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                {sideNames.bName}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleModels.map((modelId) => {
              const counts = countsByModel[modelId] ?? { a: 0, neutral: 0, b: 0, total: 0 };
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
                    {counts.a}
                  </td>
                  <td
                    className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 ${highlightNeutral ? 'bg-gray-100' : ''}`}
                  >
                    {counts.neutral}
                  </td>
                  <td
                    className={`border border-gray-200 px-3 py-2 text-center text-sm font-medium text-orange-700 ${highlightB ? 'bg-orange-50' : ''}`}
                  >
                    {counts.b}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleModels.length === 0 && (
          <div className="mt-2 text-xs text-amber-700">Select at least one AI column to display data.</div>
        )}
        <div className="mt-2 text-xs text-gray-500">
          Counts are per condition cell, based on each cell&apos;s mean decision rounded to the nearest 1-5.
        </div>
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
                  const mean = getMeanDecision(modelId, row.scenarioIds);
                  const isOtherCell = mean === null;
                  return (
                    <td
                      key={`${row.id}-${modelId}`}
                      className="border border-gray-200 px-3 py-2 text-center text-sm transition-colors"
                      style={{ backgroundColor: mean === null ? undefined : getHeatmapColor(mean) }}
                    >
                      <button
                        type="button"
                        className="w-full h-full rounded-sm hover:ring-1 hover:ring-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        title={`View transcripts for ${modelId} | ${attributeA}: ${row.attributeALevel}, ${attributeB}: ${row.attributeBLevel}${isOtherCell ? ' | Decision: other' : ''}`}
                        onClick={() => handleCellClick(modelId, row, isOtherCell ? { decisionCode: 'other' } : undefined)}
                      >
                        {mean === null ? (
                          <span className="text-gray-500">-</span>
                        ) : (
                          <span className={`font-semibold ${getScoreTextColor(mean)}`}>{mean.toFixed(2)}</span>
                        )}
                      </button>
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

export function OverviewTab({ runId, perModel, visualizationData, dimensionLabels }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Condition x AI Mean Decision</h3>
        <p className="text-xs text-gray-500">
          Rows are condition combinations (attribute A level + attribute B level). Columns are target AIs.
          Each cell shows the mean decision score.
        </p>
        <ConditionDecisionMatrix
          runId={runId}
          perModel={perModel}
          visualizationData={visualizationData}
          dimensionLabels={dimensionLabels}
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Per-Model Statistics</h3>
        {Object.entries(perModel).map(([modelId, stats]) => (
          <ModelStatsRow key={modelId} modelId={modelId} stats={stats} />
        ))}
      </div>
    </div>
  );
}
