import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { AnalysisContextBar } from '../analysis/AnalysisContextBar';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

type Option = { value: string; label: string };
type ModelOption = Option & { isDefault?: boolean };

type Props = {
  domainId: string | null;
  signature: string;
  selectedModelIds: string[];
  defaultModelIds: string[];
  domainOptions: Option[];
  signatureOptions: Option[];
  modelOptions: ModelOption[];
  onDomainChange: (value: string | null) => void;
  onSignatureChange: (value: string) => void;
  onModelSelectionChange: (value: string[]) => void;
};

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value) => right.includes(value));
}

export function PressureSensitivityFilters({
  domainId,
  signature,
  selectedModelIds,
  defaultModelIds,
  domainOptions,
  signatureOptions,
  modelOptions,
  onDomainChange,
  onSignatureChange,
  onModelSelectionChange,
}: Props) {
  const [isModelsOpen, setIsModelsOpen] = useState(false);

  const availableModelIds = useMemo(() => modelOptions.map((option) => option.value), [modelOptions]);
  const defaultSelection = defaultModelIds.length > 0 ? defaultModelIds : availableModelIds;
  const isDefaultSelection = defaultSelection.length > 0 && sameSelection(selectedModelIds, defaultSelection);
  const isWarn = selectedModelIds.length === 0 && availableModelIds.length > 0;
  const selectedCount = selectedModelIds.length;

  const selectedSummary = availableModelIds.length === 0
    ? 'No active models'
    : isWarn
    ? 'No models selected'
    : isDefaultSelection
      ? 'Default models'
      : `${selectedCount} of ${availableModelIds.length}`;

  const handleToggleModel = (modelId: string) => {
    const next = selectedModelIds.includes(modelId)
      ? selectedModelIds.filter((value) => value !== modelId)
      : [...selectedModelIds, modelId];
    onModelSelectionChange(next);
  };

  const handleSelectAll = () => {
    onModelSelectionChange([...availableModelIds]);
  };

  const handleClear = () => {
    onModelSelectionChange([]);
  };

  const handleResetToDefault = () => {
    onModelSelectionChange([...defaultSelection]);
  };

  const domainSummary = domainId == null
    ? 'All domains'
    : domainOptions.find((option) => option.value === domainId)?.label ?? 'Selected domain';
  const summary = `${domainSummary} · ${selectedSummary} · ${signature}`;

  return (
    <AnalysisContextBar
      title="Analysis Context"
      summary={summary}
      secondary={(
        <>
          {isModelsOpen && (
            <div role="group" aria-label="Model filter" className="mt-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-600">Select models</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-teal-700 hover:text-teal-800"
                    onClick={handleSelectAll}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-gray-600 hover:text-gray-800"
                    onClick={handleClear}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="max-h-60 space-y-2 overflow-y-auto">
                {modelOptions.map((model) => {
                  const isSelected = selectedModelIds.includes(model.value);
                  return (
                    <label key={model.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleModel(model.value)}
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="truncate flex-1" title={model.label}>
                        {model.label}
                      </span>
                      {model.isDefault ? (
                        <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                          default
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              {modelOptions.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">No active models are available yet.</p>
              ) : null}
            </div>
          )}

          <p className="mt-3 text-xs text-gray-500">
            Domain and signature stay URL-driven. Model selection uses the standard default-model picker.
          </p>
        </>
      )}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <Select
            label="Domain"
            value={domainId ?? 'all'}
            onChange={(value) => onDomainChange(value === 'all' ? null : value)}
            options={[{ value: 'all', label: 'All domains' }, ...domainOptions]}
          />
        </div>
        <div className="flex min-w-[260px] flex-1 items-end gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Models:</span>
          </div>

          {isWarn ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              No models selected
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-700">{selectedSummary}</span>
          )}

          {!isWarn && !isDefaultSelection ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-teal-600 hover:text-teal-800 hover:underline"
              onClick={handleResetToDefault}
            >
              Reset to default
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 py-1 text-xs h-auto min-h-0"
            aria-expanded={isModelsOpen}
            onClick={() => setIsModelsOpen((value) => !value)}
          >
            {isModelsOpen ? (
              <>
                ▴ Close
                <ChevronUp className="ml-1 h-3 w-3" />
              </>
            ) : (
              <>
                ▾ Change
                <ChevronDown className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        </div>
        <div className="ml-auto min-w-[220px] max-w-xs flex-1">
          <Select
            label="Signature"
            value={signature}
            onChange={(value) => onSignatureChange(value)}
            options={signatureOptions.length > 0 ? signatureOptions : [{ value: signature, label: signature }]}
          />
        </div>
      </div>
    </AnalysisContextBar>
  );
}
