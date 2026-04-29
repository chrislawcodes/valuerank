import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button } from './Button';
import { Tooltip } from './Tooltip';

type Props = {
  label: ReactNode;
  content: string | ReactNode;
};

export function HeaderTooltip({ label, content }: Props) {
  const labelText = typeof label === 'string' || typeof label === 'number' ? String(label) : 'header';

  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip
        content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{content}</div>}
        position="top"
        variant="light"
        className="max-w-[280px] whitespace-normal"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-auto min-h-0 w-auto min-w-0 rounded-sm p-0 text-gray-400 transition-colors hover:bg-transparent hover:text-gray-600 focus:ring-blue-500 focus:ring-offset-1"
          aria-label={`Show ${labelText} help`}
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </Tooltip>
    </span>
  );
}
