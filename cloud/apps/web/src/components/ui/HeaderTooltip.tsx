import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
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
        {/* eslint-disable-next-line react/forbid-elements -- Lightweight tooltip trigger requires an inline button */}
        <button
          type="button"
          className="inline-flex cursor-help rounded-sm text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-label={`Show ${labelText} help`}
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
    </span>
  );
}
