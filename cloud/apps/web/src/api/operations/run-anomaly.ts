import type {
  OpenRunAnomaliesQuery as GeneratedOpenRunAnomaliesQuery,
  OpenRunAnomaliesQueryVariables as GeneratedOpenRunAnomaliesQueryVariables,
  ReprobeAnomalySlotMutation as GeneratedReprobeAnomalySlotMutation,
  ReprobeAnomalySlotMutationVariables as GeneratedReprobeAnomalySlotMutationVariables,
  ResolveRunAnomalyMutation as GeneratedResolveRunAnomalyMutation,
  ResolveRunAnomalyMutationVariables as GeneratedResolveRunAnomalyMutationVariables,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type { RunAnomalyType } from '../../generated/graphql';

export type OpenRunAnomaly = GeneratedOpenRunAnomaliesQuery['openRunAnomalies'][number];

// ============================================================================
// QUERIES
// ============================================================================

export { OpenRunAnomaliesDocument as OPEN_RUN_ANOMALIES_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { ReprobeAnomalySlotDocument as REPROBE_ANOMALY_SLOT_MUTATION } from '../../generated/graphql';
export { ResolveRunAnomalyDocument as RESOLVE_RUN_ANOMALY_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT / VARIABLE TYPES
// ============================================================================

export type OpenRunAnomaliesQueryResult = GeneratedOpenRunAnomaliesQuery;
export type OpenRunAnomaliesQueryVariables = GeneratedOpenRunAnomaliesQueryVariables;

export type ReprobeAnomalySlotMutationResult = GeneratedReprobeAnomalySlotMutation;
export type ReprobeAnomalySlotMutationVariables = GeneratedReprobeAnomalySlotMutationVariables;

export type ResolveRunAnomalyMutationResult = GeneratedResolveRunAnomalyMutation;
export type ResolveRunAnomalyMutationVariables = GeneratedResolveRunAnomalyMutationVariables;
