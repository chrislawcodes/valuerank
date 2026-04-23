import { formatVnewLabel, isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import {
  type ModelsAnalysisDomainBreakdown,
  type ModelsAnalysisModelResult,
  type ModelsAnalysisValueResult,
} from '../api/operations/modelsAnalysis';
import { VALUE_LABELS, VALUES, type ValueKey } from '../data/domainAnalysisData';

const AVERAGE_PARITY_TOLERANCE = 0.05;
export const DEFAULT_DOMAIN_SHIFT_SIGNATURE = 'vnewtd';

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
  const rounded = Math.round(value);
  if (rounded === 0) return '0 pts';
  return `${rounded > 0 ? '+' : ''}${rounded} pts`;
}

export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)}%`;
}

export function formatEvidenceWeight(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)}`;
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

export function getDefaultModelId(models: ModelsAnalysisModelResult[], currentModelId: string | null): string | null {
  const sorted = [...models].sort((left, right) => left.label.localeCompare(right.label));
  if (currentModelId != null && sorted.some((model) => model.modelId === currentModelId)) {
    return currentModelId;
  }
  return sorted[0]?.modelId ?? null;
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

export function buildDomainShiftHeatmap(model: ModelsAnalysisModelResult | null): DomainShiftHeatmap {
  if (model == null) {
    return { columns: [], rows: [], eligibleDomainCount: 0 };
  }

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
