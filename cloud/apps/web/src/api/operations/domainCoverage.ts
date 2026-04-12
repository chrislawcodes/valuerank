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

export type CoverageModelBreakdownItem = {
  modelId: string;
  label: string;
  trialCount: number;
};

export type DomainValueCoverageCell = {
  valueA: string;
  valueB: string;
  batchCount: number;
  pairedBatchCount: number;
  definitionId: string | null;
  definitionName: string | null;
  aggregateRunId: string | null;
  minTrialCount: number | null;
  maxTrialCount: number | null;
  modelBreakdown: CoverageModelBreakdownItem[] | null;
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
