/**
 * Shared types for Models Panel components
 */

import type { LlmProvider, LlmModel, CreateLlmModelInput, UpdateLlmModelInput } from '../../../api/operations/llm';

export type { LlmProvider, LlmModel, CreateLlmModelInput, UpdateLlmModelInput };

export type ProviderSectionProps = {
  provider: LlmProvider;
  isExpanded: boolean;
  onToggle: () => void;
  onAddModel: () => void;
  onEditModel: (model: LlmModel) => void;
  onDeprecateModel: (id: string) => void;
  onReactivateModel: (id: string) => void;
  onSetDefault: (id: string) => void;
  onEditSettings: () => void;
};

export type ModelRowProps = {
  model: LlmModel;
  onEdit: () => void;
  onDeprecate: () => void;
  onReactivate: () => void;
  onSetDefault: () => void;
};

export type ModelFormModalProps = {
  provider?: LlmProvider;
  model?: LlmModel;
  onClose: () => void;
  onSave: (input: CreateLlmModelInput | UpdateLlmModelInput) => Promise<void>;
};

export type ProviderSettingsModalProps = {
  provider: LlmProvider;
  onClose: () => void;
  onSave: (input: { requestsPerMinute?: number; maxParallelRequests?: number }) => Promise<void>;
};
