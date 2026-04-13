// ============================================================================
// TYPES (manual — keeps app-level shapes consumers expect)
// ============================================================================

export type LlmModelStatus = 'ACTIVE' | 'DEPRECATED';

export type LlmProvider = {
  id: string;
  name: string;
  displayName: string;
  maxParallelRequests: number;
  requestsPerMinute: number;
  isEnabled: boolean;
  balance: number | null;
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
// FRAGMENTS (re-exported as named constants for backward compat)
// ============================================================================

export {
  LlmModelFieldsFragmentDoc as LLM_MODEL_FRAGMENT,
  LlmProviderFieldsFragmentDoc as LLM_PROVIDER_FRAGMENT,
} from '../../generated/graphql';

// ============================================================================
// QUERIES
// ============================================================================

export { LlmProvidersDocument as LLM_PROVIDERS_QUERY } from '../../generated/graphql';
export { LlmModelsDocument as LLM_MODELS_QUERY } from '../../generated/graphql';
export { InfraModelDocument as INFRA_MODEL_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateLlmModelDocument as CREATE_LLM_MODEL_MUTATION } from '../../generated/graphql';
export { UpdateLlmModelDocument as UPDATE_LLM_MODEL_MUTATION } from '../../generated/graphql';
export { DeprecateLlmModelDocument as DEPRECATE_LLM_MODEL_MUTATION } from '../../generated/graphql';
export { ReactivateLlmModelDocument as REACTIVATE_LLM_MODEL_MUTATION } from '../../generated/graphql';
export { SetDefaultLlmModelDocument as SET_DEFAULT_LLM_MODEL_MUTATION } from '../../generated/graphql';
export { UnsetDefaultLlmModelDocument as UNSET_DEFAULT_LLM_MODEL_MUTATION } from '../../generated/graphql';
export { UpdateLlmProviderDocument as UPDATE_LLM_PROVIDER_MUTATION } from '../../generated/graphql';
export { UpdateSystemSettingDocument as UPDATE_SYSTEM_SETTING_MUTATION } from '../../generated/graphql';
export { SetProviderBalanceDocument as SET_PROVIDER_BALANCE_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type LlmProvidersQueryResult = {
  llmProviders: LlmProvider[];
};

export type LlmModelsQueryResult = {
  llmModels: LlmModel[];
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

export type UnsetDefaultLlmModelMutationResult = {
  unsetDefaultLlmModel: LlmModel;
};

export type UpdateLlmProviderMutationResult = {
  updateLlmProvider: LlmProvider;
};

export type UpdateSystemSettingMutationResult = {
  updateSystemSetting: SystemSetting;
};

export type ProviderBalanceSyncLog = {
  id: string;
  providerId: string;
  systemBalanceAtSync: number;
  enteredBalance: number;
  delta: number;
  syncedAt: string;
};

export type SetProviderBalanceMutationResult = {
  setProviderBalance: LlmProvider;
};

// ============================================================================
// INPUT TYPES (manual — consumer-facing shapes)
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
