// ============================================================================
// TYPES (manual — content is a JSON scalar)
// ============================================================================

export type ScenarioContent = {
  preamble?: string;
  prompt: string;
  followups?: Array<{ label: string; prompt: string }>;
  dimensions?: Record<string, string>;
};

export type Scenario = {
  id: string;
  definitionId: string;
  name: string;
  content: ScenarioContent;
  createdAt: string;
};

export type RunConditionGridCell = {
  rowLevel: string;
  colLevel: string;
  trialCount: number;
  scenarioCount: number;
  scenarioIds: string[];
};

export type RunConditionGrid = {
  attributeA: string;
  attributeB: string;
  rowLevels: string[];
  colLevels: string[];
  cells: RunConditionGridCell[];
};

// ============================================================================
// QUERIES
// ============================================================================

export { ScenariosDocument as SCENARIOS_QUERY } from '../../generated/graphql';
export { ScenarioCountDocument as SCENARIO_COUNT_QUERY } from '../../generated/graphql';
export { RunConditionGridDocument as RUN_CONDITION_GRID_QUERY } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type ScenariosQueryResult = {
  scenarios: Scenario[];
};

export type ScenariosQueryVariables = {
  definitionId: string;
  limit?: number;
  offset?: number;
};

export type ScenarioCountQueryResult = {
  scenarioCount: number;
};

export type ScenarioCountQueryVariables = {
  definitionId: string;
};

export type RunConditionGridQueryResult = {
  runConditionGrid: RunConditionGrid | null;
};

export type RunConditionGridQueryVariables = {
  definitionId: string;
};
