import { useMemo, useState } from 'react';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import type { CircumplexInsufficientModel, CircumplexResult } from '../../api/operations/circumplex';

type Props = {
  eligible: CircumplexResult[];
  insufficient: CircumplexInsufficientModel[];
  selectedModelIds: string[];
  onToggle: (modelId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  signatureOptions: Array<{ value: string; label: string }>;
  selectedSignature: string;
  onSignatureChange: (value: string) => void;
  asSection?: boolean;
};

function trialsLabel(model: CircumplexInsufficientModel): string {
  const values = model.trialsPerValue.map((entry) => entry.trials);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (model.reason === 'no_transcripts_for_signature') return 'No data';
  if (model.reason === 'missing_values') return `Missing values · n=${total}`;
  return `Below threshold · n=${total}`;
}

export function CircumplexModelPicker({
  eligible,
  insufficient,
  selectedModelIds,
  onToggle,
  onSelectAll,
  onClear,
  signatureOptions,
  selectedSignature,
  onSignatureChange,
  asSection = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const allSelected = eligible.length > 0 && selectedModelIds.length === eligible.length;
  const anySelected = selectedModelIds.length > 0;
  const selectedLabels = useMemo(
    () => eligible
      .filter((model) => selectedModelIds.includes(model.modelId))
      .map((model) => model.modelLabel),
    [eligible, selectedModelIds],
  );
  const summary = selectedLabels.length === 0
    ? 'No models selected'
    : selectedLabels.length === 1
      ? selectedLabels[0] ?? '1 model selected'
      : `${selectedLabels.length} selected: ${selectedLabels.slice(0, 2).join(', ')}${selectedLabels.length > 2 ? ', ...' : ''}`;

  const Wrapper = asSection ? 'section' : 'div';

  return (
    <Wrapper className={asSection ? 'rounded-xl border border-gray-200 bg-white p-4 md:p-5' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Models</h2>
          <p className="text-sm text-gray-600">Open the picker to add or remove circumplex cards.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="sm">{eligible.length} eligible</Badge>
          {insufficient.length > 0 && <Badge variant="warning" size="sm">{insufficient.length} hidden</Badge>}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">Model details</div>
          <div className="mt-1 truncate text-sm text-gray-600">{summary}</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-600">Select one or more eligible models to compare their circumplex fit.</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={allSelected || eligible.length === 0}
                onClick={onSelectAll}
                className="text-xs"
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!anySelected}
                onClick={onClear}
                className="text-xs"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {eligible.map((model) => {
              const selected = selectedModelIds.includes(model.modelId);
              return (
                <Button
                  key={model.modelId}
                  type="button"
                  variant={selected ? 'secondary' : 'ghost'}
                  className={`justify-start border px-3 py-2 text-left ${selected ? 'border-teal-300 bg-teal-50 text-teal-950' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
                  onClick={() => onToggle(model.modelId)}
                >
                  <Check className={`mr-2 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="truncate">
                    <span className="font-medium">{model.modelLabel}</span>
                    <span className="ml-2 text-xs text-gray-500">{model.providerName}</span>
                  </span>
                </Button>
              );
            })}
          </div>

          {insufficient.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Lock className="h-4 w-4" />
                Hidden from selection
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {insufficient.map((model) => (
                  <div key={model.modelId} className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-800">{model.modelLabel}</div>
                        <div className="text-xs text-gray-500">{model.providerName}</div>
                      </div>
                      <Badge variant="warning" size="sm">{model.reason.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{trialsLabel(model)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[220px]">
                <Select
                  label="Signature"
                  options={signatureOptions}
                  value={selectedSignature}
                  onChange={onSignatureChange}
                  placeholder="Select signature"
                />
              </div>
              <p className="text-xs text-gray-500">
                Analysis is shown for signature <span className="font-medium text-gray-700">{selectedSignature}</span>.
              </p>
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  );
}
