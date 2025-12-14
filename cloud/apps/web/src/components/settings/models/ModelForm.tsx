/**
 * Model Form Modal
 *
 * Form for adding or editing an LLM model.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { JsonEditor } from '../../ui/JsonEditor';
import type { ModelFormModalProps } from './types';

export function ModelFormModal({
  provider,
  model,
  onClose,
  onSave,
}: ModelFormModalProps) {
  const isEditing = !!model;
  const [modelId, setModelId] = useState(model?.modelId ?? '');
  const [displayName, setDisplayName] = useState(model?.displayName ?? '');
  const [costInput, setCostInput] = useState(model?.costInputPerMillion?.toString() ?? '');
  const [costOutput, setCostOutput] = useState(model?.costOutputPerMillion?.toString() ?? '');

  // Extract maxTokens from apiConfig for dedicated field
  const existingMaxTokens = model?.apiConfig?.maxTokens;
  const [maxTokens, setMaxTokens] = useState(
    typeof existingMaxTokens === 'number' ? existingMaxTokens.toString() : ''
  );

  // Filter out maxTokens from apiConfig for the JSON editor
  const getFilteredApiConfig = () => {
    if (!model?.apiConfig) return '';
    const { maxTokens: _maxTokens, ...rest } = model.apiConfig;
    return Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '';
  };
  const [apiConfig, setApiConfig] = useState(getFilteredApiConfig());
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

    // Build apiConfig by merging maxTokens with other JSON config
    let parsedApiConfig: Record<string, unknown> | null | undefined = undefined;
    if (isEditing) {
      let baseConfig: Record<string, unknown> = {};
      if (apiConfig.trim() !== '') {
        try {
          baseConfig = JSON.parse(apiConfig);
        } catch {
          setIsSaving(false);
          return;
        }
      }

      if (maxTokens.trim() !== '') {
        const maxTokensNum = parseInt(maxTokens, 10);
        if (!isNaN(maxTokensNum) && maxTokensNum > 0) {
          baseConfig.maxTokens = maxTokensNum;
        }
      }

      parsedApiConfig = Object.keys(baseConfig).length === 0 ? null : baseConfig;
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

  const hasChanges = isEditing
    ? displayName !== (model?.displayName ?? '') ||
      costInput !== (model?.costInputPerMillion?.toString() ?? '') ||
      costOutput !== (model?.costOutputPerMillion?.toString() ?? '') ||
      maxTokens !== (typeof existingMaxTokens === 'number' ? existingMaxTokens.toString() : '') ||
      apiConfig !== getFilteredApiConfig()
    : true;

  const isValid = isEditing
    ? hasChanges && !apiConfigError
    : modelId && displayName && costInput && costOutput;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {isEditing ? 'Edit Model' : `Add Model to ${provider?.displayName}`}
          </h3>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-gray-600 hover:bg-transparent"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </Button>
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
            <>
              <Input
                label="Max Output Tokens"
                type="number"
                min="1"
                step="1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="8192 (default)"
              />
              <p className="-mt-3 text-xs text-gray-500">
                Maximum tokens the model can generate. Used for scenario expansion. Leave empty for default (8192).
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Advanced API Config (JSON)
                </label>
                <JsonEditor
                  value={apiConfig}
                  onChange={handleApiConfigChange}
                  onValidationChange={handleApiConfigValidation}
                  height="100px"
                  placeholder='{"maxTokensParam": "max_completion_tokens"}'
                />
                {apiConfigError && (
                  <p className="mt-1 text-sm text-red-600">{apiConfigError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Other provider-specific settings. Leave empty if not needed.
                </p>
              </div>
            </>
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
