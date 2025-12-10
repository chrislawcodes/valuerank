import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type LlmModelStatus = 'ACTIVE' | 'DEPRECATED';

export type LlmProvider = {
  id: string;
  name: string;
  displayName: string;
  maxParallelRequests: number;
  requestsPerMinute: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  models: LlmModel[];
};

export type LlmModel = {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  status: LlmModelStatus;
  isDefault: boolean;
  isAvailable: boolean;
  apiConfig?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  provider?: LlmProvider;
};

export type SystemSetting = {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
};

// ============================================================================
// FRAGMENTS
// ============================================================================

export const LLM_MODEL_FRAGMENT = gql`
  fragment LlmModelFields on LlmModel {
    id
    providerId
    modelId
    displayName
    costInputPerMillion
    costOutputPerMillion
    status
    isDefault
    isAvailable
    apiConfig
    createdAt
    updatedAt
  }
`;

export const LLM_PROVIDER_FRAGMENT = gql`
  fragment LlmProviderFields on LlmProvider {
    id
    name
    displayName
    maxParallelRequests
    requestsPerMinute
    isEnabled
    createdAt
    updatedAt
  }
`;

// ============================================================================
// QUERIES
// ============================================================================

export const LLM_PROVIDERS_QUERY = gql`
  query LlmProviders {
    llmProviders {
      ...LlmProviderFields
      models {
        ...LlmModelFields
      }
    }
  }
  ${LLM_PROVIDER_FRAGMENT}
  ${LLM_MODEL_FRAGMENT}
`;

export const LLM_MODELS_QUERY = gql`
  query LlmModels($providerId: String, $status: String) {
    llmModels(providerId: $providerId, status: $status) {
      ...LlmModelFields
      provider {
        ...LlmProviderFields
      }
    }
  }
  ${LLM_MODEL_FRAGMENT}
  ${LLM_PROVIDER_FRAGMENT}
`;

export const SYSTEM_SETTINGS_QUERY = gql`
  query SystemSettings {
    systemSettings {
      id
      key
      value
      updatedAt
    }
  }
`;

export const INFRA_MODEL_QUERY = gql`
  query InfraModel($purpose: String!) {
    infraModel(purpose: $purpose) {
      ...LlmModelFields
      provider {
        ...LlmProviderFields
      }
    }
  }
  ${LLM_MODEL_FRAGMENT}
  ${LLM_PROVIDER_FRAGMENT}
`;

// ============================================================================
// MUTATIONS
// ============================================================================

export const CREATE_LLM_MODEL_MUTATION = gql`
  mutation CreateLlmModel($input: CreateLlmModelInput!) {
    createLlmModel(input: $input) {
      ...LlmModelFields
    }
  }
  ${LLM_MODEL_FRAGMENT}
`;

export const UPDATE_LLM_MODEL_MUTATION = gql`
  mutation UpdateLlmModel($id: String!, $input: UpdateLlmModelInput!) {
    updateLlmModel(id: $id, input: $input) {
      ...LlmModelFields
    }
  }
  ${LLM_MODEL_FRAGMENT}
`;

export const DEPRECATE_LLM_MODEL_MUTATION = gql`
  mutation DeprecateLlmModel($id: String!) {
    deprecateLlmModel(id: $id) {
      model {
        ...LlmModelFields
      }
      newDefault {
        ...LlmModelFields
      }
    }
  }
  ${LLM_MODEL_FRAGMENT}
`;

export const REACTIVATE_LLM_MODEL_MUTATION = gql`
  mutation ReactivateLlmModel($id: String!) {
    reactivateLlmModel(id: $id) {
      ...LlmModelFields
    }
  }
  ${LLM_MODEL_FRAGMENT}
`;

export const SET_DEFAULT_LLM_MODEL_MUTATION = gql`
  mutation SetDefaultLlmModel($id: String!) {
    setDefaultLlmModel(id: $id) {
      model {
        ...LlmModelFields
      }
      previousDefault {
        ...LlmModelFields
      }
    }
  }
  ${LLM_MODEL_FRAGMENT}
`;

export const UPDATE_LLM_PROVIDER_MUTATION = gql`
  mutation UpdateLlmProvider($id: String!, $input: UpdateLlmProviderInput!) {
    updateLlmProvider(id: $id, input: $input) {
      ...LlmProviderFields
    }
  }
  ${LLM_PROVIDER_FRAGMENT}
`;

export const UPDATE_SYSTEM_SETTING_MUTATION = gql`
  mutation UpdateSystemSetting($input: UpdateSystemSettingInput!) {
    updateSystemSetting(input: $input) {
      id
      key
      value
      updatedAt
    }
  }
`;

// ============================================================================
// RESULT TYPES
// ============================================================================

export type LlmProvidersQueryResult = {
  llmProviders: LlmProvider[];
};

export type LlmModelsQueryResult = {
  llmModels: LlmModel[];
};

export type SystemSettingsQueryResult = {
  systemSettings: SystemSetting[];
};

export type InfraModelQueryResult = {
  infraModel: LlmModel | null;
};

export type CreateLlmModelMutationResult = {
  createLlmModel: LlmModel;
};

export type UpdateLlmModelMutationResult = {
  updateLlmModel: LlmModel;
};

export type DeprecateLlmModelMutationResult = {
  deprecateLlmModel: {
    model: LlmModel;
    newDefault: LlmModel | null;
  };
};

export type ReactivateLlmModelMutationResult = {
  reactivateLlmModel: LlmModel;
};

export type SetDefaultLlmModelMutationResult = {
  setDefaultLlmModel: {
    model: LlmModel;
    previousDefault: LlmModel | null;
  };
};

export type UpdateLlmProviderMutationResult = {
  updateLlmProvider: LlmProvider;
};

export type UpdateSystemSettingMutationResult = {
  updateSystemSetting: SystemSetting;
};

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateLlmModelInput = {
  providerId: string;
  modelId: string;
  displayName: string;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  setAsDefault?: boolean;
};

export type UpdateLlmModelInput = {
  displayName?: string;
  costInputPerMillion?: number;
  costOutputPerMillion?: number;
  apiConfig?: Record<string, unknown> | null;
};

export type UpdateLlmProviderInput = {
  maxParallelRequests?: number;
  requestsPerMinute?: number;
  isEnabled?: boolean;
};

export type UpdateSystemSettingInput = {
  key: string;
  value: unknown;
};
