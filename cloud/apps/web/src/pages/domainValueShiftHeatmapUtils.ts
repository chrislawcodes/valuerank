import { formatVnewLabel, isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import {
  type ModelsAnalysisDomainBreakdown,
  type ModelsAnalysisModelResult,
  type ModelsAnalysisValueResult,
} from '../api/operations/modelsAnalysis';
import { VALUE_LABELS, VALUES, type ValueKey } from '../data/domainAnalysisData';

const AVERAGE_PARITY_TOLERANCE = 0.05;
export const DEFAULT_DOMAIN_SHIFT_SIGNATURE = 'vnewtd';
export const ALL_MODELS_OPTION_VALUE = '__all_models__';

export type DomainShiftDisplayMode = 'shift' | 'winRate';
export type DomainShiftSortDirection = 'asc' | 'desc';
export type DomainShiftSortKey = 'value' | 'average' | `domain:${string}`;

export type DomainShiftSort = {
  key: DomainShiftSortKey;
  direction: DomainShiftSortDirection;
};

export const DEFAULT_DOMAIN_SHIFT_SORT: DomainShiftSort = {
  key: 'value',
  direction: 'asc',
};

export type DomainShiftColumn = {
  domainId: string;
  domainName: string;
};

export type DomainShiftCell = {
  domainId: string;
  domainName: string;
  winRate: number;
  averageWinRate: number;
  shift: number;
  evidenceWeight: number | null;
};

export type DomainShiftRow = {
  valueKey: string;
  valueLabel: string;
  pooledWinRate: number | null;
  averageWinRate: number | null;
  averageMatchesPooled: boolean | null;
  comparableDomainCount: number;
  cells: Map<string, DomainShiftCell>;
};

export type DomainShiftHeatmap = {
  columns: DomainShiftColumn[];
  rows: DomainShiftRow[];
  eligibleDomainCount: number;
};

export type DomainShiftSignatureOption = {
  value: string;
  label: string;
};

export type DomainShiftModelOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const NON_DEFAULT_MODELS_DIVIDER_VALUE = '__non-default-models__';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValueKey(value: string): value is ValueKey {
  return (VALUES as string[]).includes(value);
}

function formatValueLabel(valueKey: string): string {
  return isValueKey(valueKey) ? VALUE_LABELS[valueKey] : valueKey;
}

export function formatPointShift(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0.0 pts';
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} pts`;
}

export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}

export function formatEvidenceWeight(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function formatDomainShiftSignatureLabel(signature: string): string {
  if (!isVnewSignature(signature)) return signature;
  try {
    return formatVnewLabel(parseVnewTemperature(signature));
  } catch {
    return signature;
  }
}

export function buildDomainShiftSignatureOptions(signatures: string[]): DomainShiftSignatureOption[] {
  const signatureSet = new Set([DEFAULT_DOMAIN_SHIFT_SIGNATURE, ...signatures]);
  return [...signatureSet].map((signature) => ({
    value: signature,
    label: formatDomainShiftSignatureLabel(signature),
  }));
}

export function getDefaultDomainShiftSignature(signatures: string[], currentSignature: string | null): string {
  const optionValues = new Set(buildDomainShiftSignatureOptions(signatures).map((option) => option.value));
  if (currentSignature != null && optionValues.has(currentSignature)) return currentSignature;
  return DEFAULT_DOMAIN_SHIFT_SIGNATURE;
}

function sortModels(models: ModelsAnalysisModelResult[]): ModelsAnalysisModelResult[] {
  return [...models].sort((left, right) => left.label.localeCompare(right.label));
}

export function buildDomainShiftModelOptions(
  models: ModelsAnalysisModelResult[],
  defaultModelIds: ReadonlySet<string>,
): DomainShiftModelOption[] {
  const sorted = sortModels(models);
  const defaults = sorted.filter((model) => defaultModelIds.has(model.modelId));
  const nonDefaults = sorted.filter((model) => !defaultModelIds.has(model.modelId));
  return [
    { value: ALL_MODELS_OPTION_VALUE, label: 'All models' },
    ...defaults.map((model) => ({ value: model.modelId, label: model.label })),
    ...(defaults.length > 0 && nonDefaults.length > 0
      ? [{ value: NON_DEFAULT_MODELS_DIVIDER_VALUE, label: '---', disabled: true }]
      : []),
    ...nonDefaults.map((model) => ({ value: model.modelId, label: model.label })),
  ];
}

export function getDefaultModelId(
  models: ModelsAnalysisModelResult[],
  currentModelId: string | null,
): string {
  const sorted = sortModels(models);
  const modelIds = new Set(sorted.map((model) => model.modelId));
  if (currentModelId != null && (currentModelId === ALL_MODELS_OPTION_VALUE || modelIds.has(currentModelId))) {
    return currentModelId;
  }
  return ALL_MODELS_OPTION_VALUE;
}

function sortValueKeys(valueKeys: Set<string>): string[] {
  const canonical = VALUES.filter((valueKey) => valueKeys.has(valueKey));
  const unknown = [...valueKeys]
    .filter((valueKey) => !isValueKey(valueKey))
    .sort((left, right) => left.localeCompare(right));
  return [...canonical, ...unknown];
}

function eligibleDomainsForValue(value: ModelsAnalysisValueResult): ModelsAnalysisDomainBreakdown[] {
  return value.domains.filter((domain) => isFiniteNumber(domain.winRate));
}

function computeAverage(domains: ModelsAnalysisDomainBreakdown[]): number | null {
  if (domains.length === 0) return null;
  const total = domains.reduce((sum, domain) => sum + domain.winRate, 0);
  return total / domains.length;
}

function computeAverageNumber(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

type AggregateDomainStats = {
  domainId: string;
  domainName: string;
  winRates: number[];
  evidenceWeights: number[];
};

type AggregateValueStats = {
  pooledWinRates: number[];
  domains: Map<string, AggregateDomainStats>;
};

function buildDomainShiftHeatmapForModel(model: ModelsAnalysisModelResult): DomainShiftHeatmap {
  const valueKeys = new Set<string>(VALUES);

  for (const value of model.values) {
    valueKeys.add(value.valueKey);
  }

  const rowsByValue = new Map(model.values.map((value) => [value.valueKey, value]));
  const domainById = new Map<string, DomainShiftColumn>();
  const rows = sortValueKeys(valueKeys).map((valueKey) => {
    const value = rowsByValue.get(valueKey);
    const eligibleDomains = value == null ? [] : eligibleDomainsForValue(value);
    const comparableDomainCount = eligibleDomains.length;
    const averageWinRate = comparableDomainCount >= 2 ? computeAverage(eligibleDomains) : null;
    const cells = new Map<string, DomainShiftCell>();

    if (value != null && averageWinRate != null) {
      for (const domain of eligibleDomains) {
        domainById.set(domain.domainId, {
          domainId: domain.domainId,
          domainName: domain.domainName,
        });
        cells.set(domain.domainId, {
          domainId: domain.domainId,
          domainName: domain.domainName,
          winRate: domain.winRate,
          averageWinRate,
          shift: domain.winRate - averageWinRate,
          evidenceWeight: isFiniteNumber(domain.evidenceWeight) ? domain.evidenceWeight : null,
        });
      }
    }

    return {
      valueKey,
      valueLabel: formatValueLabel(valueKey),
      pooledWinRate: value?.pooledWinRate ?? null,
      averageWinRate,
      averageMatchesPooled: averageWinRate == null || value?.pooledWinRate == null
        ? null
        : Math.abs(averageWinRate - value.pooledWinRate) <= AVERAGE_PARITY_TOLERANCE,
      comparableDomainCount,
      cells,
    };
  });
  const columns = [...domainById.values()].sort((left, right) => left.domainName.localeCompare(right.domainName));

  return {
    columns,
    rows,
    eligibleDomainCount: columns.length,
  };
}

function buildDomainShiftHeatmapForModels(models: ModelsAnalysisModelResult[]): DomainShiftHeatmap {
  const valueKeys = new Set<string>(VALUES);
  const rowsByValue: Map<string, AggregateValueStats> = new Map();
  const domainById = new Map<string, DomainShiftColumn>();

  for (const model of models) {
    for (const value of model.values) {
      valueKeys.add(value.valueKey);

      const existing: AggregateValueStats = rowsByValue.get(value.valueKey) ?? {
        pooledWinRates: [],
        domains: new Map(),
      };

      if (isFiniteNumber(value.pooledWinRate)) {
        existing.pooledWinRates.push(value.pooledWinRate);
      }

      for (const domain of eligibleDomainsForValue(value)) {
        domainById.set(domain.domainId, {
          domainId: domain.domainId,
          domainName: domain.domainName,
        });
        const aggregate: AggregateDomainStats = existing.domains.get(domain.domainId) ?? {
          domainId: domain.domainId,
          domainName: domain.domainName,
          winRates: [],
          evidenceWeights: [],
        };
        aggregate.winRates.push(domain.winRate);
        if (isFiniteNumber(domain.evidenceWeight)) {
          aggregate.evidenceWeights.push(domain.evidenceWeight);
        }
        existing.domains.set(domain.domainId, aggregate);
      }

      rowsByValue.set(value.valueKey, existing);
    }
  }

  const rows = sortValueKeys(valueKeys).map((valueKey) => {
    const aggregate = rowsByValue.get(valueKey);
    const domainEntries = [...(aggregate?.domains.values() ?? [])];
    const comparableDomainCount = domainEntries.length;
    const domainAverages = domainEntries
      .map((entry) => computeAverageNumber(entry.winRates))
      .filter((value): value is number => value != null);
    const averageWinRate = comparableDomainCount >= 2 ? computeAverageNumber(domainAverages) : null;
    const pooledWinRate = computeAverageNumber(aggregate?.pooledWinRates ?? []);
    const cells = new Map<string, DomainShiftCell>();

    if (valueKeys.has(valueKey) && averageWinRate != null) {
      for (const domain of domainEntries) {
        const winRate = computeAverageNumber(domain.winRates);
        if (winRate == null) continue;

        cells.set(domain.domainId, {
          domainId: domain.domainId,
          domainName: domain.domainName,
          winRate,
          averageWinRate,
          shift: winRate - averageWinRate,
          evidenceWeight: computeAverageNumber(domain.evidenceWeights),
        });
      }
    }

    return {
      valueKey,
      valueLabel: formatValueLabel(valueKey),
      pooledWinRate,
      averageWinRate,
      averageMatchesPooled: averageWinRate == null || pooledWinRate == null
        ? null
        : Math.abs(averageWinRate - pooledWinRate) <= AVERAGE_PARITY_TOLERANCE,
      comparableDomainCount,
      cells,
    };
  });
  const columns = [...domainById.values()].sort((left, right) => left.domainName.localeCompare(right.domainName));

  return {
    columns,
    rows,
    eligibleDomainCount: columns.length,
  };
}

export function buildDomainShiftHeatmap(
  modelOrModels: ModelsAnalysisModelResult | ModelsAnalysisModelResult[] | null,
): DomainShiftHeatmap {
  if (modelOrModels == null) {
    return { columns: [], rows: [], eligibleDomainCount: 0 };
  }
  return Array.isArray(modelOrModels)
    ? buildDomainShiftHeatmapForModels(modelOrModels)
    : buildDomainShiftHeatmapForModel(modelOrModels);
}

export function getNextDomainShiftSort(current: DomainShiftSort, key: DomainShiftSortKey): DomainShiftSort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    key,
    direction: key === 'value' ? 'asc' : 'desc',
  };
}

function getSortValue(row: DomainShiftRow, sortKey: DomainShiftSortKey, displayMode: DomainShiftDisplayMode): string | number | null {
  if (sortKey === 'value') return row.valueLabel;
  if (sortKey === 'average') return row.averageWinRate;

  const domainId = sortKey.slice('domain:'.length);
  const cell = row.cells.get(domainId);
  if (cell == null) return null;
  return displayMode === 'shift' ? cell.shift : cell.winRate;
}

export function sortHeatmapRows(
  rows: DomainShiftRow[],
  sort: DomainShiftSort,
  displayMode: DomainShiftDisplayMode,
): DomainShiftRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = getSortValue(left.row, sort.key, displayMode);
      const rightValue = getSortValue(right.row, sort.key, displayMode);

      if (leftValue == null && rightValue == null) return left.index - right.index;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      const direction = sort.direction === 'asc' ? 1 : -1;
      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        const labelComparison = leftValue.localeCompare(rightValue);
        return labelComparison === 0 ? left.index - right.index : labelComparison * direction;
      }

      const numericComparison = Number(leftValue) - Number(rightValue);
      return numericComparison === 0 ? left.index - right.index : numericComparison * direction;
    })
    .map(({ row }) => row);
}
