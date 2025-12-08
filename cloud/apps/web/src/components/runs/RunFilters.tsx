/**
 * RunFilters Component
 *
 * Filter controls for the runs list.
 */

import type { RunStatus } from '../../api/operations/runs';

type StatusOption = {
  value: RunStatus | '';
  label: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: '', label: 'All Statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'SUMMARIZING', label: 'Summarizing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

type RunFiltersProps = {
  status: string;
  onStatusChange: (status: string) => void;
};

export function RunFilters({ status, onStatusChange }: RunFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="status-filter" className="text-sm text-gray-600">
          Status:
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
