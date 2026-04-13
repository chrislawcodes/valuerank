import type {
  CreatePairedVignetteMutation as GeneratedCreatePairedVignetteMutation,
  UpdatePairedVignetteMutation as GeneratedUpdatePairedVignetteMutation,
  CreatePairedVignetteMutationVariables as GeneratedCreatePairedVignetteMutationVariables,
  UpdatePairedVignetteMutationVariables as GeneratedUpdatePairedVignetteMutationVariables,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type PairedVignetteDefinition = { id: string; name: string };

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreatePairedVignetteDocument as CREATE_PAIRED_VIGNETTE_MUTATION } from '../../generated/graphql';
export { UpdatePairedVignetteDocument as UPDATE_PAIRED_VIGNETTE_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type CreatePairedVignetteResult = GeneratedCreatePairedVignetteMutation;
export type CreatePairedVignetteVariables = GeneratedCreatePairedVignetteMutationVariables;
export type UpdatePairedVignetteResult = GeneratedUpdatePairedVignetteMutation;
export type UpdatePairedVignetteVariables = GeneratedUpdatePairedVignetteMutationVariables;
