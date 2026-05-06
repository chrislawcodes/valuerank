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
  /** Contains preamble/template from resolvedContent JSON */
  resolvedContent?: ResolvedContent;
  /** Parent definition ID, when present */
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

export { ComparisonRunsListDocument as COMPARISON_RUNS_LIST_QUERY } from '../../generated/graphql';

// ============================================================================
// QUERY TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type ComparisonRunsListQueryVariables = {
  definitionId?: string;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  limit?: number;
  offset?: number;
};

export type ComparisonRunsListQueryResult = {
  runs: ComparisonRun[];
};
