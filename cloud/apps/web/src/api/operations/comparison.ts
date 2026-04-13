/**
 * GraphQL operations for cross-run comparison
 */

import type { AnalysisResult } from './analysis';

// Re-export AnalysisResult for backward compat (consumers import from ./comparison)
export type { AnalysisResult } from './analysis';

// ============================================================================
// TYPES (manual — JSON scalar fields need typed shapes)
// ============================================================================

/** Content structure inside resolvedContent JSON */
export type ResolvedContent = {
  preamble?: string;
  template?: string;
  dimensions?: unknown[];
  matching_rules?: string;
};

export type ComparisonRunDefinition = {
  id: string;
  name: string;
  /** Only available from runsWithAnalysis query - contains preamble/template */
  resolvedContent?: ResolvedContent;
  /** Only available from runsWithAnalysis query */
  parentId?: string | null;
  tags: {
    id: string;
    name: string;
  }[];
};

export type ComparisonRun = {
  id: string;
  name: string | null;
  definitionId: string;
  status: string;
  config: {
    models: string[];
    samplePercentage?: number;
  };
  progress: {
    total: number;
    completed: number;
    failed: number;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  transcriptCount: number;
  analysisStatus: string | null;
  definition: ComparisonRunDefinition;
  analysis: AnalysisResult | null;
};

// ============================================================================
// FRAGMENTS
// ============================================================================

export {
  ComparisonRunListFieldsFragmentDoc as COMPARISON_RUN_LIST_FRAGMENT,
  ComparisonRunFullFieldsFragmentDoc as COMPARISON_RUN_FULL_FRAGMENT,
} from '../../generated/graphql';

// ============================================================================
// QUERIES
// ============================================================================

export { RunsWithAnalysisDocument as RUNS_WITH_ANALYSIS_QUERY } from '../../generated/graphql';
export { ComparisonRunsListDocument as COMPARISON_RUNS_LIST_QUERY } from '../../generated/graphql';

// ============================================================================
// QUERY TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type RunsWithAnalysisQueryVariables = {
  ids: string[];
};

export type RunsWithAnalysisQueryResult = {
  runsWithAnalysis: ComparisonRun[];
};

export type ComparisonRunsListQueryVariables = {
  definitionId?: string;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  limit?: number;
  offset?: number;
};

export type ComparisonRunsListQueryResult = {
  runs: ComparisonRun[];
};
