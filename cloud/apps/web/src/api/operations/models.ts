import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type AvailableModel = {
  id: string;
  providerId: string;
  displayName: string;
  versions: string[];
  defaultVersion: string | null;
  isAvailable: boolean;
};

// ============================================================================
// QUERIES
// ============================================================================

export const AVAILABLE_MODELS_QUERY = gql`
  query AvailableModels {
    availableModels {
      id
      providerId
      displayName
      versions
      defaultVersion
      isAvailable
    }
  }
`;

// ============================================================================
// RESULT TYPES
// ============================================================================

export type AvailableModelsQueryResult = {
  availableModels: AvailableModel[];
};
