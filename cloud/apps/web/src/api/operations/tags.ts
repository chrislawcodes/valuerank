import type {
  TagsQuery as GeneratedTagsQuery,
  CreateTagMutation as GeneratedCreateTagMutation,
  DeleteTagMutation as GeneratedDeleteTagMutation,
  AddTagToDefinitionMutation as GeneratedAddTagToDefinitionMutation,
  RemoveTagFromDefinitionMutation as GeneratedRemoveTagFromDefinitionMutation,
  CreateAndAssignTagMutation as GeneratedCreateAndAssignTagMutation,
  TagsQueryVariables as GeneratedTagsQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

// Manual type — the base Tag shape used across the app.
// Some queries return tags with only { id, name } (e.g. nested in definitions),
// while the Tags query includes definitionCount. Keep optional to stay compatible.
export type Tag = {
  id: string;
  name: string;
  createdAt?: string;
  definitionCount?: number;
};

// ============================================================================
// QUERIES
// ============================================================================

export { TagsDocument as TAGS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateTagDocument as CREATE_TAG_MUTATION } from '../../generated/graphql';
export { DeleteTagDocument as DELETE_TAG_MUTATION } from '../../generated/graphql';
export { AddTagToDefinitionDocument as ADD_TAG_TO_DEFINITION_MUTATION } from '../../generated/graphql';
export { RemoveTagFromDefinitionDocument as REMOVE_TAG_FROM_DEFINITION_MUTATION } from '../../generated/graphql';
export { CreateAndAssignTagDocument as CREATE_AND_ASSIGN_TAG_MUTATION } from '../../generated/graphql';

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

export type TagsQueryVariables = GeneratedTagsQueryVariables;
export type TagsQueryResult = GeneratedTagsQuery;

// ============================================================================
// MUTATION RESULT TYPES
// ============================================================================

export type CreateTagResult = GeneratedCreateTagMutation;
export type DeleteTagResult = GeneratedDeleteTagMutation;
export type AddTagToDefinitionResult = GeneratedAddTagToDefinitionMutation;
export type RemoveTagFromDefinitionResult = GeneratedRemoveTagFromDefinitionMutation;
export type CreateAndAssignTagResult = GeneratedCreateAndAssignTagMutation;
