import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import {
  VALUES,
  VALUE_LABELS,
  VALUE_DESCRIPTIONS,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';
import { type RankingShape, type TopStructureLabel, type BottomStructureLabel } from '../../api/operations/domainAnalysis';

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

function getTopStructureChipStyle(label: TopStructureLabel): string {
  switch (label) {
    case 'strong_leader': return 'bg-teal-100 text-teal-800';
    case 'tied_leaders': return 'bg-sky-100 text-sky-800';
    case 'even_spread': return 'bg-gray-100 text-gray-600';
  }
}

function getTopStructureLabel(label: TopStructureLabel): string {
  switch (label) {
    case 'strong_leader': return 'Strong leader';
    case 'tied_leaders': return 'Tied leaders';
    case 'even_spread': return 'Even spread';
  }
}

function getBottomStructureChipStyle(label: BottomStructureLabel): string {
  switch (label) {
    case 'hard_no': return 'bg-rose-100 text-rose-800';
    case 'mild_avoidance': return 'bg-amber-100 text-amber-800';
    case 'no_hard_no': return 'bg-green-100 text-green-700';
  }
}

function getBottomStructureLabel(label: BottomStructureLabel): string {
  switch (label) {
    case 'hard_no': return 'Hard no';
    case 'mild_avoidance': return 'Mild avoidance';
    case 'no_hard_no': return 'No hard no';
  }
}

const TOP_STRUCTURE_DESCRIPTIONS: Record<TopStructureLabel, string> = {
  strong_leader: 'One value stands clearly apart from the rest',
  tied_leaders: 'A small group of values leads together',
  even_spread: 'No single value dominates — preferences are broadly distributed',
};

const BOTTOM_STRUCTURE_DESCRIPTIONS: Record<BottomStructureLabel, string> = {
  hard_no: 'One or more values strongly rejected (score < −1.0)',
  mild_avoidance: 'Some values are moderately disfavored but nothing extreme',
  no_hard_no: 'All values score above −0.5 — nothing is strongly rejected',
};

function getTopBottomValues(model: ModelEntry): { top: ValueKey[]; bottom: ValueKey[] } {
  const sorted = [...VALUES].sort((a, b) => model.values[b] - model.values[a]);
  return {
    top: sorted.slice(0, 3),
    bottom: sorted.slice(-3),
  };
}

type ValuePrioritiesSectionProps = {
  models: ModelEntry[];
  selectedDomainId: string;
  selectedSignature: string | null;
  rankingShapes: Map<string, RankingShape>;
};

export function ValuePrioritiesSection({
  models,
  selectedDomainId,
  selectedSignature,
  rankingShapes,
}: ValuePrioritiesSectionProps) {
  const navigate = useNavigate();
  const detailedTableRef = useRef<HTMLDivElement>(null);
  const summaryTableRef = useRef<HTMLDivElement>(null);
  const [sortState, setSortState] = useState<SortState>({ key: 'model', direction: 'asc' });

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
          <h2 className="text-base font-medium text-gray-900">1. Value Priorities by AI</h2>
          <p className="text-sm text-gray-600">Which values each model favors most and least.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">Click a column heading to sort.</p>
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">Scoring: Full BT</span>
        </div>
      </div>

      <div ref={detailedTableRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-gray-600">Detailed BT scores by value.</p>
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
                  title={VALUE_DESCRIPTIONS[value]}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900 ${
                      value === HEDONISM_SPLIT_VALUE ? 'block w-full' : ''
                    }`}
                    onClick={() => updateSort(value)}
                    title={VALUE_DESCRIPTIONS[value]}
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
              const shape = rankingShapes.get(model.model);
              return (
                <tr key={model.model} className="border-b border-gray-100">
                  <td className="border-r-2 border-gray-300 px-2 py-2">
                    <div className="font-medium text-gray-900">{model.label}</div>
                    {shape != null && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${getTopStructureChipStyle(shape.topStructure)}`}
                          title={TOP_STRUCTURE_DESCRIPTIONS[shape.topStructure]}
                        >
                          {getTopStructureLabel(shape.topStructure)}
                        </span>
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${getBottomStructureChipStyle(shape.bottomStructure)}`}
                          title={BOTTOM_STRUCTURE_DESCRIPTIONS[shape.bottomStructure]}
                        >
                          {getBottomStructureLabel(shape.bottomStructure)}
                        </span>
                      </div>
                    )}
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
                        title={`View score calculation and vignette condition details for ${model.label} · ${VALUE_LABELS[value]}`}
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
        <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-gray-400">Top structure</span>
            {(['strong_leader', 'tied_leaders', 'even_spread'] as const).map((label) => (
              <span key={label} className="flex items-center gap-1.5 text-xs">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${getTopStructureChipStyle(label)}`}>{getTopStructureLabel(label)}</span>
                <span className="text-gray-500">{TOP_STRUCTURE_DESCRIPTIONS[label]}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-gray-400">Bottom structure</span>
            {(['hard_no', 'mild_avoidance', 'no_hard_no'] as const).map((label) => (
              <span key={label} className="flex items-center gap-1.5 text-xs">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${getBottomStructureChipStyle(label)}`}>{getBottomStructureLabel(label)}</span>
                <span className="text-gray-500">{BOTTOM_STRUCTURE_DESCRIPTIONS[label]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div ref={summaryTableRef} className="mt-3 rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-gray-600">Top 3 and Bottom 3 values by model.</p>
          <CopyVisualButton targetRef={summaryTableRef} label="top and bottom values table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-2 text-left font-medium">Model</th>
                <th className="px-2 py-2 text-left font-medium">Top 3</th>
                <th className="px-2 py-2 text-left font-medium">Bottom 3</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((model) => {
                const summary = getTopBottomValues(model);
                return (
                  <tr key={`${model.model}-summary`} className="border-b border-gray-100">
                    <td className="px-2 py-2 font-medium text-gray-900">{model.label}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {summary.top.map((value) => (
                          <span key={`${model.model}-${value}-top`} className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] text-teal-800">
                            {VALUE_LABELS[value]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {summary.bottom.map((value) => (
                          <span key={`${model.model}-${value}-bottom`} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800">
                            {VALUE_LABELS[value]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
