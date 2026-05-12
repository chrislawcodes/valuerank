import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ChipPicker, type ChipPickerAction, type ChipPickerOption } from '../ui/ChipPicker';

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ModelOption = Option & {
  isDefault?: boolean;
};

type DomainSingleProp = {
  label?: string;
  multi?: never;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

type DomainMultiProp = {
  label?: string;
  multi: true;
  summary: string;
  selectedIds: string[];
  options: ChipPickerOption[];
  onChange: (ids: string[]) => void;
  actions?: ChipPickerAction[];
  disabled?: boolean;
  singleSelect?: boolean;
};

function isMultiDomain(domain: DomainSingleProp | DomainMultiProp): domain is DomainMultiProp {
  return domain.multi === true;
}

type AnalysisContextBarProps = {
  domain: DomainSingleProp | DomainMultiProp;
  signature: {
    label?: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    disabled?: boolean;
  };
  winRateMode?: {
    value: 'all' | 'exc-neutral';
    onChange: (mode: 'all' | 'exc-neutral') => void;
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
  children: React.ReactNode;
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
  winRateMode,
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

  return (
    <section className={cn('sticky top-14 z-40 overflow-visible border-b border-gray-200 bg-[#FDFBF7]/95 backdrop-blur', className)}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 overflow-visible px-4 py-3">
        <ContextField label={domain.label ?? 'Domain'} className="flex-1 min-w-[14rem]">
          {isMultiDomain(domain) ? (
            <ChipPicker
              ariaLabel={domain.label ?? 'Domain'}
              summary={domain.summary}
              selectedIds={domain.selectedIds}
              options={domain.options}
              onChange={domain.onChange}
              actions={domain.actions}
              disabled={domain.disabled}
              singleSelect={domain.singleSelect}
              emptyMessage="No domains available."
            />
          ) : (
            <Select
              ariaLabel={domain.label ?? 'Domain'}
              value={domain.value}
              onChange={domain.onChange}
              options={domain.options}
              disabled={domain.disabled}
              size="sm"
              className="w-full min-w-0"
            />
          )}
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
            <ChipPicker
              ariaLabel={models.label ?? 'Models'}
              summary={modelSummary}
              selectedIds={currentModelIds}
              options={models.options}
              onChange={models.onChange}
              actions={[
                {
                  label: 'Default Models',
                  isActive: isDefaultSelection,
                  onClick: () => models.onChange([...models.defaultModelIds]),
                },
                {
                  label: 'Clear all',
                  isActive: false,
                  onClick: () => models.onChange([]),
                  disabled: currentModelIds.length === 0,
                },
              ]}
              emptyMessage="No active models are available yet."
            />
          </div>
        )}

        {winRateMode != null && (
          <ContextField label="Win rate">
            <div className="flex gap-1">
              {(['all', 'exc-neutral'] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (winRateMode.disabled !== true) winRateMode.onChange(mode); }}
                  disabled={winRateMode.disabled === true}
                  title={winRateMode.disabled === true ? 'Only applies when data source is Win Rate' : undefined}
                  className={cn(
                    'rounded px-2 py-0.5 text-sm font-medium transition-colors',
                    winRateMode.value === mode
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    winRateMode.disabled === true && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {mode === 'all' ? 'All responses' : 'Exc. neutral'}
                </Button>
              ))}
            </div>
          </ContextField>
        )}
      </div>
    </section>
  );
}
