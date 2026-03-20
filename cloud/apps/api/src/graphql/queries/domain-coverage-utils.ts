import { DOMAIN_ANALYSIS_VALUE_KEYS } from './domain.js';

export const COVERAGE_VALUE_KEYS = DOMAIN_ANALYSIS_VALUE_KEYS;
export type CoverageValueKey = (typeof COVERAGE_VALUE_KEYS)[number];

function isCoverageValueKey(value: string): value is CoverageValueKey {
  return (COVERAGE_VALUE_KEYS as readonly string[]).includes(value);
}

export function toPascalCaseKey(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_');
}

/**
 * Extract the two canonical value dimension names from a definition's resolved content JSON.
 * Returns null if the definition does not have exactly two recognized value dimensions.
 */
export function extractValuePair(
  content: unknown
): { valueA: CoverageValueKey; valueB: CoverageValueKey } | null {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return null;
  const dims = (content as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dims) || dims.length !== 2) return null;
  const nameA =
    typeof (dims[0] as { name?: unknown }).name === 'string'
      ? (dims[0] as { name: string }).name
      : null;
  const nameB =
    typeof (dims[1] as { name?: unknown }).name === 'string'
      ? (dims[1] as { name: string }).name
      : null;
  if (nameA == null || nameB == null) return null;
  const normalizedA = toPascalCaseKey(nameA);
  const normalizedB = toPascalCaseKey(nameB);
  if (!isCoverageValueKey(normalizedA) || !isCoverageValueKey(normalizedB)) return null;
  const methodology = (content as { methodology?: unknown }).methodology;
  const presentationOrder = methodology && typeof methodology === 'object' && !Array.isArray(methodology)
    ? (methodology as { presentation_order?: unknown }).presentation_order
    : null;
  if (presentationOrder === 'B_first') {
    return { valueA: normalizedB, valueB: normalizedA };
  }
  return { valueA: normalizedA, valueB: normalizedB };
}

export function selectPrimaryDefinitionCount(
  definitionIds: readonly string[],
  batchCountByDefinitionId: ReadonlyMap<string, number>,
): { primaryDefinitionId: string | null; batchCount: number } {
  if (definitionIds.length === 0) {
    return { primaryDefinitionId: null, batchCount: 0 };
  }

  const primaryDefinitionId = definitionIds.reduce((best, defId) => {
    const bestCount = batchCountByDefinitionId.get(best) ?? 0;
    const thisCount = batchCountByDefinitionId.get(defId) ?? 0;
    return thisCount > bestCount ? defId : best;
  }, definitionIds[0] ?? '');

  return {
    primaryDefinitionId: primaryDefinitionId === '' ? null : primaryDefinitionId,
    batchCount: primaryDefinitionId === '' ? 0 : (batchCountByDefinitionId.get(primaryDefinitionId) ?? 0),
  };
}
