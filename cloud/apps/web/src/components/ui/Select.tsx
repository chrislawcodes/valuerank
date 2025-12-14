import type { ReactNode, KeyboardEvent } from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const selectTriggerVariants = cva(
  // Base styles for trigger button - includes min-h-[44px] for mobile touch targets
  'inline-flex items-center justify-between w-full px-3 py-2 text-left bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 min-h-[44px] sm:min-h-0',
  {
    variants: {
      variant: {
        default: 'border-gray-300 hover:border-gray-400 focus:ring-teal-500 focus:border-teal-500',
        error: 'border-red-500 focus:ring-red-500 focus:border-red-500',
      },
      size: {
        sm: 'text-sm py-1.5',
        md: 'text-base py-2',
        lg: 'text-lg py-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export type SelectOption<T = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export type SelectProps<T = string> = VariantProps<typeof selectTriggerVariants> & {
  options: SelectOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  /** Render custom option content */
  renderOption?: (option: SelectOption<T>, isSelected: boolean) => ReactNode;
};

export function Select<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  variant,
  size,
  className,
  label,
  error,
  renderOption,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listboxRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            const option = options[highlightedIndex];
            if (option && !option.disabled) {
              onChange(option.value);
              setIsOpen(false);
            }
          } else {
            setIsOpen(true);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) => {
              let next = prev + 1;
              while (next < options.length && options[next]?.disabled) {
                next++;
              }
              return next < options.length ? next : prev;
            });
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => {
              let next = prev - 1;
              while (next >= 0 && options[next]?.disabled) {
                next--;
              }
              return next >= 0 ? next : prev;
            });
          }
          break;

        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;

        case 'Home':
          e.preventDefault();
          if (isOpen) {
            const firstEnabled = options.findIndex((opt) => !opt.disabled);
            if (firstEnabled >= 0) setHighlightedIndex(firstEnabled);
          }
          break;

        case 'End':
          e.preventDefault();
          if (isOpen) {
            for (let i = options.length - 1; i >= 0; i--) {
              if (!options[i]?.disabled) {
                setHighlightedIndex(i);
                break;
              }
            }
          }
          break;
      }
    },
    [disabled, isOpen, highlightedIndex, options, onChange]
  );

  const handleOptionClick = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const listboxId = `select-listbox-${label?.replace(/\s+/g, '-').toLowerCase() || 'default'}`;

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {/* Trigger button */}
      {/* eslint-disable-next-line react/forbid-elements */}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          selectTriggerVariants({ variant: error ? 'error' : variant, size }),
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50'
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown as unknown as React.KeyboardEventHandler<HTMLButtonElement>}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? `${listboxId}-label` : undefined}
        aria-controls={isOpen ? listboxId : undefined}
      >
        <span className={cn(!selectedOption && 'text-gray-400')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto py-1"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;

            return (
              <li
                key={String(option.value)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                className={cn(
                  'relative px-3 py-2 cursor-pointer select-none',
                  isHighlighted && 'bg-teal-50',
                  isSelected && 'bg-teal-100 text-teal-900',
                  option.disabled && 'opacity-50 cursor-not-allowed',
                  !option.disabled && !isHighlighted && !isSelected && 'hover:bg-gray-50'
                )}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
              >
                {renderOption ? (
                  renderOption(option, isSelected)
                ) : (
                  <div className="flex items-center justify-between">
                    <span>{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 text-teal-600" />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

export { selectTriggerVariants };
