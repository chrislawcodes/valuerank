/**
 * GraphQL operations for cross-run comparison
 */

import { gql } from 'urql';
import { ANALYSIS_RESULT_FRAGMENT, type AnalysisResult } from './analysis';

// ============================================================================
// TYPES
// ============================================================================

export type ComparisonRunDefinition = {
  id: string;
  name: string;
  preamble: string;
  template: string;
  parentId: string | null;
  tags: {
    id: string;
    name: string;
  }[];
};

export type ComparisonRun = {
  id: string;
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

export const COMPARISON_RUN_FRAGMENT = gql`
  fragment ComparisonRunFields on Run {
    id
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
      preamble
      template
      parentId
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
 */
export const RUNS_WITH_ANALYSIS_QUERY = gql`
  query RunsWithAnalysis($ids: [ID!]!) {
    runsWithAnalysis(ids: $ids) {
      ...ComparisonRunFields
      analysis {
        ...AnalysisResultFields
      }
    }
  }
  ${COMPARISON_RUN_FRAGMENT}
  ${ANALYSIS_RESULT_FRAGMENT}
`;

/**
 * Query to fetch runs available for comparison (with analysis).
 * Uses existing runs query with hasAnalysis filter.
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
      ...ComparisonRunFields
    }
  }
  ${COMPARISON_RUN_FRAGMENT}
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
