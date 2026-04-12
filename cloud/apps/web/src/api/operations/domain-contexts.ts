import type {
  DomainContextsQuery as GeneratedDomainContextsQuery,
  CreateDomainContextMutation as GeneratedCreateDomainContextMutation,
  UpdateDomainContextMutation as GeneratedUpdateDomainContextMutation,
  DeleteDomainContextMutation as GeneratedDeleteDomainContextMutation,
  DomainContextsQueryVariables as GeneratedDomainContextsQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type DomainContext = GeneratedDomainContextsQuery['domainContexts'][number];

// ============================================================================
// QUERIES
// ============================================================================

export { DomainContextsDocument as DOMAIN_CONTEXTS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateDomainContextDocument as CREATE_DOMAIN_CONTEXT_MUTATION } from '../../generated/graphql';
export { UpdateDomainContextDocument as UPDATE_DOMAIN_CONTEXT_MUTATION } from '../../generated/graphql';
export { DeleteDomainContextDocument as DELETE_DOMAIN_CONTEXT_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type DomainContextsQueryVariables = GeneratedDomainContextsQueryVariables;
export type DomainContextsQueryResult = GeneratedDomainContextsQuery;
export type CreateDomainContextResult = GeneratedCreateDomainContextMutation;
export type UpdateDomainContextResult = GeneratedUpdateDomainContextMutation;
export type DeleteDomainContextResult = GeneratedDeleteDomainContextMutation;
