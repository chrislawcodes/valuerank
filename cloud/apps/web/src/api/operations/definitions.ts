import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type Tag = {
  id: string;
  name: string;
  createdAt: string;
};

/**
 * Indicates which content fields are locally overridden vs inherited.
 */
export type DefinitionOverrides = {
  preamble: boolean;
  template: boolean;
  dimensions: boolean;
  matchingRules: boolean;
};

/**
 * Expansion job status for a definition.
 */
export type ExpansionJobStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'NONE';

export type ExpansionStatus = {
  status: ExpansionJobStatus;
  jobId: string | null;
  triggeredBy: string | null;
  createdAt: string | null;
  completedAt: string | null;
  error: string | null;
  scenarioCount: number;
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
  scenarioCount?: number;
  tags: Tag[];
  parent?: Definition | null;
  children?: Definition[];
  // Inheritance fields (Phase 12)
  isForked?: boolean;
  resolvedContent?: DefinitionContent;
  localContent?: Partial<DefinitionContent>;
  overrides?: DefinitionOverrides;
  inheritedTags?: Tag[];
  allTags?: Tag[];
  // Expansion status (Phase 9)
  expansionStatus?: ExpansionStatus;
};

/**
 * Stored content - may have undefined fields for v2 (sparse storage).
 */
export type DefinitionContentStored = {
  schema_version: number;
  preamble?: string;
  template?: string;
  dimensions?: Dimension[];
  matching_rules?: string;
};

/**
 * Resolved content - all fields guaranteed present.
 */
export type DefinitionContent = {
  schema_version: number;
  preamble: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
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
      allTags {
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
      scenarioCount
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
      # Inheritance fields (Phase 12)
      isForked
      resolvedContent
      localContent
      overrides {
        preamble
        template
        dimensions
        matchingRules
      }
      inheritedTags {
        id
        name
        createdAt
      }
      allTags {
        id
        name
        createdAt
      }
      # Expansion status (Phase 9)
      expansionStatus {
        status
        jobId
        triggeredBy
        createdAt
        completedAt
        error
        scenarioCount
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

// Fork a definition (uses inheritance by default)
export const FORK_DEFINITION_MUTATION = gql`
  mutation ForkDefinition($input: ForkDefinitionInput!) {
    forkDefinition(input: $input) {
      id
      name
      parentId
      content
      createdAt
      isForked
      resolvedContent
      localContent
      overrides {
        preamble
        template
        dimensions
        matchingRules
      }
    }
  }
`;

// Update specific content fields with inheritance support
export const UPDATE_DEFINITION_CONTENT_MUTATION = gql`
  mutation UpdateDefinitionContent($id: String!, $input: UpdateDefinitionContentInput!) {
    updateDefinitionContent(id: $id, input: $input) {
      id
      name
      content
      updatedAt
      resolvedContent
      localContent
      overrides {
        preamble
        template
        dimensions
        matchingRules
      }
    }
  }
`;

// Delete a definition (soft delete)
export const DELETE_DEFINITION_MUTATION = gql`
  mutation DeleteDefinition($id: String!) {
    deleteDefinition(id: $id) {
      deletedIds
      count
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
  content?: Partial<DefinitionContent>;
  /** If true (default), fork with minimal content (inherit everything) */
  inheritAll?: boolean;
};

export type ForkDefinitionResult = {
  forkDefinition: Definition;
};

export type UpdateDefinitionContentInput = {
  preamble?: string;
  template?: string;
  dimensions?: Dimension[];
  matchingRules?: string;
  /** List of fields to clear override for (inherit from parent) */
  clearOverrides?: ('preamble' | 'template' | 'dimensions' | 'matching_rules')[];
};

export type UpdateDefinitionContentResult = {
  updateDefinitionContent: Definition;
};

export type DeleteDefinitionResult = {
  deleteDefinition: {
    deletedIds: string[];
    count: number;
  };
};

// Regenerate scenarios mutation
export const REGENERATE_SCENARIOS_MUTATION = gql`
  mutation RegenerateScenarios($definitionId: String!) {
    regenerateScenarios(definitionId: $definitionId) {
      definitionId
      jobId
      queued
    }
  }
`;

export type RegenerateScenariosResult = {
  regenerateScenarios: {
    definitionId: string;
    jobId: string | null;
    queued: boolean;
  };
};
