/**
 * Infrastructure Panel
 *
 * Settings panel for configuring infrastructure models used
 * for internal tasks like scenario expansion.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'urql';
import { Cpu, Settings, Check, AlertTriangle, Code } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import {
  LLM_PROVIDERS_QUERY,
  UPDATE_SYSTEM_SETTING_MUTATION,
  LlmProvidersQueryResult,
  LlmModel,
} from '../../api/operations/llm';

const INFRA_MODEL_QUERY = `
  query InfraModel($purpose: String!) {
    infraModel(purpose: $purpose) {
      id
      modelId
      displayName
      provider {
        id
        name
        displayName
      }
    }
  }
`;

const CODE_GENERATION_SETTING_QUERY = `
  query CodeGenerationSetting {
    systemSetting(key: "scenario_expansion_use_code_generation") {
      id
      key
      value
    }
  }
`;

type InfraModelResult = {
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

type CodeGenerationSettingResult = {
  systemSetting: {
    id: string;
    key: string;
    value: { enabled?: boolean };
  } | null;
};

export function InfraPanel() {
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [useCodeGeneration, setUseCodeGeneration] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingCodeGen, setIsSavingCodeGen] = useState(false);
  const [saveCodeGenSuccess, setSaveCodeGenSuccess] = useState(false);

  const [{ data: providersData, fetching: loadingProviders, error: providersError }] =
    useQuery<LlmProvidersQueryResult>({ query: LLM_PROVIDERS_QUERY });

  const [{ data: infraData, fetching: loadingInfra }, reexecuteInfra] = useQuery<InfraModelResult>({
    query: INFRA_MODEL_QUERY,
    variables: { purpose: 'scenario_expansion' },
  });

  const [{ data: codeGenData, fetching: loadingCodeGen }, reexecuteCodeGen] =
    useQuery<CodeGenerationSettingResult>({ query: CODE_GENERATION_SETTING_QUERY });

  const [, updateSetting] = useMutation(UPDATE_SYSTEM_SETTING_MUTATION);

  // Initialize selection from current config
  useEffect(() => {
    if (infraData?.infraModel) {
      setSelectedProviderId(infraData.infraModel.provider.id);
      setSelectedModelId(infraData.infraModel.modelId);
    }
  }, [infraData]);

  // Initialize code generation setting
  useEffect(() => {
    if (codeGenData?.systemSetting) {
      setUseCodeGeneration(codeGenData.systemSetting.value?.enabled === true);
    }
  }, [codeGenData]);

  const providers = providersData?.llmProviders ?? [];
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const availableModels = selectedProvider?.models.filter((m) => m.status === 'ACTIVE') ?? [];

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setSelectedModelId('');
    setSaveSuccess(false);
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!selectedProviderId || !selectedModelId || !selectedProvider) return;

    setIsSaving(true);
    setSaveSuccess(false);

    await updateSetting({
      input: {
        key: 'infra_model_scenario_expansion',
        value: {
          providerId: selectedProvider.name, // Use provider name for lookup
          modelId: selectedModelId,
        },
      },
    });

    setIsSaving(false);
    setSaveSuccess(true);
    reexecuteInfra({ requestPolicy: 'network-only' });

    // Clear success message after 3 seconds
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleCodeGenerationToggle = async () => {
    const newValue = !useCodeGeneration;
    setIsSavingCodeGen(true);
    setSaveCodeGenSuccess(false);

    await updateSetting({
      input: {
        key: 'scenario_expansion_use_code_generation',
        value: { enabled: newValue },
      },
    });

    setUseCodeGeneration(newValue);
    setIsSavingCodeGen(false);
    setSaveCodeGenSuccess(true);
    reexecuteCodeGen({ requestPolicy: 'network-only' });

    // Clear success message after 3 seconds
    setTimeout(() => setSaveCodeGenSuccess(false), 3000);
  };

  const hasChanges =
    infraData?.infraModel?.provider.id !== selectedProviderId ||
    infraData?.infraModel?.modelId !== selectedModelId;

  if (loadingProviders || loadingInfra || loadingCodeGen) {
    return <Loading text="Loading configuration..." />;
  }

  if (providersError) {
    return <ErrorMessage message={providersError.message} />;
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Settings className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-gray-900">Scenario Expansion Model</h2>
              <p className="text-sm text-gray-500">
                Model used for expanding scenario definitions into concrete scenarios
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Current Configuration */}
          {infraData?.infraModel && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Currently configured:</p>
              <p className="font-medium text-gray-900">
                {infraData.infraModel.provider.displayName} / {infraData.infraModel.displayName}
              </p>
            </div>
          )}

          {!infraData?.infraModel && (
            <div className="p-4 bg-yellow-50 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">No model configured</p>
                <p className="text-sm text-yellow-700">
                  System will use default (Claude 3.5 Haiku) until you configure one.
                </p>
              </div>
            </div>
          )}

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
            <select
              value={selectedProviderId}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Select a provider...</option>
              {providers
                .filter((p) => p.isEnabled)
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.displayName}
                  </option>
                ))}
            </select>
          </div>

          {/* Model Selection */}
          {selectedProvider && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Select a model...</option>
                {availableModels.map((model) => (
                  <option key={model.id} value={model.modelId}>
                    {model.displayName} ({model.modelId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cost Info */}
          {selectedModelId && selectedProvider && (
            <ModelCostInfo models={availableModels} selectedModelId={selectedModelId} />
          )}

          {/* Save Button */}
          <div className="flex items-center justify-between pt-4">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-green-600">
                <Check className="w-4 h-4" />
                <span className="text-sm">Configuration saved</span>
              </div>
            )}
            <div className="ml-auto">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!selectedProviderId || !selectedModelId || !hasChanges || isSaving}
                isLoading={isSaving}
              >
                Save Configuration
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Code Generation Section */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Code className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-gray-900">Generation Method</h2>
              <p className="text-sm text-gray-500">
                Choose between LLM-based or code-based scenario generation
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-start gap-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useCodeGeneration}
                onChange={handleCodeGenerationToggle}
                disabled={isSavingCodeGen}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Use Code-based Generation
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Generate scenarios using deterministic combinatorial logic instead of calling an LLM.
                This is faster, cheaper (no LLM costs), and produces consistent results.
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {useCodeGeneration ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm">
                <Code className="w-4 h-4" />
                Code generation enabled
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm">
                <Cpu className="w-4 h-4" />
                LLM generation enabled
              </div>
            )}
            {saveCodeGenSuccess && (
              <div className="flex items-center gap-1 text-green-600">
                <Check className="w-4 h-4" />
                <span className="text-sm">Saved</span>
              </div>
            )}
          </div>

          {/* Trade-offs info */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Trade-offs:</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-green-700">Code Generation</p>
                <ul className="mt-1 text-gray-600 space-y-1">
                  <li>+ Fast and deterministic</li>
                  <li>+ No LLM costs</li>
                  <li>+ Consistent output</li>
                  <li>- Simple placeholder replacement</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-purple-700">LLM Generation</p>
                <ul className="mt-1 text-gray-600 space-y-1">
                  <li>+ Natural language variations</li>
                  <li>+ Can follow matching rules</li>
                  <li>- Costs tokens per expansion</li>
                  <li>- Results may vary</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <div className="p-4 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 mb-2">About Infrastructure Models</h3>
        <p className="text-sm text-blue-700">
          Infrastructure models are used for internal tasks that don't directly evaluate AI behavior.
          The scenario expansion model takes definition files (.md) and generates concrete scenarios (.yaml).
          A cost-efficient model like Claude 3.5 Haiku or GPT-4o Mini is recommended.
        </p>
      </div>
    </div>
  );
}

function ModelCostInfo({
  models,
  selectedModelId,
}: {
  models: LlmModel[];
  selectedModelId: string;
}) {
  const model = models.find((m) => m.modelId === selectedModelId);
  if (!model) return null;

  return (
    <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-3">
      <Cpu className="w-5 h-5 text-gray-400" />
      <div className="text-sm text-gray-600">
        <span className="font-medium">{model.displayName}</span>
        <span className="mx-2">•</span>
        <span>${model.costInputPerMillion}/M input, ${model.costOutputPerMillion}/M output</span>
      </div>
    </div>
  );
}
