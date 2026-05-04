import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Select, selectTriggerVariants } from '../ui/Select';

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
  models?: {
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

function ContextField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="shrink-0 text-sm font-medium text-gray-700">{label}</span>
      {children}
    </div>
  );
}

export function AnalysisContextBar({
  domain,
  signature,
  models,
  className,
}: AnalysisContextBarProps) {
  const currentModelIds = models != null ? (models.selectedModelIds ?? models.defaultModelIds) : [];
  const availableModelIds = useMemo(() => models?.options.map((option) => option.value) ?? [], [models?.options]);
  const isDefaultSelection = models != null && models.defaultModelIds.length > 0 && sameSelection(currentModelIds, models.defaultModelIds);
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
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const handleToggleModel = (modelId: string) => {
    if (models == null) return;
    const next = currentModelIds.includes(modelId)
      ? currentModelIds.filter((id) => id !== modelId)
      : [...currentModelIds, modelId];
    models.onChange(next);
  };

  useEffect(() => {
    if (!isOpen || models == null) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (modelPickerRef.current?.contains(target) || modelMenuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <section className={cn('sticky top-14 z-40 overflow-visible border-b border-gray-200 bg-[#FDFBF7]/95 backdrop-blur', className)}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 overflow-visible px-4 py-3">
        <ContextField label={domain.label ?? 'Domain'} className="flex-1 min-w-[14rem]">
          <Select
            ariaLabel={domain.label ?? 'Domain'}
            value={domain.value}
            onChange={domain.onChange}
            options={domain.options}
            disabled={domain.disabled}
            size="sm"
            className="w-full min-w-0"
          />
        </ContextField>

        <ContextField label={signature.label ?? 'Signature'} className="flex-1 min-w-[14rem]">
          <Select
            ariaLabel={signature.label ?? 'Signature'}
            value={signature.value}
            onChange={signature.onChange}
            options={signature.options}
            disabled={signature.disabled}
            size="sm"
            className="w-full min-w-0"
          />
        </ContextField>

        {models != null && (
          <div className="ml-auto flex min-w-[14rem] flex-1 items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-gray-700">{models.label ?? 'Models'}</span>
            <div ref={modelPickerRef} className="relative min-w-0 flex-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsOpen((value) => !value)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-label={`${models.label ?? 'Models'}: ${modelSummary}`}
                className={cn(
                  selectTriggerVariants({ size: 'sm' }),
                  'w-full min-w-0 justify-between text-left focus:ring-teal-500 focus:border-teal-500 focus:ring-offset-0',
                  availableModelIds.length === 0 && 'text-gray-400',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{modelSummary}</span>
                <ChevronDown className={cn('ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
              </Button>

              {isOpen && (
                <div
                  ref={modelMenuRef}
                  className="absolute right-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
                >
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
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
