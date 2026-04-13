import type {
  DefinitionCountQuery as GeneratedDefinitionCountQuery,
  DeleteDefinitionMutation as GeneratedDeleteDefinitionMutation,
  RegenerateScenariosMutation as GeneratedRegenerateScenariosMutation,
  CancelScenarioExpansionMutation as GeneratedCancelScenarioExpansionMutation,
  DefinitionsQueryVariables as GeneratedDefinitionsQueryVariables,
  DefinitionQueryVariables as GeneratedDefinitionQueryVariables,
  DefinitionAncestorsQueryVariables as GeneratedDefinitionAncestorsQueryVariables,
  DefinitionDescendantsQueryVariables as GeneratedDefinitionDescendantsQueryVariables,
  DefinitionCountQueryVariables as GeneratedDefinitionCountQueryVariables,
  CreateDefinitionMutationVariables as GeneratedCreateDefinitionMutationVariables,
  UpdateDefinitionMutationVariables as GeneratedUpdateDefinitionMutationVariables,
  ForkDefinitionMutationVariables as GeneratedForkDefinitionMutationVariables,
  UnforkDefinitionMutationVariables as GeneratedUnforkDefinitionMutationVariables,
  DeleteDefinitionMutationVariables as GeneratedDeleteDefinitionMutationVariables,
  RegenerateScenariosMutationVariables as GeneratedRegenerateScenariosMutationVariables,
  CancelScenarioExpansionMutationVariables as GeneratedCancelScenarioExpansionMutationVariables,
  Definition as GeneratedDefinition,
} from '../../generated/graphql';

// ============================================================================
// TYPES — JSON scalar fields require manual types; codegen types them as unknown
// ============================================================================

export type Tag = {
  id: string;
  name: string;
  createdAt: string;
};

export type PreambleVersion = {
  id: string;
  version: string;
  content: string;
  preamble?: {
    name: string;
  };
};

/**
 * Indicates which content fields are locally overridden vs inherited.
 */
export type DefinitionOverrides = {
  preamble?: boolean;
  template: boolean;
  dimensions: boolean;
  matchingRules: boolean;
};

/**
 * Expansion job status for a definition.
 */
export type ExpansionJobStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'NONE';

/**
 * Real-time progress during scenario expansion.
 */
export type ExpansionProgress = {
  phase: string;
  expectedScenarios: number;
  generatedScenarios: number;
  inputTokens: number;
  outputTokens: number;
  message: string;
  updatedAt: string;
};

export type ExpansionStatus = {
  status: ExpansionJobStatus;
  jobId: string | null;
  triggeredBy: string | null;
  createdAt: string | null;
  completedAt: string | null;
  error: string | null;
  scenarioCount: number;
  progress: ExpansionProgress | null;
};

export type DefinitionMethodology = {
  family?: string;
  response_scale?: 'numeric' | 'option_text' | 'value_labels';
  legacy_label?: string;
  canonical_value_order?: string[];
  pair_key?: string;
};

export type DimensionLevel = {
  score: number;
  label: string;
  description?: string;
  options?: string[];
};

export type Dimension = {
  name: string;
  // New format: structured levels with scores
  levels?: DimensionLevel[];
  // Legacy format: simple string array
  values?: string[];
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
  methodology?: DefinitionMethodology;
};

/**
 * Resolved content - all fields guaranteed present.
 */
export type DefinitionContent = {
  schema_version: number;
  preamble?: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
  methodology?: DefinitionMethodology;
};

// Override generated Definition type to replace JSON scalar fields and fix optionality.
export type Definition = Omit<
  GeneratedDefinition,
  'content' | 'resolvedContent' | 'localContent' | 'expansionStatus' | 'preambleVersion' | 'parentId'
> & {
  content: DefinitionContent;
  resolvedContent: DefinitionContent;
  localContent: Partial<DefinitionContent> | null;
  expansionStatus: ExpansionStatus;
  preambleVersion?: PreambleVersion | null;
  parentId: string | null;
};

// ============================================================================
// MUTATION INPUT TYPES
// ============================================================================

export type CreateDefinitionInput = {
  name: string;
  content: DefinitionContent;
  parentId?: string;
  preambleVersionId?: string;
};

export type UpdateDefinitionInput = {
  name?: string;
  content?: DefinitionContent;
  preambleVersionId?: string | null;
};

export type ForkDefinitionInput = {
  parentId: string;
  name: string;
  content?: Partial<DefinitionContent>;
  /** If true (default), fork with minimal content (inherit everything) */
  inheritAll?: boolean;
};

// ============================================================================
// QUERIES
// ============================================================================

export {
  DefinitionsDocument as DEFINITIONS_QUERY,
  DefinitionDocument as DEFINITION_QUERY,
  DefinitionAncestorsDocument as DEFINITION_ANCESTORS_QUERY,
  DefinitionDescendantsDocument as DEFINITION_DESCENDANTS_QUERY,
  DefinitionCountDocument as DEFINITION_COUNT_QUERY,
} from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export {
  CreateDefinitionDocument as CREATE_DEFINITION_MUTATION,
  UpdateDefinitionDocument as UPDATE_DEFINITION_MUTATION,
  ForkDefinitionDocument as FORK_DEFINITION_MUTATION,
  UnforkDefinitionDocument as UNFORK_DEFINITION_MUTATION,
  DeleteDefinitionDocument as DELETE_DEFINITION_MUTATION,
  RegenerateScenariosDocument as REGENERATE_SCENARIOS_MUTATION,
  CancelScenarioExpansionDocument as CANCEL_SCENARIO_EXPANSION_MUTATION,
} from '../../generated/graphql';

// ============================================================================
// QUERY VARIABLE TYPES
// ============================================================================

export type DefinitionsQueryVariables = GeneratedDefinitionsQueryVariables;
export type DefinitionQueryVariables = GeneratedDefinitionQueryVariables;
export type DefinitionAncestorsQueryVariables = GeneratedDefinitionAncestorsQueryVariables;
export type DefinitionDescendantsQueryVariables = GeneratedDefinitionDescendantsQueryVariables;
export type DefinitionCountQueryVariables = GeneratedDefinitionCountQueryVariables;

// ============================================================================
// QUERY RESULT TYPES
// Redefine result types to use our typed Definition instead of generated unknown fields.
// ============================================================================

export type DefinitionsQueryResult = {
  definitions: Definition[];
};

export type DefinitionQueryResult = {
  definition: Definition | null;
};

export type DefinitionAncestorsQueryResult = {
  definitionAncestors: Definition[];
};

export type DefinitionDescendantsQueryResult = {
  definitionDescendants: Definition[];
};

export type DefinitionCountQueryResult = GeneratedDefinitionCountQuery;

// ============================================================================
// MUTATION VARIABLE TYPES
// ============================================================================

export type CreateDefinitionMutationVariables = GeneratedCreateDefinitionMutationVariables;
export type UpdateDefinitionMutationVariables = GeneratedUpdateDefinitionMutationVariables;
export type ForkDefinitionMutationVariables = GeneratedForkDefinitionMutationVariables;
export type UnforkDefinitionMutationVariables = GeneratedUnforkDefinitionMutationVariables;
export type DeleteDefinitionMutationVariables = GeneratedDeleteDefinitionMutationVariables;
export type RegenerateScenariosMutationVariables = GeneratedRegenerateScenariosMutationVariables;
export type CancelScenarioExpansionMutationVariables =
  GeneratedCancelScenarioExpansionMutationVariables;

// ============================================================================
// MUTATION RESULT TYPES
// Redefine result types to use our typed Definition instead of generated unknown fields.
// ============================================================================

export type CreateDefinitionResult = {
  createDefinition: Definition;
};

export type UpdateDefinitionResult = {
  updateDefinition: Definition;
};

export type ForkDefinitionResult = {
  forkDefinition: Definition;
};

export type UnforkDefinitionResult = {
  unforkDefinition: Definition;
};

export type DeleteDefinitionResult = GeneratedDeleteDefinitionMutation;

export type RegenerateScenariosResult = GeneratedRegenerateScenariosMutation;

export type CancelScenarioExpansionResult = GeneratedCancelScenarioExpansionMutation;
