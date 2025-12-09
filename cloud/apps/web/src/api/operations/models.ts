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
  isDefault: boolean;
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
      isDefault
    }
  }
`;

// ============================================================================
// RESULT TYPES
// ============================================================================

export type AvailableModelsQueryResult = {
  availableModels: AvailableModel[];
};
