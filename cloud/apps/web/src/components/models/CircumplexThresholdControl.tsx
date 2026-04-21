import { Input } from '../ui/Input';

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function CircumplexThresholdControl({ value, onChange }: Props) {
  return (
    <Input
      type="number"
      min={1}
      step={1}
      label="Minimum trials per value"
      value={String(value)}
      onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 1)}
      helperText="Values below the threshold are excluded from the picker."
      className="max-w-[220px]"
    />
  );
}
