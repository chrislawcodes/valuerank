import type { AvailableModelsQuery as GeneratedAvailableModelsQuery } from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type AvailableModel = GeneratedAvailableModelsQuery['availableModels'][number];

// ============================================================================
// QUERIES
// ============================================================================

export { AvailableModelsDocument as AVAILABLE_MODELS_QUERY } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type AvailableModelsQueryResult = GeneratedAvailableModelsQuery;
