import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';
import { Select } from '../ui/Select';
import { PressureSensitivityDetail } from './PressureSensitivityDetail';

type Props = {
  models: PressureSensitivityModel[];
  children?: (selection: {
    selectedModelId: string | null;
    onSelectModel: (modelId: string) => void;
  }) => ReactNode;
};

export function PressureSensitivityGridSection({ models, children }: Props) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModelId(null);
      return;
    }

    setSelectedModelId((current) => {
      if (current != null && models.some((model) => model.modelId === current)) {
        return current;
      }
      return models[0]?.modelId ?? null;
    });
  }, [models]);

  const selectedModel = useMemo(
    () => (selectedModelId != null ? models.find((model) => model.modelId === selectedModelId) ?? null : null),
    [models, selectedModelId],
  );

  const modelOptions = useMemo(
    () => models.map((model) => ({ value: model.modelId, label: model.label })),
    [models],
  );

  if (selectedModel == null) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="max-w-sm">
          <Select
            label="Show grids for"
            value={selectedModel.modelId}
            onChange={(value) => setSelectedModelId(value)}
            options={modelOptions}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          The per-pair grid stays model-specific, so this picker only changes the detail section below.
        </p>
      </div>

      <PressureSensitivityDetail model={selectedModel} />

      {children?.({
        selectedModelId: selectedModel.modelId,
        onSelectModel: setSelectedModelId,
      })}
    </div>
  );
}
