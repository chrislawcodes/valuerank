import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { selectTriggerVariants } from './Select';

export type ChipPickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type ChipPickerAction = {
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
};

type ChipPickerProps = {
  summary: string;
  options: ChipPickerOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  actions?: ChipPickerAction[];
  disabled?: boolean;
  ariaLabel: string;
  emptyMessage?: string;
  /** When true, clicking a chip selects only that item; clicking the active chip does nothing. */
  singleSelect?: boolean;
};

export function ChipPicker({
  summary,
  options,
  selectedIds,
  onChange,
  actions,
  disabled,
  ariaLabel,
  emptyMessage = 'No options available.',
  singleSelect = false,
}: ChipPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = (value: string) => {
    if (singleSelect) {
      if (!selectedIds.includes(value)) onChange([value]);
      return;
    }
    const next = selectedIds.includes(value)
      ? selectedIds.filter((id) => id !== value)
      : [...selectedIds, value];
    onChange(next);
  };

  return (
    <div ref={triggerRef} className="relative min-w-0 flex-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${summary}`}
        className={cn(
          selectTriggerVariants({ size: 'sm' }),
          'w-full min-w-0 justify-between text-left focus:ring-teal-500 focus:border-teal-500 focus:ring-offset-0',
          options.length === 0 && 'text-gray-400',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown className={cn('ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
          {actions != null && actions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    'min-h-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    action.isActive
                      ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:bg-white hover:text-teal-700',
                  )}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {options.length === 0 ? (
            <p className="text-xs text-gray-500">{emptyMessage}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => {
                const isSelected = selectedIds.includes(option.value);
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(option.value)}
                    disabled={option.disabled}
                    title={option.label}
                    className={cn(
                      'min-h-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      isSelected
                        ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:bg-white hover:text-teal-700',
                    )}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
