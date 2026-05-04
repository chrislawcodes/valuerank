import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';
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

  const hasSingleModel = models.length === 1;
  const detailModel = hasSingleModel ? selectedModel ?? models[0] ?? null : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Pair grid</h3>
        <p className="mt-2 text-sm text-gray-600">
          This table is model-specific. Pick a single model in the bar above to see the pair-by-pair grid.
        </p>

        {detailModel != null ? (
          <div className="mt-4">
            <PressureSensitivityDetail model={detailModel} />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Pick a single model in the bar above to view the pair-by-pair grid.
          </div>
        )}
      </div>

      {children?.({
        selectedModelId: selectedModel?.modelId ?? null,
        onSelectModel: setSelectedModelId,
      })}
    </div>
  );
}
