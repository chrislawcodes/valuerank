import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type Tag = {
  id: string;
  name: string;
  createdAt: string;
  definitionCount?: number;
};

// ============================================================================
// QUERIES
// ============================================================================

// List all tags
export const TAGS_QUERY = gql`
  query Tags($search: String, $limit: Int) {
    tags(search: $search, limit: $limit) {
      id
      name
      createdAt
      definitionCount
    }
  }
`;

// Single tag
export const TAG_QUERY = gql`
  query Tag($id: ID!) {
    tag(id: $id) {
      id
      name
      createdAt
      definitionCount
    }
  }
`;

// ============================================================================
// MUTATIONS
// ============================================================================

// Create a new tag
export const CREATE_TAG_MUTATION = gql`
  mutation CreateTag($name: String!) {
    createTag(name: $name) {
      id
      name
      createdAt
    }
  }
`;

// Delete a tag
export const DELETE_TAG_MUTATION = gql`
  mutation DeleteTag($id: String!) {
    deleteTag(id: $id) {
      success
      affectedDefinitions
    }
  }
`;

// Add tag to definition
export const ADD_TAG_TO_DEFINITION_MUTATION = gql`
  mutation AddTagToDefinition($definitionId: String!, $tagId: String!) {
    addTagToDefinition(definitionId: $definitionId, tagId: $tagId) {
      id
      tags {
        id
        name
      }
    }
  }
`;

// Remove tag from definition
export const REMOVE_TAG_FROM_DEFINITION_MUTATION = gql`
  mutation RemoveTagFromDefinition($definitionId: String!, $tagId: String!) {
    removeTagFromDefinition(definitionId: $definitionId, tagId: $tagId) {
      id
      tags {
        id
        name
      }
    }
  }
`;

// Create and assign tag in one operation
export const CREATE_AND_ASSIGN_TAG_MUTATION = gql`
  mutation CreateAndAssignTag($definitionId: String!, $tagName: String!) {
    createAndAssignTag(definitionId: $definitionId, tagName: $tagName) {
      id
      tags {
        id
        name
      }
    }
  }
`;

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

export type TagsQueryVariables = {
  search?: string;
  limit?: number;
};

export type TagsQueryResult = {
  tags: Tag[];
};

export type TagQueryVariables = {
  id: string;
};

export type TagQueryResult = {
  tag: Tag | null;
};

// ============================================================================
// MUTATION RESULT TYPES
// ============================================================================

export type CreateTagResult = {
  createTag: Tag;
};

export type DeleteTagResult = {
  deleteTag: {
    success: boolean;
    affectedDefinitions: number;
  };
};

export type AddTagToDefinitionResult = {
  addTagToDefinition: {
    id: string;
    tags: Tag[];
  };
};

export type RemoveTagFromDefinitionResult = {
  removeTagFromDefinition: {
    id: string;
    tags: Tag[];
  };
};

export type CreateAndAssignTagResult = {
  createAndAssignTag: {
    id: string;
    tags: Tag[];
  };
};
