import type {
  DomainValueCoverageQuery as GeneratedDomainValueCoverageQuery,
  DomainValueCoverageLegacyQuery as GeneratedDomainValueCoverageLegacyQuery,
  DomainValueCoverageQueryVariables as GeneratedDomainValueCoverageQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// QUERIES
// ============================================================================

export { DomainValueCoverageDocument as DOMAIN_VALUE_COVERAGE_QUERY } from '../../generated/graphql';
export { DomainValueCoverageLegacyDocument as DOMAIN_VALUE_COVERAGE_QUERY_LEGACY } from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type CoverageModelCountItem = {
  modelId: string;
  label: string;
  trialCount: number;
};

export type CoverageWeakestConditionItem = {
  conditionLabel: string;
  modelCounts: CoverageModelCountItem[];
  otherConditionsCount: number | null;
};

export type DomainValueCoverageCell = {
  valueA: string;
  valueB: string;
  batchEquivalent: number;
  aFirstBatchEquivalent: number;
  bFirstBatchEquivalent: number;
  aFirstDefinitionName: string | null;
  bFirstDefinitionName: string | null;
  weakestCondition: CoverageWeakestConditionItem | null;
  contributingDefinitionIds: string[];
  definitionId: string | null;
  aggregateRunId: string | null;
};

export type CoverageModelOption = {
  modelId: string;
  label: string;
};

export type DomainValueCoverageResult = {
  domainId: string;
  values: string[];
  cells: DomainValueCoverageCell[];
  availableModels: CoverageModelOption[];
};

// ============================================================================
// RESULT TYPES
// ============================================================================

export type DomainValueCoverageQueryVariables = GeneratedDomainValueCoverageQueryVariables;
export type DomainValueCoverageQueryResult = GeneratedDomainValueCoverageQuery;
export type DomainValueCoverageLegacyQueryResult = GeneratedDomainValueCoverageLegacyQuery;
