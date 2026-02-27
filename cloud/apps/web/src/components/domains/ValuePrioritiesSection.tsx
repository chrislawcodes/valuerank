import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Tooltip } from '../ui/Tooltip';
import {
  VALUES,
  VALUE_LABELS,
  VALUE_DESCRIPTIONS,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';
import {
  type ClusterAnalysis,
  type DomainCluster,
} from '../../api/operations/domainAnalysis';

type SortState = {
  key: 'model' | ValueKey;
  direction: 'asc' | 'desc';
};

const COLUMN_VALUES: ValueKey[] = [
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Conformity_Interpersonal',
  'Tradition',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Hedonism',
  'Stimulation',
  'Self_Direction_Action',
];

const TOP_COLUMN_GROUPS: Array<{ label: string; values: ValueKey[] }> = [
  { label: 'Self-Transcendence', values: ['Universalism_Nature', 'Benevolence_Dependability'] },
  { label: 'Conservation', values: ['Conformity_Interpersonal', 'Tradition', 'Security_Personal'] },
  { label: 'Self-Enhancement', values: ['Power_Dominance', 'Achievement'] },
  { label: 'Openness to Change', values: ['Hedonism', 'Stimulation', 'Self_Direction_Action'] },
];
const HEDONISM_SPLIT_VALUE: ValueKey = 'Hedonism';
const MODEL_COLUMN_WIDTH_PX = 260;
const DEFAULT_VALUE_COLUMN_WIDTH_PX = 118;
const HEDONISM_COLUMN_WIDTH_PX = 220;
const OPENNESS_GROUP_WIDTH_PX = HEDONISM_COLUMN_WIDTH_PX + DEFAULT_VALUE_COLUMN_WIDTH_PX * 2;
const HEDONISM_CENTER_IN_OPENNESS_PERCENT = ((HEDONISM_COLUMN_WIDTH_PX / 2) / OPENNESS_GROUP_WIDTH_PX) * 100;
const TABLE_TOTAL_WIDTH_PX =
  MODEL_COLUMN_WIDTH_PX + HEDONISM_COLUMN_WIDTH_PX + DEFAULT_VALUE_COLUMN_WIDTH_PX * (COLUMN_VALUES.length - 1);

function hasGroupStartBorder(value: ValueKey): boolean {
  return value === 'Universalism_Nature' || value === 'Conformity_Interpersonal' || value === 'Power_Dominance';
}

function hasGroupEndBorder(value: ValueKey): boolean {
  return value === 'Benevolence_Dependability' || value === 'Security_Personal' || value === 'Self_Direction_Action';
}

const CLUSTER_COLORS = [
  { border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  { border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-50' },
  { border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
  { border: 'border-rose-500', text: 'text-rose-700', light: 'bg-rose-50' },
] as const;

function getClusterColor(index: number) {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length]!;
}

type ClusterPersonality = {
  title: string;
  tendency: string;
  topValues: string[];
  bottomValues: string[];
};

function getClusterPersonality(cluster: DomainCluster): ClusterPersonality {
  const sortedKeys = Object.entries(cluster.centroid)
    .sort((a, b) => b[1] - a[1])
    .map(([valueKey]) => valueKey);
  const topKeys = sortedKeys.slice(0, 3);
  const bottomKeys = sortedKeys.slice(-3);

  const hasTop = (valueKey: string) => topKeys.includes(valueKey);
  const hasBottom = (valueKey: string) => bottomKeys.includes(valueKey);

  let title = 'Values-Driven Advisors';
  let tendency = 'Recommend paths that align with core priorities over generic prestige paths.';

  if (hasTop('Universalism_Nature') && hasTop('Achievement')) {
    title = 'Ambition-and-Impact';
    tendency = 'Recommend high-upside roles where visible outcomes and momentum matter more than comfort.';
  } else if (hasTop('Self_Direction_Action') && hasTop('Power_Dominance')) {
    title = 'Practical Independence';
    tendency = 'Recommend autonomous roles with decision latitude and execution authority over comfort or conformity.';
  } else if (hasTop('Self_Direction_Action') && hasTop('Tradition') && hasTop('Universalism_Nature')) {
    if (hasBottom('Conformity_Interpersonal') && hasBottom('Power_Dominance')) {
      title = 'Purpose-and-Values';
      tendency = 'Recommend principled work that feels meaningful and socially positive, not status-first ladder climbing.';
    } else if (hasBottom('Achievement') || hasBottom('Hedonism') || hasBottom('Security_Personal')) {
      title = 'Stability-with-Principles';
      tendency = 'Recommend steady, values-aligned paths that preserve long-term fit over short-term rewards.';
    }
  } else if (hasTop('Universalism_Nature') && hasTop('Self_Direction_Action')) {
    title = 'Purpose-and-Values';
    tendency = 'Recommend values-aligned, self-directed paths with strong emphasis on meaning and contribution.';
  }

  return {
    title,
    tendency,
    topValues: topKeys.map((key) => VALUE_LABELS[key as ValueKey] ?? key.replace(/_/g, ' ')),
    bottomValues: bottomKeys.map((key) => VALUE_LABELS[key as ValueKey] ?? key.replace(/_/g, ' ')),
  };
}

type ValuePrioritiesSectionProps = {
  models: ModelEntry[];
  selectedDomainId: string;
  selectedSignature: string | null;
  clusterAnalysis?: ClusterAnalysis;
};

export function ValuePrioritiesSection({
  models,
  selectedDomainId,
  selectedSignature,
  clusterAnalysis,
}: ValuePrioritiesSectionProps) {
  const navigate = useNavigate();
  const detailedTableRef = useRef<HTMLDivElement>(null);
  const summaryTableRef = useRef<HTMLDivElement>(null);
  const [sortState, setSortState] = useState<SortState>({ key: 'model', direction: 'asc' });
  const [showSectionHelp, setShowSectionHelp] = useState(false);
  const [showModelGroupsHelp, setShowModelGroupsHelp] = useState(false);

  const updateSort = (key: 'model' | ValueKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'model' ? 'asc' : 'desc' };
    });
  };

  const ordered = useMemo(() => {
    const nextModels = [...models];
    const key = sortState.key;
    if (key === 'model') {
      nextModels.sort((a, b) =>
        sortState.direction === 'asc' ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label),
      );
    } else {
      nextModels.sort((a, b) =>
        sortState.direction === 'asc' ? a.values[key] - b.values[key] : b.values[key] - a.values[key],
      );
    }
    return nextModels;
  }, [models, sortState]);

  const valueRange = useMemo(() => {
    const all = models.flatMap((model) => COLUMN_VALUES.map((value) => model.values[value]));
    if (all.length === 0) return { min: -1, max: 1 };
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [models]);

  const modelGroupByModel = useMemo(() => {
    const map = new Map<string, string>();
    if (clusterAnalysis == null || clusterAnalysis.skipped) return map;
    for (const cluster of clusterAnalysis.clusters) {
      const personality = getClusterPersonality(cluster);
      for (const member of cluster.members) {
        map.set(member.model, personality.title);
      }
    }
    return map;
  }, [clusterAnalysis]);

  const handleValueCellClick = (modelId: string, valueKey: ValueKey) => {
    if (selectedDomainId === '') return;
    const params = new URLSearchParams({
      domainId: selectedDomainId,
      modelId,
      valueKey,
      scoreMethod: 'FULL_BT',
    });
    if (selectedSignature !== null) {
      params.set('signature', selectedSignature);
    }
    navigate(`/domains/analysis/value-detail?${params.toString()}`);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-medium text-gray-900">1. Value Priorities by AI</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSectionHelp((v) => !v)}
              className="h-8 w-8 text-gray-500 hover:text-gray-700"
              aria-label={showSectionHelp ? 'Hide explanation' : 'Show explanation'}
            >
              {showSectionHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
            </Button>
          </div>
          <p className="text-sm text-gray-600">Which values each model favors most and least.</p>
          {showSectionHelp && (
            <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
              <p className="font-medium text-gray-800">Score Method (Full Bradley-Terry)</p>
              <p className="mt-1">
                We fit a full Bradley-Terry model over pairwise value matchups for this AI. The model estimates
                a latent strength for each value that best explains observed wins and losses.
              </p>
              <p className="mt-2 font-medium text-gray-800">Formula</p>
              <p className="mt-0.5 font-mono text-[11px] text-sky-900">
                Score = logarithm(estimated BT strength for this value)
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4">
                <li>Bradley-Terry score is used for pairwise ranking problems where many items compete head-to-head.</li>
                <li>Better than simple ratios when comparisons form a connected network across values.</li>
                <li>Strengths are estimated jointly, so each value is calibrated against all others.</li>
                <li>Positive values indicate above-average latent strength; negative values indicate below-average.</li>
              </ul>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">Click a column heading to sort.</p>
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">Scoring: Full BT</span>
        </div>
      </div>

      <div ref={detailedTableRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-end">
          <CopyVisualButton targetRef={detailedTableRef} label="value priorities table" />
        </div>
        <div className="overflow-x-auto">
          <table className="table-fixed text-xs" style={{ width: `${TABLE_TOTAL_WIDTH_PX}px` }}>
            <colgroup>
              <col style={{ width: `${MODEL_COLUMN_WIDTH_PX}px` }} />
              {COLUMN_VALUES.map((value) => (
                <col
                  key={`col-${value}`}
                  style={{ width: `${value === HEDONISM_SPLIT_VALUE ? HEDONISM_COLUMN_WIDTH_PX : DEFAULT_VALUE_COLUMN_WIDTH_PX}px` }}
                />
              ))}
            </colgroup>
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th
                className="border-r-2 border-gray-300 px-2 py-2 text-left font-medium"
                rowSpan={2}
                aria-sort={
                  sortState.key === 'model'
                    ? sortState.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900"
                  onClick={() => updateSort('model')}
                >
                  Model {sortState.key === 'model' ? (sortState.direction === 'asc' ? '↑' : '↓') : ''}
                </Button>
              </th>
              {TOP_COLUMN_GROUPS.map((group, groupIndex) => {
                const isOpennessGroup = group.label === 'Openness to Change';
                return (
                <th
                  key={group.label}
                  className={`relative px-2 py-2 text-center align-middle text-[11px] font-semibold uppercase tracking-wide ${
                    groupIndex === 0 || isOpennessGroup ? '' : 'border-l-2 border-gray-300'
                  } ${groupIndex === TOP_COLUMN_GROUPS.length - 1 ? 'border-r-2 border-gray-300' : ''}`}
                  colSpan={group.values.length}
                >
                  {isOpennessGroup && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 border-l-2 border-gray-300"
                      style={{ left: `${HEDONISM_CENTER_IN_OPENNESS_PERCENT}%` }}
                    />
                  )}
                  {group.label}
                </th>
                );
              })}
            </tr>
            <tr className="border-b border-gray-200 text-gray-600">
              {COLUMN_VALUES.map((value) => (
                <th
                  key={value}
                  className={`relative px-2 py-2 text-right font-medium ${
                    hasGroupStartBorder(value) ? 'border-l-2 border-gray-300' : ''
                  } ${hasGroupEndBorder(value) ? 'border-r-2 border-gray-300' : ''} ${
                    value === HEDONISM_SPLIT_VALUE ? 'border-x border-dashed border-gray-400' : ''
                  }`}
                  aria-sort={
                    sortState.key === value
                      ? sortState.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <Tooltip content={VALUE_DESCRIPTIONS[value]} delay={25}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={`h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900 ${
                        value === HEDONISM_SPLIT_VALUE ? 'block w-full' : ''
                      }`}
                      onClick={() => updateSort(value)}
                    >
                      {value === HEDONISM_SPLIT_VALUE ? (
                        <span className="grid min-h-[32px] w-full grid-cols-2 items-center text-xs">
                          <span className="px-1 text-center">Hedonism</span>
                          <span className="whitespace-nowrap px-1 text-center">(50/50 split)</span>
                        </span>
                      ) : (
                        <>{VALUE_LABELS[value]}</>
                      )}{' '}
                      {sortState.key === value ? (sortState.direction === 'asc' ? '↑' : '↓') : ''}
                    </Button>
                  </Tooltip>
                  {value === HEDONISM_SPLIT_VALUE && (
                    <>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 border-l border-gray-200"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 border-r border-gray-200"
                      />
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((model) => {
              const modelGroupName = modelGroupByModel.get(model.model);
              return (
                <tr key={model.model} className="border-b border-gray-100">
                  <td className="border-r-2 border-gray-300 px-2 py-2">
                    <div className="font-medium text-gray-900">{model.label}</div>
                    <div className="mt-0.5 text-[11px] text-gray-600">
                      Model Group: {modelGroupName ?? 'Unassigned'}
                    </div>
                  </td>
                  {COLUMN_VALUES.map((value) => (
                    <td
                      key={value}
                      className={`p-0 text-right text-gray-800 transition-all hover:brightness-105 ${
                        hasGroupStartBorder(value) ? 'border-l-2 border-gray-300' : ''
                      } ${hasGroupEndBorder(value) ? 'border-r-2 border-gray-300' : ''} ${
                        value === HEDONISM_SPLIT_VALUE ? 'border-x border-dashed border-gray-400' : ''
                      }`}
                      style={{ background: getPriorityColor(model.values[value], valueRange.min, valueRange.max) }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="relative block h-full min-h-[34px] w-full rounded-none border border-transparent px-2 py-2 text-right text-xs text-gray-800 hover:border-sky-300 hover:bg-white/25 hover:underline focus-visible:!ring-1 focus-visible:!ring-sky-400"
                        onClick={() => handleValueCellClick(model.model, value)}
                        disabled={selectedDomainId === ''}
                      >
                        {model.values[value] > 0 ? '+' : ''}
                        {model.values[value].toFixed(2)}
                      </Button>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      <div ref={summaryTableRef} className="mt-3 rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-800">Model Groups</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowModelGroupsHelp((v) => !v)}
              className="h-8 w-8 text-gray-500 hover:text-gray-700"
              aria-label={showModelGroupsHelp ? 'Hide model groups explanation' : 'Show model groups explanation'}
            >
              {showModelGroupsHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
            </Button>
          </div>
          <CopyVisualButton targetRef={summaryTableRef} label="model group personalities" />
        </div>
        {showModelGroupsHelp && (
          <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
            Models are grouped by overall similarity in full value profiles. Each card name is a shorthand persona,
            then the lines below show what that group prioritizes and de-prioritizes based on cluster centroid scores.
          </div>
        )}
        {clusterAnalysis == null || clusterAnalysis.skipped ? (
          <p className="text-xs text-gray-500 italic">{clusterAnalysis?.skipReason ?? 'Cluster analysis not available.'}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {clusterAnalysis.clusters.map((cluster, index) => {
              const style = getClusterColor(index);
              const personality = getClusterPersonality(cluster);
              return (
                <div key={cluster.id} className={`min-w-[280px] max-w-[520px] rounded-lg border ${style.border} ${style.light} p-3`}>
                  <p className={`text-sm font-semibold ${style.text}`}>
                    <span className="font-medium">Model Group:</span> {personality.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-700">
                    <span className="font-medium">Members:</span> {cluster.members.map((member) => member.label).join(', ')}
                  </p>
                  <p className="mt-2 text-xs text-gray-700">
                    <span className="font-medium">Prioritizes:</span> {personality.topValues.join(', ')}
                  </p>
                  <p className="mt-1 text-xs text-gray-700">
                    <span className="font-medium">De-prioritizes:</span> {personality.bottomValues.join(', ')}
                  </p>
                  <p className="mt-2 text-xs text-gray-700 italic">
                    <span className="font-medium not-italic">Advising tendency:</span> &ldquo;{personality.tendency}&rdquo;
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
