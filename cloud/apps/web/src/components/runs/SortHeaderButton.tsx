/**
 * Sort header button and tooltip trigger for TranscriptList.
 * Extracted from TranscriptList.tsx to keep file sizes under 400 lines.
 */

import { Info } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import type { SortDirection } from './transcriptListSort';

export function SortHeaderButton({
  label,
  ariaLabel,
  tooltip,
  onClick,
  active,
  direction,
}: {
  label: string;
  ariaLabel: string;
  tooltip?: string;
  onClick: () => void;
  active: boolean;
  direction: SortDirection;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line react/forbid-elements -- Sortable table headers need a semantic inline button control */}
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-left transition-colors ${
          active ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'
        }`}
        aria-label={`Sort by ${ariaLabel}${active ? ` (${direction === 'asc' ? 'ascending' : 'descending'})` : ''}`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={`text-[11px] leading-none ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
      {tooltip ? <HeaderTooltipTrigger label={label} tooltip={tooltip} /> : null}
    </div>
  );
}

function HeaderTooltipTrigger({
  label,
  tooltip,
}: {
  label: string;
  tooltip?: string;
}) {
  if (!tooltip) {
    return null;
  }

  return (
    <Tooltip
      content={<div className="max-w-xs whitespace-normal text-xs leading-5">{tooltip}</div>}
      position="top"
      variant="light"
      className="max-w-xs whitespace-normal"
    >
      {/* eslint-disable-next-line react/forbid-elements -- Lightweight tooltip trigger requires a custom inline button */}
      <button
        type="button"
        className="inline-flex cursor-help text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-sm"
        aria-label={`${label}: ${tooltip}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
