import { useState, useEffect, useRef } from 'react';

interface OptionsInputProps {
  value: string[];
  onChange: (options: string[]) => void;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function OptionsInput({ value, onChange, className, placeholder, onFocus, onBlur }: OptionsInputProps) {
  const [localValue, setLocalValue] = useState(value.join(', '));
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setLocalValue(value.join(', '));
  }, [value]);

  const commitValue = () => {
    const parsed = localValue
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o);
    onChange(parsed);
  };

  const handleBlur = () => {
    commitValue();
    onBlur?.();
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={onFocus}
      onBlur={handleBlur}
      onKeyDown={(e) => e.key === 'Enter' && commitValue()}
      className={className}
      placeholder={placeholder}
    />
  );
}
