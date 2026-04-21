import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Tooltip } from '../ui/Tooltip';
import {
  VALUE_LABELS,
  VALUE_DESCRIPTIONS,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { getPriorityColor } from './domainAnalysisColors';
import { ValuePrioritiesHelpPanel } from './ValuePrioritiesHelpPanel';

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

function hasGroupStartBorder(value: ValueKey): boolean {
  return value === 'Universalism_Nature' || value === 'Conformity_Interpersonal' || value === 'Power_Dominance';
}

function hasGroupEndBorder(value: ValueKey): boolean {
  return value === 'Benevolence_Dependability' || value === 'Security_Personal' || value === 'Self_Direction_Action';
}

type ValuePrioritiesSectionProps = {
  models: ModelEntry[];
  selectedDomainId: string;
  selectedSignature: string | null;
  isReadOnly?: boolean;
};

export function ValuePrioritiesSection({
  models,
  selectedDomainId,
  selectedSignature,
  isReadOnly = false,
}: ValuePrioritiesSectionProps) {
  const navigate = useNavigate();
  const detailedTableRef = useRef<HTMLDivElement>(null);
  const opennessGroupRef = useRef<HTMLTableCellElement>(null);
  const hedonismCellRef = useRef<HTMLTableCellElement>(null);
  const [scoreMode, setScoreMode] = useState<'WIN_RATE' | 'FULL_BT'>('WIN_RATE');
  const [sortState, setSortState] = useState<SortState>({ key: 'model', direction: 'asc' });
  const [showSectionHelp, setShowSectionHelp] = useState(false);
  const [opennessSplitPercent, setOpennessSplitPercent] = useState(33.3333);

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
      nextModels.sort((a, b) => {
        const aVal = scoreMode === 'WIN_RATE' ? (a.winRates?.[key] ?? -Infinity) : a.values[key];
        const bVal = scoreMode === 'WIN_RATE' ? (b.winRates?.[key] ?? -Infinity) : b.values[key];
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
    return nextModels;
  }, [models, sortState, scoreMode]);

  const valueRange = useMemo(() => {
    if (scoreMode === 'WIN_RATE') {
      return { min: 0, max: 100 };
    }
    const all = models.flatMap((model) => COLUMN_VALUES.map((v) => model.values[v]));
    if (all.length === 0) return { min: -1, max: 1 };
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [models, scoreMode]);

  useLayoutEffect(() => {
    const updateSplitPosition = () => {
      const opennessWidth = opennessGroupRef.current?.getBoundingClientRect().width ?? 0;
      const hedonismCellCenter = hedonismCellRef.current?.getBoundingClientRect().left ?? 0;
      const hedonismCellWidth = hedonismCellRef.current?.getBoundingClientRect().width ?? 0;
      const opennessLeft = opennessGroupRef.current?.getBoundingClientRect().left ?? 0;

      if (opennessWidth > 0 && hedonismCellWidth > 0) {
        setOpennessSplitPercent((((hedonismCellCenter + hedonismCellWidth / 2) - opennessLeft) / opennessWidth) * 100);
      }
    };

    updateSplitPosition();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSplitPosition);
      return () => window.removeEventListener('resize', updateSplitPosition);
    }

    const observer = new ResizeObserver(updateSplitPosition);
    if (opennessGroupRef.current) {
      observer.observe(opennessGroupRef.current);
    }
    if (hedonismCellRef.current) {
      observer.observe(hedonismCellRef.current);
    }

    window.addEventListener('resize', updateSplitPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSplitPosition);
    };
  }, [scoreMode, models.length]);

  const handleValueCellClick = (modelId: string, valueKey: ValueKey) => {
    if (isReadOnly || selectedDomainId === '') return;
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

  function getCellValue(model: ModelEntry, valueKey: ValueKey): number | null {
    if (scoreMode === 'FULL_BT') return model.values[valueKey];
    return model.winRates?.[valueKey] ?? null;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-medium text-gray-900">Value Priorities</h2>
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
          {showSectionHelp && <ValuePrioritiesHelpPanel scoreMode={scoreMode} />}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">Click a column heading to sort.</p>
          <div className="flex rounded border border-gray-200 text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setScoreMode('WIN_RATE')}
              className={`h-auto rounded-none px-3 py-1 text-xs ${scoreMode === 'WIN_RATE' ? 'bg-sky-600 text-white hover:bg-sky-600 hover:text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Win Rate
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setScoreMode('FULL_BT')}
              className={`h-auto rounded-none border-l border-gray-200 px-3 py-1 text-xs ${scoreMode === 'FULL_BT' ? 'bg-sky-600 text-white hover:bg-sky-600 hover:text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Full BT
            </Button>
          </div>
        </div>
      </div>

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
                      className={`h-auto min-h-0 !p-0 text-xs font-medium text-gray-600 hover:text-gray-900 ${
                        value === HEDONISM_SPLIT_VALUE ? 'inline-flex whitespace-nowrap' : ''
                      }`}
                      onClick={() => updateSort(value)}
                    >
                      {value === HEDONISM_SPLIT_VALUE ? (
                        <span className="inline-flex min-h-[32px] flex-col items-center justify-center leading-tight text-xs">
                          <span className="px-1 text-center">
                            Hedonism
                          </span>
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
                    const cellValue = getCellValue(model, value);
                    const background = cellValue === null
                      ? '#F9FAFB'
                      : getPriorityColor(cellValue, valueRange.min, valueRange.max);

                    return (
                      <td
                        key={value}
                        className={`p-0 text-right text-gray-800 transition-all hover:brightness-105 ${
                          hasGroupStartBorder(value) ? 'border-l-2 border-gray-300' : ''
                        } ${hasGroupEndBorder(value) ? 'border-r-2 border-gray-300' : ''} ${
                          value === HEDONISM_SPLIT_VALUE ? 'border-x border-dashed border-gray-400' : ''
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
                          title={isReadOnly ? 'Value drill-down is unavailable in All domains mode' : undefined}
                      >
                          <span>
                            {(() => {
                              if (cellValue === null) return 'n/a';
                              if (scoreMode === 'WIN_RATE') return `${cellValue.toFixed(1)}%`;
                              return `${cellValue > 0 ? '+' : ''}${cellValue.toFixed(2)}`;
                            })()}
                          </span>
                        </Button>
                      </td>
                    );
                  })}
                </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

    </section>
  );
}
