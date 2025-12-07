import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type Tag = {
  id: string;
  name: string;
  createdAt: string;
};

export type Definition = {
  id: string;
  name: string;
  parentId: string | null;
  content: DefinitionContent;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  runCount: number;
  tags: Tag[];
  parent?: Definition | null;
  children?: Definition[];
};

export type DefinitionContent = {
  schema_version: number;
  preamble: string;
  template: string;
  dimensions: Dimension[];
};

export type Dimension = {
  name: string;
  levels: DimensionLevel[];
};

export type DimensionLevel = {
  score: number;
  label: string;
  description?: string;
  options?: string[];
};

// ============================================================================
// QUERIES
// ============================================================================

// List definitions with filtering
export const DEFINITIONS_QUERY = gql`
  query Definitions(
    $rootOnly: Boolean
    $search: String
    $tagIds: [ID!]
    $hasRuns: Boolean
    $limit: Int
    $offset: Int
  ) {
    definitions(
      rootOnly: $rootOnly
      search: $search
      tagIds: $tagIds
      hasRuns: $hasRuns
      limit: $limit
      offset: $offset
    ) {
      id
      name
      parentId
      content
      createdAt
      updatedAt
      lastAccessedAt
      runCount
      tags {
        id
        name
      }
    }
  }
`;

// Single definition with full details
export const DEFINITION_QUERY = gql`
  query Definition($id: ID!) {
    definition(id: $id) {
      id
      name
      parentId
      content
      createdAt
      updatedAt
      lastAccessedAt
      runCount
      tags {
        id
        name
        createdAt
      }
      parent {
        id
        name
      }
      children {
        id
        name
        createdAt
      }
    }
  }
`;

// Get ancestors of a definition
export const DEFINITION_ANCESTORS_QUERY = gql`
  query DefinitionAncestors($id: ID!, $maxDepth: Int) {
    definitionAncestors(id: $id, maxDepth: $maxDepth) {
      id
      name
      parentId
      createdAt
    }
  }
`;

// Get descendants of a definition
export const DEFINITION_DESCENDANTS_QUERY = gql`
  query DefinitionDescendants($id: ID!, $maxDepth: Int) {
    definitionDescendants(id: $id, maxDepth: $maxDepth) {
      id
      name
      parentId
      createdAt
    }
  }
`;

// ============================================================================
// MUTATIONS
// ============================================================================

// Create a new definition
export const CREATE_DEFINITION_MUTATION = gql`
  mutation CreateDefinition($input: CreateDefinitionInput!) {
    createDefinition(input: $input) {
      id
      name
      parentId
      content
      createdAt
      updatedAt
    }
  }
`;

// Update an existing definition
export const UPDATE_DEFINITION_MUTATION = gql`
  mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
    updateDefinition(id: $id, input: $input) {
      id
      name
      content
      updatedAt
    }
  }
`;

// Fork a definition
export const FORK_DEFINITION_MUTATION = gql`
  mutation ForkDefinition($input: ForkDefinitionInput!) {
    forkDefinition(input: $input) {
      id
      name
      parentId
      content
      createdAt
    }
  }
`;

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

export type DefinitionsQueryVariables = {
  rootOnly?: boolean;
  search?: string;
  tagIds?: string[];
  hasRuns?: boolean;
  limit?: number;
  offset?: number;
};

export type DefinitionsQueryResult = {
  definitions: Definition[];
};

export type DefinitionQueryVariables = {
  id: string;
};

export type DefinitionQueryResult = {
  definition: Definition | null;
};

export type DefinitionAncestorsQueryVariables = {
  id: string;
  maxDepth?: number;
};

export type DefinitionAncestorsQueryResult = {
  definitionAncestors: Definition[];
};

export type DefinitionDescendantsQueryVariables = {
  id: string;
  maxDepth?: number;
};

export type DefinitionDescendantsQueryResult = {
  definitionDescendants: Definition[];
};

// ============================================================================
// MUTATION INPUT/RESULT TYPES
// ============================================================================

export type CreateDefinitionInput = {
  name: string;
  content: DefinitionContent;
  parentId?: string;
};

export type CreateDefinitionResult = {
  createDefinition: Definition;
};

export type UpdateDefinitionInput = {
  name?: string;
  content?: DefinitionContent;
};

export type UpdateDefinitionResult = {
  updateDefinition: Definition;
};

export type ForkDefinitionInput = {
  parentId: string;
  name: string;
  content?: DefinitionContent;
};

export type ForkDefinitionResult = {
  forkDefinition: Definition;
};
