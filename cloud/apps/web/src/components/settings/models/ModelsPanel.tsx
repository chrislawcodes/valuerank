/**
 * Models Panel
 *
 * Settings panel for managing LLM providers and their models.
 */

import { useState } from 'react';
import { useQuery, useMutation } from 'urql';
import { Cpu } from 'lucide-react';
import { Loading } from '../../ui/Loading';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { ProviderSection } from './ProviderSection';
import { ModelFormModal } from './ModelForm';
import { ProviderSettingsModal } from './ProviderSettingsModal';
import type { LlmProvidersQueryResult, LlmProvider, LlmModel, CreateLlmModelInput, UpdateLlmModelInput } from '../../../api/operations/llm';
import {
  LLM_PROVIDERS_QUERY,
  CREATE_LLM_MODEL_MUTATION,
  UPDATE_LLM_MODEL_MUTATION,
  DEPRECATE_LLM_MODEL_MUTATION,
  REACTIVATE_LLM_MODEL_MUTATION,
  SET_DEFAULT_LLM_MODEL_MUTATION,
  UNSET_DEFAULT_LLM_MODEL_MUTATION,
  UPDATE_LLM_PROVIDER_MUTATION,
} from '../../../api/operations/llm';

export function ModelsPanel() {
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<LlmModel | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider | null>(null);
  const [editingProvider, setEditingProvider] = useState<LlmProvider | null>(null);

  const [{ data, fetching, error }, reexecuteQuery] = useQuery<LlmProvidersQueryResult>({
    query: LLM_PROVIDERS_QUERY,
  });

  const [, createModel] = useMutation(CREATE_LLM_MODEL_MUTATION);
  const [, updateModel] = useMutation(UPDATE_LLM_MODEL_MUTATION);
  const [, deprecateModel] = useMutation(DEPRECATE_LLM_MODEL_MUTATION);
  const [, reactivateModel] = useMutation(REACTIVATE_LLM_MODEL_MUTATION);
  const [, setDefaultModel] = useMutation(SET_DEFAULT_LLM_MODEL_MUTATION);
  const [, unsetDefaultModel] = useMutation(UNSET_DEFAULT_LLM_MODEL_MUTATION);
  const [, updateProvider] = useMutation(UPDATE_LLM_PROVIDER_MUTATION);

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const handleCreateModel = async (input: CreateLlmModelInput) => {
    await createModel({ input });
    setIsAddModelOpen(false);
    setSelectedProvider(null);
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleUpdateModel = async (id: string, input: UpdateLlmModelInput) => {
    await updateModel({ id, input });
    setEditingModel(null);
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleDeprecateModel = async (id: string) => {
    await deprecateModel({ id });
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleReactivateModel = async (id: string) => {
    await reactivateModel({ id });
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultModel({ id });
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleUnsetDefault = async (id: string) => {
    await unsetDefaultModel({ id });
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleUpdateProvider = async (
    id: string,
    input: { requestsPerMinute?: number; maxParallelRequests?: number }
  ) => {
    await updateProvider({ id, input });
    setEditingProvider(null);
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const openAddModel = (provider: LlmProvider) => {
    setSelectedProvider(provider);
    setIsAddModelOpen(true);
  };

  if (fetching) return <Loading text="Loading models..." />;
  if (error) {
    return (
      <ErrorMessage
        message={error.message}
        onRetry={() => reexecuteQuery({ requestPolicy: 'network-only' })}
      />
    );
  }

  const providers = data?.llmProviders ?? [];

  if (providers.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="No providers configured"
        description="LLM providers need to be seeded in the database"
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {providers.map((provider) => (
          <ProviderSection
            key={provider.id}
            provider={provider}
            isExpanded={expandedProviders.has(provider.id)}
            onToggle={() => toggleProvider(provider.id)}
            onAddModel={() => openAddModel(provider)}
            onEditModel={setEditingModel}
            onDeprecateModel={handleDeprecateModel}
            onReactivateModel={handleReactivateModel}
            onSetDefault={handleSetDefault}
            onUnsetDefault={handleUnsetDefault}
            onEditSettings={() => setEditingProvider(provider)}
          />
        ))}
      </div>

      {isAddModelOpen && selectedProvider && (
        <ModelFormModal
          provider={selectedProvider}
          onClose={() => {
            setIsAddModelOpen(false);
            setSelectedProvider(null);
          }}
          onSave={handleCreateModel as (input: CreateLlmModelInput | UpdateLlmModelInput) => Promise<void>}
        />
      )}

      {editingModel && (
        <ModelFormModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSave={(input) => handleUpdateModel(editingModel.id, input as UpdateLlmModelInput)}
        />
      )}

      {editingProvider && (
        <ProviderSettingsModal
          provider={editingProvider}
          onClose={() => setEditingProvider(null)}
          onSave={(input) => handleUpdateProvider(editingProvider.id, input)}
        />
      )}
    </>
  );
}
