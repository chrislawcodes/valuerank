import { gql } from 'urql';

// ============================================================================
// TYPES
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

// ============================================================================
// QUERIES
// ============================================================================

export const SCENARIOS_QUERY = gql`
  query Scenarios($definitionId: ID!, $limit: Int, $offset: Int) {
    scenarios(definitionId: $definitionId, limit: $limit, offset: $offset) {
      id
      definitionId
      name
      content
      createdAt
    }
  }
`;

export const SCENARIO_COUNT_QUERY = gql`
  query ScenarioCount($definitionId: ID!) {
    scenarioCount(definitionId: $definitionId)
  }
`;

export const SCENARIO_QUERY = gql`
  query Scenario($id: ID!) {
    scenario(id: $id) {
      id
      definitionId
      name
      content
      createdAt
    }
  }
`;

// ============================================================================
// RESULT TYPES
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

export type ScenarioQueryResult = {
  scenario: Scenario | null;
};

export type ScenarioQueryVariables = {
  id: string;
};
