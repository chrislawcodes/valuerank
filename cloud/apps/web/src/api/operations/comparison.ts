/**
 * GraphQL operations for cross-run comparison
 */

import { gql } from 'urql';
import { ANALYSIS_RESULT_FRAGMENT, type AnalysisResult } from './analysis';

// ============================================================================
// TYPES
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

/**
 * Lightweight fragment for runs list (no preamble/template).
 * Used by COMPARISON_RUNS_LIST_QUERY.
 */
export const COMPARISON_RUN_LIST_FRAGMENT = gql`
  fragment ComparisonRunListFields on Run {
    id
    name
    definitionId
    status
    config
    progress
    startedAt
    completedAt
    createdAt
    transcriptCount
    analysisStatus
    definition {
      id
      name
      tags {
        id
        name
      }
    }
  }
`;

/**
 * Full fragment for selected runs with definition content.
 * Used by RUNS_WITH_ANALYSIS_QUERY via runsWithAnalysis resolver.
 * Note: preamble/template are inside resolvedContent JSON, not separate fields.
 */
export const COMPARISON_RUN_FULL_FRAGMENT = gql`
  fragment ComparisonRunFullFields on Run {
    id
    name
    definitionId
    status
    config
    progress
    startedAt
    completedAt
    createdAt
    transcriptCount
    analysisStatus
    definition {
      id
      name
      parentId
      resolvedContent
      tags {
        id
        name
      }
    }
  }
`;

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Query to fetch multiple runs with their full analysis data for comparison.
 * Limited to 10 runs maximum for performance.
 * Uses full fragment with preamble/template for diff view.
 */
export const RUNS_WITH_ANALYSIS_QUERY = gql`
  query RunsWithAnalysis($ids: [ID!]!) {
    runsWithAnalysis(ids: $ids) {
      ...ComparisonRunFullFields
      analysis {
        ...AnalysisResultFields
      }
    }
  }
  ${COMPARISON_RUN_FULL_FRAGMENT}
  ${ANALYSIS_RESULT_FRAGMENT}
`;

/**
 * Query to fetch runs available for comparison (with analysis).
 * Uses lightweight fragment without preamble/template.
 */
export const COMPARISON_RUNS_LIST_QUERY = gql`
  query ComparisonRunsList(
    $definitionId: String
    $analysisStatus: String
    $limit: Int
    $offset: Int
  ) {
    runs(
      hasAnalysis: true
      definitionId: $definitionId
      analysisStatus: $analysisStatus
      limit: $limit
      offset: $offset
    ) {
      ...ComparisonRunListFields
    }
  }
  ${COMPARISON_RUN_LIST_FRAGMENT}
`;

// ============================================================================
// QUERY TYPES
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
