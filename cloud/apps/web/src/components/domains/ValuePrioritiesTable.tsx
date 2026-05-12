import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type ModelEntry,
  type ValueKey,
  VALUE_DESCRIPTIONS,
  VALUE_LABELS,
} from '../../data/domainAnalysisData';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Tooltip } from '../ui/Tooltip';
import { StabilityDots } from '../models/StabilityDotsView';
import { getPriorityColor } from './domainAnalysisColors';
import {
  formatMetricValue,
  formatTrialCount,
  getMetricValue,
  type DisplayMetric,
} from './valuePrioritiesMetric';

type SortState = {
  key: 'model' | ValueKey;
  direction: 'asc' | 'desc';
};

const COLUMN_VALUES: ValueKey[] = [
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Tradition',
  'Conformity_Interpersonal',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Hedonism',
  'Stimulation',
  'Self_Direction_Action',
];

const TOP_COLUMN_GROUPS: Array<{ label: string; values: ValueKey[] }> = [
  { label: 'Self-Transcendence', values: ['Universalism_Nature', 'Benevolence_Dependability'] },
  { label: 'Conservation', values: ['Tradition', 'Conformity_Interpersonal', 'Security_Personal'] },
  { label: 'Self-Enhancement', values: ['Power_Dominance', 'Achievement'] },
  { label: 'Openness to Change', values: ['Hedonism', 'Stimulation', 'Self_Direction_Action'] },
];

const HEDONISM_SPLIT_VALUE: ValueKey = 'Hedonism';

type ValuePrioritiesTableProps = {
  models: ModelEntry[];
  selectedDomainId: string;
  selectedSignature: string | null;
  isReadOnly?: boolean;
  showStabilityDots?: boolean;
  displayMetric: DisplayMetric;
  winRateMode?: 'all' | 'exc-neutral';
};

function hasGroupStartBorder(value: ValueKey): boolean {
  return (
    value === 'Universalism_Nature' ||
    value === 'Tradition' ||
    value === 'Power_Dominance'
  );
}

function hasGroupEndBorder(value: ValueKey): boolean {
  return (
    value === 'Benevolence_Dependability' ||
    value === 'Security_Personal' ||
    value === 'Self_Direction_Action'
  );
}

export function ValuePrioritiesTable({
  models,
  selectedDomainId,
  selectedSignature,
  isReadOnly = false,
  showStabilityDots = false,
  displayMetric,
  winRateMode = 'all',
}: ValuePrioritiesTableProps) {
  const navigate = useNavigate();
  const detailedTableRef = useRef<HTMLDivElement>(null);
  const opennessGroupRef = useRef<HTMLTableCellElement>(null);
  const hedonismCellRef = useRef<HTMLTableCellElement>(null);
  const [sortState, setSortState] = useState<SortState>({ key: 'model', direction: 'asc' });
  const [opennessSplitPercent, setOpennessSplitPercent] = useState(33.3333);

  const ordered = useMemo(() => {
    const nextModels = [...models];
    if (sortState.key === 'model') {
      nextModels.sort((a, b) =>
        sortState.direction === 'asc'
          ? a.label.localeCompare(b.label)
          : b.label.localeCompare(a.label)
      );
    } else {
      const valueKey = sortState.key;
      nextModels.sort((a, b) => {
        const aVal = getMetricValue(a, valueKey, displayMetric, winRateMode) ?? -Infinity;
        const bVal = getMetricValue(b, valueKey, displayMetric, winRateMode) ?? -Infinity;
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
    return nextModels;
  }, [displayMetric, models, sortState, winRateMode]);

  const valueRange = useMemo(() => {
    const values = models
      .flatMap((model) =>
        COLUMN_VALUES.map((value) => getMetricValue(model, value, displayMetric, winRateMode))
      )
      .filter((value): value is number => value != null);

    if (values.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [displayMetric, models, winRateMode]);

  const avgMetricValues = useMemo(() => {
    return Object.fromEntries(
      COLUMN_VALUES.map((value) => {
        const vals = models
          .map((m) => getMetricValue(m, value, displayMetric, winRateMode))
          .filter((v): v is number => v !== null);
        return [value, vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null];
      })
    ) as Record<ValueKey, number | null>;
  }, [displayMetric, models, winRateMode]);

  useLayoutEffect(() => {
    const updateSplitPosition = () => {
      const opennessWidth = opennessGroupRef.current?.getBoundingClientRect().width ?? 0;
      const hedonismCellCenter = hedonismCellRef.current?.getBoundingClientRect().left ?? 0;
      const hedonismCellWidth = hedonismCellRef.current?.getBoundingClientRect().width ?? 0;
      const opennessLeft = opennessGroupRef.current?.getBoundingClientRect().left ?? 0;

      if (opennessWidth > 0 && hedonismCellWidth > 0) {
        setOpennessSplitPercent(
          ((hedonismCellCenter + hedonismCellWidth / 2 - opennessLeft) / opennessWidth) * 100
        );
      }
    };

    updateSplitPosition();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSplitPosition);
      return () => window.removeEventListener('resize', updateSplitPosition);
    }

    const observer = new ResizeObserver(updateSplitPosition);
    if (opennessGroupRef.current) observer.observe(opennessGroupRef.current);
    if (hedonismCellRef.current) observer.observe(hedonismCellRef.current);

    window.addEventListener('resize', updateSplitPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSplitPosition);
    };
  }, [models.length]);

  const handleValueCellClick = (modelId: string, valueKey: ValueKey) => {
    if (isReadOnly || selectedDomainId === '') return;
    const params = new URLSearchParams({
      domainId: selectedDomainId,
      modelId,
      valueKey,
    });
    if (selectedSignature !== null) params.set('signature', selectedSignature);
    navigate(`/models/win-rate/value-detail?${params.toString()}`);
  };

  return (
    <div ref={detailedTableRef} className="rounded border border-gray-100 bg-white p-2">
      <div className="mb-2 flex items-center justify-end">
        <CopyVisualButton targetRef={detailedTableRef} label="value priorities table" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-xs">
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
                  onClick={() =>
                    setSortState((prev) =>
                      prev.key === 'model'
                        ? { key: 'model', direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                        : { key: 'model', direction: 'asc' }
                    )
                  }
                >
                  Model{' '}
                  {sortState.key === 'model' ? (sortState.direction === 'asc' ? '↑' : '↓') : ''}
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
                    ref={isOpennessGroup ? opennessGroupRef : undefined}
                  >
                    {isOpennessGroup && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 border-l-2 border-gray-300"
                        style={{ left: `${opennessSplitPercent}%` }}
                      />
                    )}
                    {group.label}
                  </th>
                );
              })}
              <th
                className="border-l-2 border-gray-300 px-2 py-2 text-right font-medium"
                rowSpan={2}
              >
                Total
              </th>
            </tr>
            <tr className="border-b border-gray-200 text-gray-600">
              {COLUMN_VALUES.map((value) => (
                <th
                  key={value}
                  className={`relative py-2 text-right font-medium ${
                    hasGroupStartBorder(value) ? 'border-l-2 border-gray-300' : ''
                  } ${hasGroupEndBorder(value) ? 'border-r-2 border-gray-300' : ''} ${
                    value === HEDONISM_SPLIT_VALUE ? 'border-x border-dashed border-gray-400' : ''
                  } ${value === HEDONISM_SPLIT_VALUE ? 'px-1' : 'px-2'}`}
                  aria-sort={
                    sortState.key === value
                      ? sortState.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  ref={value === HEDONISM_SPLIT_VALUE ? hedonismCellRef : undefined}
                >
                  <Tooltip content={VALUE_DESCRIPTIONS[value]} delay={25}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900',
                        value === HEDONISM_SPLIT_VALUE && 'inline-flex whitespace-nowrap'
                      )}
                      onClick={() =>
                        setSortState((prev) =>
                          prev.key === value
                            ? { key: value, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                            : { key: value, direction: 'desc' }
                        )
                      }
                    >
                      {value === HEDONISM_SPLIT_VALUE ? (
                        <span className="inline-flex min-h-[32px] flex-col items-center justify-center leading-tight text-xs">
                          <span className="px-1 text-center">Hedonism</span>
                          <span className="whitespace-nowrap px-1 text-center text-[10px]">
                            (50/50 split)
                          </span>
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
            {ordered.map((model) => (
              <tr key={model.model} className="border-b border-gray-100">
                <td className="border-r-2 border-gray-300 px-2 py-2">
                  <div className="font-medium text-gray-900">{model.label}</div>
                </td>
                {COLUMN_VALUES.map((value) => {
                  const cellValue = getMetricValue(model, value, displayMetric, winRateMode);
                  const stabilityScore = model.stabilityScores?.[value] ?? null;
                  const background =
                    cellValue === null
                      ? '#F9FAFB'
                      : getPriorityColor(cellValue, valueRange.min, valueRange.max);

                  return (
                    <td
                      key={value}
                      className={`p-0 text-right text-gray-800 transition-all hover:brightness-105 ${
                        hasGroupStartBorder(value) ? 'border-l-2 border-gray-300' : ''
                      } ${hasGroupEndBorder(value) ? 'border-r-2 border-gray-300' : ''} ${
                        value === HEDONISM_SPLIT_VALUE
                          ? 'border-x border-dashed border-gray-400'
                          : ''
                      }`}
                      style={{ background }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="relative block h-full min-h-[34px] w-full rounded-none border border-transparent px-2 py-2 text-right text-xs text-gray-800 hover:border-sky-300 hover:bg-white/25 hover:underline focus-visible:!ring-1 focus-visible:!ring-sky-400"
                        onClick={() => handleValueCellClick(model.model, value)}
                        disabled={selectedDomainId === '' || isReadOnly}
                        title={
                          isReadOnly
                            ? 'Value drill-down is unavailable in All domains mode'
                            : undefined
                        }
                      >
                        <span className="flex flex-col items-end gap-1">
                          <span>{formatMetricValue(cellValue, displayMetric)}</span>
                          {showStabilityDots && (
                            <StabilityDots
                              score={stabilityScore}
                              className={cellValue === null ? 'text-gray-300' : 'text-gray-700'}
                              title={
                                stabilityScore != null
                                  ? `Stability ${Math.round(stabilityScore)}/100`
                                  : 'Stability unavailable'
                              }
                            />
                          )}
                        </span>
                      </Button>
                    </td>
                  );
                })}
                <td className="border-l-2 border-gray-300 px-2 py-2 text-right text-xs text-gray-800 tabular-nums">
                  {formatTrialCount(model.totalTrials)}
                </td>
              </tr>
            ))}
            {models.length > 1 && (
              <tr className="border-t-2 border-gray-300">
                <td className="border-r-2 border-gray-300 px-2 py-2">
                  <div className="text-xs font-medium italic text-gray-500">Avg</div>
                </td>
                {COLUMN_VALUES.map((value) => {
                  const avg = avgMetricValues[value];
                  const background =
                    avg === null
                      ? '#F9FAFB'
                      : getPriorityColor(avg, valueRange.min, valueRange.max);
                  return (
                    <td
                      key={value}
                      className={`px-2 py-2 text-right text-xs text-gray-700 ${
                        hasGroupStartBorder(value) ? 'border-l-2 border-gray-300' : ''
                      } ${hasGroupEndBorder(value) ? 'border-r-2 border-gray-300' : ''} ${
                        value === HEDONISM_SPLIT_VALUE
                          ? 'border-x border-dashed border-gray-400'
                          : ''
                      }`}
                      style={{ background }}
                    >
                      {formatMetricValue(avg, displayMetric)}
                    </td>
                  );
                })}
                <td className="border-l-2 border-gray-300 px-2 py-2 text-right text-xs text-gray-500">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
