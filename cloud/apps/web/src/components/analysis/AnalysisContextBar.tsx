import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ModelOption = Option & {
  isDefault?: boolean;
};

type AnalysisContextBarProps = {
  domain: {
    label?: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    disabled?: boolean;
  };
  signature: {
    label?: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    disabled?: boolean;
  };
  models: {
    label?: string;
    selectedModelIds: string[] | null;
    defaultModelIds: string[];
    options: ModelOption[];
    onChange: (value: string[]) => void;
  };
  className?: string;
};

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value) => right.includes(value));
}

export function AnalysisContextBar({
  domain,
  signature,
  models,
  className,
}: AnalysisContextBarProps) {
  const currentModelIds = models.selectedModelIds ?? models.defaultModelIds;
  const availableModelIds = useMemo(() => models.options.map((option) => option.value), [models.options]);
  const isDefaultSelection = models.defaultModelIds.length > 0 && sameSelection(currentModelIds, models.defaultModelIds);
  const modelSummary = availableModelIds.length === 0
    ? 'No active models'
    : currentModelIds.length === 0
      ? 'No models selected'
      : isDefaultSelection
        ? `Default — ${currentModelIds.length} model${currentModelIds.length === 1 ? '' : 's'}`
        : currentModelIds.length === availableModelIds.length
          ? 'All models'
          : `${currentModelIds.length} of ${availableModelIds.length} selected`;

  const [isOpen, setIsOpen] = useState(false);

  const handleToggleModel = (modelId: string) => {
    const next = currentModelIds.includes(modelId)
      ? currentModelIds.filter((id) => id !== modelId)
      : [...currentModelIds, modelId];
    models.onChange(next);
  };

  return (
    <section className={cn('sticky top-14 z-20 border-b border-gray-200 bg-[#FDFBF7]/95 backdrop-blur', className)}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-4 px-4 py-4">
        <div className="min-w-[210px] flex-1">
          <Select
            label={domain.label ?? 'Domain'}
            value={domain.value}
            onChange={domain.onChange}
            options={domain.options}
            disabled={domain.disabled}
          />
        </div>

        <div className="min-w-[210px] flex-1">
          <Select
            label={signature.label ?? 'Signature'}
            value={signature.value}
            onChange={signature.onChange}
            options={signature.options}
            disabled={signature.disabled}
          />
        </div>

        <div className="ml-auto min-w-[210px] flex-1">
          <details open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer list-none">
              <p className="mb-1 text-sm font-medium text-gray-700">{models.label ?? 'Models'}</p>
              <div className="inline-flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-h-[44px] hover:border-gray-400 sm:min-h-0">
                <span className={availableModelIds.length === 0 ? 'text-gray-400' : ''}>{modelSummary}</span>
                <ChevronDown className={`ml-2 h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </summary>
            <div className="mt-1 space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => models.onChange([...models.defaultModelIds])}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-0 ${
                    isDefaultSelection
                      ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:text-teal-700 hover:bg-white'
                  }`}
                >
                  Default Models
                </Button>
                {models.options.map((model) => {
                  const isSelected = currentModelIds.includes(model.value);
                  return (
                    <Button
                      key={model.value}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleModel(model.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-0 ${
                        isSelected
                          ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:text-teal-700 hover:bg-white'
                      }`}
                      title={model.label}
                    >
                      {model.label}
                    </Button>
                  );
                })}
              </div>

              {models.options.length === 0 ? (
                <p className="text-xs text-gray-500">No active models are available yet.</p>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
