import { DOMAIN_ANALYSIS_VALUE_KEYS, extractValuePair, toPascalCaseKey, type DomainAnalysisValueKey } from './domain-analysis-values.js';

export const COVERAGE_VALUE_KEYS = DOMAIN_ANALYSIS_VALUE_KEYS;
export type CoverageValueKey = DomainAnalysisValueKey;
export { extractValuePair, toPascalCaseKey };

/**
 * Extract the two canonical value dimension names from a definition's resolved content JSON.
 * Returns null if the definition does not have exactly two recognized value dimensions.
 */
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
