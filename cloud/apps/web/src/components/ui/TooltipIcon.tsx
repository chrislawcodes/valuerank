import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

type Props = {
  ariaLabel: string;
  content: string | ReactNode;
};

/**
 * Icon-only tooltip control. Use this when the surrounding context already renders
 * the column/cell label text (e.g., inside a sortable header button) and you only
 * need the ⓘ tooltip trigger. Mirror of HeaderTooltip without the leading label span.
 */
export function TooltipIcon({ ariaLabel, content }: Props) {
  return (
    <Tooltip
      content={<div className="max-w-[280px] whitespace-normal text-xs leading-5">{content}</div>}
      position="top"
      variant="light"
      className="max-w-[280px] whitespace-normal"
    >
      {/* eslint-disable-next-line react/forbid-elements -- Lightweight tooltip trigger requires an inline button */}
      <button
        type="button"
        className="inline-flex cursor-help rounded-sm text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
