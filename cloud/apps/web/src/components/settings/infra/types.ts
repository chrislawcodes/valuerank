/**
 * Shared types for Infrastructure Panel components
 */

import type { LlmModel } from '../../../api/operations/llm';

export type InfraModelResult = {
  infraModel: {
    id: string;
    modelId: string;
    displayName: string;
    provider: {
      id: string;
      name: string;
      displayName: string;
    };
  } | null;
};

export type LowestCostModelResult = {
  llmModels: Array<{
    id: string;
    modelId: string;
    displayName: string;
    costInputPerMillion: number;
    costOutputPerMillion: number;
    provider: {
      id: string;
      name: string;
      displayName: string;
    };
  }>;
};

export type CodeGenerationSettingResult = {
  systemSetting: {
    id: string;
    key: string;
    value: { enabled?: boolean };
  } | null;
};

export type SummarizationParallelismResult = {
  systemSetting: {
    id: string;
    key: string;
    value: { value?: number };
  } | null;
};

export type Provider = {
  id: string;
  name: string;
  displayName: string;
  isEnabled: boolean;
  models: LlmModel[];
};

export type ModelSelectorProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBgColor: string;
  currentModel: InfraModelResult['infraModel'];
  fallbackMessage?: React.ReactNode;
  providers: Provider[];
  selectedProviderId: string;
  selectedModelId: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onSave: () => Promise<void>;
  hasChanges: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
};
