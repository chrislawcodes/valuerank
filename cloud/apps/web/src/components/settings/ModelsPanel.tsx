import { useState } from 'react';
import { useQuery, useMutation } from 'urql';
import {
  Cpu,
  Plus,
  Star,
  Archive,
  RotateCcw,
  Edit2,
  ChevronDown,
  ChevronRight,
  Settings,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Loading } from '../ui/Loading';
import { EmptyState } from '../ui/EmptyState';
import { ErrorMessage } from '../ui/ErrorMessage';
import { JsonEditor } from '../ui/JsonEditor';
import {
  LLM_PROVIDERS_QUERY,
  CREATE_LLM_MODEL_MUTATION,
  UPDATE_LLM_MODEL_MUTATION,
  DEPRECATE_LLM_MODEL_MUTATION,
  REACTIVATE_LLM_MODEL_MUTATION,
  SET_DEFAULT_LLM_MODEL_MUTATION,
  UPDATE_LLM_PROVIDER_MUTATION,
  LlmProvidersQueryResult,
  LlmProvider,
  LlmModel,
  CreateLlmModelInput,
  UpdateLlmModelInput,
} from '../../api/operations/llm';

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
          <ProviderCard
            key={provider.id}
            provider={provider}
            isExpanded={expandedProviders.has(provider.id)}
            onToggle={() => toggleProvider(provider.id)}
            onAddModel={() => openAddModel(provider)}
            onEditModel={setEditingModel}
            onDeprecateModel={handleDeprecateModel}
            onReactivateModel={handleReactivateModel}
            onSetDefault={handleSetDefault}
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

function ProviderCard({
  provider,
  isExpanded,
  onToggle,
  onAddModel,
  onEditModel,
  onDeprecateModel,
  onReactivateModel,
  onSetDefault,
  onEditSettings,
}: {
  provider: LlmProvider;
  isExpanded: boolean;
  onToggle: () => void;
  onAddModel: () => void;
  onEditModel: (model: LlmModel) => void;
  onDeprecateModel: (id: string) => void;
  onReactivateModel: (id: string) => void;
  onSetDefault: (id: string) => void;
  onEditSettings: () => void;
}) {
  const activeModels = provider.models.filter((m) => m.status === 'ACTIVE');
  const deprecatedModels = provider.models.filter((m) => m.status === 'DEPRECATED');

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
          <div className="text-left">
            <h3 className="font-medium text-gray-900">{provider.displayName}</h3>
            <p className="text-sm text-gray-500">
              {activeModels.length} active model{activeModels.length !== 1 ? 's' : ''}
              {deprecatedModels.length > 0 && `, ${deprecatedModels.length} deprecated`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              provider.isEnabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {provider.isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          <div className="px-6 py-3 bg-gray-50 flex justify-between items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditSettings();
              }}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 group"
              title="Edit rate limits"
            >
              <Settings className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              Rate limit: {provider.requestsPerMinute}/min, {provider.maxParallelRequests} parallel
            </button>
            <Button variant="ghost" size="sm" onClick={onAddModel}>
              <Plus className="w-4 h-4 mr-1" />
              Add Model
            </Button>
          </div>

          <div className="divide-y divide-gray-100">
            {provider.models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                onEdit={() => onEditModel(model)}
                onDeprecate={() => onDeprecateModel(model.id)}
                onReactivate={() => onReactivateModel(model.id)}
                onSetDefault={() => onSetDefault(model.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  onEdit,
  onDeprecate,
  onReactivate,
  onSetDefault,
}: {
  model: LlmModel;
  onEdit: () => void;
  onDeprecate: () => void;
  onReactivate: () => void;
  onSetDefault: () => void;
}) {
  const isDeprecated = model.status === 'DEPRECATED';

  return (
    <div
      className={`px-6 py-4 flex items-center justify-between ${
        isDeprecated ? 'bg-gray-50 opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isDeprecated ? 'bg-gray-200' : 'bg-teal-100'
          }`}
        >
          <Cpu className={`w-5 h-5 ${isDeprecated ? 'text-gray-400' : 'text-teal-600'}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{model.displayName}</p>
            {model.isDefault && (
              <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" />
                Default
              </span>
            )}
            {isDeprecated && (
              <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                Deprecated
              </span>
            )}
            {!model.isAvailable && !isDeprecated && (
              <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                No API Key
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {model.modelId} · ${model.costInputPerMillion}/M input, ${model.costOutputPerMillion}/M
            output
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!isDeprecated && !model.isDefault && (
          <Button variant="ghost" size="sm" onClick={onSetDefault} title="Set as default">
            <Star className="w-4 h-4" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} title="Edit">
          <Edit2 className="w-4 h-4" />
        </Button>
        {isDeprecated ? (
          <Button variant="ghost" size="sm" onClick={onReactivate} title="Reactivate">
            <RotateCcw className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeprecate}
            title="Deprecate"
            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
          >
            <Archive className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ModelFormModal({
  provider,
  model,
  onClose,
  onSave,
}: {
  provider?: LlmProvider;
  model?: LlmModel;
  onClose: () => void;
  onSave: (input: CreateLlmModelInput | UpdateLlmModelInput) => Promise<void>;
}) {
  const isEditing = !!model;
  const [modelId, setModelId] = useState(model?.modelId ?? '');
  const [displayName, setDisplayName] = useState(model?.displayName ?? '');
  const [costInput, setCostInput] = useState(model?.costInputPerMillion?.toString() ?? '');
  const [costOutput, setCostOutput] = useState(model?.costOutputPerMillion?.toString() ?? '');
  const [apiConfig, setApiConfig] = useState(
    model?.apiConfig ? JSON.stringify(model.apiConfig, null, 2) : ''
  );
  const [apiConfigError, setApiConfigError] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleApiConfigChange = (value: string) => {
    setApiConfig(value);
  };

  const handleApiConfigValidation = (isValid: boolean, error: string | null) => {
    setApiConfigError(isValid ? null : error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiConfigError) return;
    setIsSaving(true);

    // Parse apiConfig if provided
    let parsedApiConfig: Record<string, unknown> | null | undefined = undefined;
    if (isEditing) {
      if (apiConfig.trim() === '') {
        // Empty string means clear the config
        parsedApiConfig = null;
      } else {
        try {
          parsedApiConfig = JSON.parse(apiConfig);
        } catch {
          // Shouldn't happen due to validation
          setIsSaving(false);
          return;
        }
      }
    }

    if (isEditing) {
      await onSave({
        displayName: displayName || undefined,
        costInputPerMillion: costInput ? parseFloat(costInput) : undefined,
        costOutputPerMillion: costOutput ? parseFloat(costOutput) : undefined,
        apiConfig: parsedApiConfig,
      });
    } else if (provider) {
      await onSave({
        providerId: provider.id,
        modelId,
        displayName,
        costInputPerMillion: parseFloat(costInput),
        costOutputPerMillion: parseFloat(costOutput),
        setAsDefault,
      });
    }

    setIsSaving(false);
  };

  const isValid = isEditing
    ? (displayName || costInput || costOutput || apiConfig !== (model?.apiConfig ? JSON.stringify(model.apiConfig, null, 2) : '')) && !apiConfigError
    : modelId && displayName && costInput && costOutput;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {isEditing ? 'Edit Model' : `Add Model to ${provider?.displayName}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEditing && (
            <Input
              label="Model ID"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g., gpt-4o-mini"
              required
            />
          )}

          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., GPT-4o Mini"
            required={!isEditing}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cost per 1M Input ($)"
              type="number"
              step="0.01"
              min="0"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="0.15"
              required={!isEditing}
            />
            <Input
              label="Cost per 1M Output ($)"
              type="number"
              step="0.01"
              min="0"
              value={costOutput}
              onChange={(e) => setCostOutput(e.target.value)}
              placeholder="0.60"
              required={!isEditing}
            />
          </div>

          {!isEditing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">Set as default for this provider</span>
            </label>
          )}

          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Config (JSON)
              </label>
              <JsonEditor
                value={apiConfig}
                onChange={handleApiConfigChange}
                onValidationChange={handleApiConfigValidation}
                height="120px"
                placeholder='{"maxTokensParam": "max_completion_tokens"}'
              />
              {apiConfigError && (
                <p className="mt-1 text-sm text-red-600">{apiConfigError}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Provider-specific configuration. Leave empty to clear.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!isValid || isSaving} isLoading={isSaving}>
              {isEditing ? 'Save Changes' : 'Add Model'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProviderSettingsModal({
  provider,
  onClose,
  onSave,
}: {
  provider: LlmProvider;
  onClose: () => void;
  onSave: (input: { requestsPerMinute?: number; maxParallelRequests?: number }) => Promise<void>;
}) {
  const [requestsPerMinute, setRequestsPerMinute] = useState(provider.requestsPerMinute.toString());
  const [maxParallelRequests, setMaxParallelRequests] = useState(
    provider.maxParallelRequests.toString()
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    await onSave({
      requestsPerMinute: parseInt(requestsPerMinute, 10),
      maxParallelRequests: parseInt(maxParallelRequests, 10),
    });

    setIsSaving(false);
  };

  const hasChanges =
    parseInt(requestsPerMinute, 10) !== provider.requestsPerMinute ||
    parseInt(maxParallelRequests, 10) !== provider.maxParallelRequests;

  const isValid =
    requestsPerMinute &&
    maxParallelRequests &&
    parseInt(requestsPerMinute, 10) > 0 &&
    parseInt(maxParallelRequests, 10) > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {provider.displayName} Settings
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Rate Limit (requests/minute)"
            type="number"
            min="1"
            max="10000"
            value={requestsPerMinute}
            onChange={(e) => setRequestsPerMinute(e.target.value)}
            required
          />

          <Input
            label="Max Parallel Requests"
            type="number"
            min="1"
            max="100"
            value={maxParallelRequests}
            onChange={(e) => setMaxParallelRequests(e.target.value)}
            required
          />

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p>
              <strong>Rate Limit:</strong> Maximum API calls per minute to this provider.
            </p>
            <p className="mt-1">
              <strong>Parallel Requests:</strong> Maximum concurrent API calls. Set to 1 for
              conservative usage that avoids rate limit errors.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isValid || !hasChanges || isSaving}
              isLoading={isSaving}
            >
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
