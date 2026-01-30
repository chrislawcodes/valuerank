/**
 * Definition Groups Visualization (3+ runs)
 *
 * Shows card layout grouping runs by definition when more than 2 runs
 * are selected. Each card shows definition info and which runs use it.
 */

import { useMemo } from 'react';
import { FileText, Users } from 'lucide-react';
import type { RunWithAnalysis } from '../types';
import { formatRunNameShort } from '../../../lib/format';

type DefinitionGroupsProps = {
  runs: RunWithAnalysis[];
};

/**
 * Group of runs sharing the same definition
 */
type DefinitionGroup = {
  definitionId: string;
  definitionName: string;
  template: string;
  preamble: string | null;
  runs: Array<{ id: string; name: string }>;
};

/**
 * Maximum characters to show in template preview
 */
const PREVIEW_MAX_LENGTH = 300;

/**
 * Truncate text for preview
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Group runs by their definition ID
 */
function groupRunsByDefinition(runs: RunWithAnalysis[]): DefinitionGroup[] {
  const groupMap = new Map<string, DefinitionGroup>();

  for (const run of runs) {
    const defId = run.definition?.id ?? 'unknown';
    const defName = run.definition?.name ?? 'Unknown Definition';

    const existing = groupMap.get(defId);
    if (existing) {
      existing.runs.push({
        id: run.id,
        name: formatRunNameShort(run),
      });
    } else {
      groupMap.set(defId, {
        definitionId: defId,
        definitionName: defName,
        template: run.definitionContent?.template ?? '(No template)',
        preamble: run.definitionContent?.preamble ?? null,
        runs: [
          {
            id: run.id,
            name: formatRunNameShort(run),
          },
        ],
      });
    }
  }

  // Sort by number of runs (descending) then by name
  return Array.from(groupMap.values()).sort((a, b) => {
    if (b.runs.length !== a.runs.length) {
      return b.runs.length - a.runs.length;
    }
    return a.definitionName.localeCompare(b.definitionName);
  });
}

/**
 * Single definition card component
 */
function DefinitionCard({ group }: { group: DefinitionGroup }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <h3 className="font-medium text-gray-900 truncate" title={group.definitionName}>
              {group.definitionName}
            </h3>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-500 flex-shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span>{group.runs.length} run{group.runs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Run badges */}
        <div className="flex flex-wrap gap-1.5">
          {group.runs.map((run) => (
            <span
              key={run.id}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800"
              title={run.name}
            >
              {run.name}
            </span>
          ))}
        </div>

        {/* Template preview */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Template Preview</div>
          <div className="text-sm text-gray-600 font-mono bg-gray-50 rounded p-2 whitespace-pre-wrap break-words">
            {truncateText(group.template, PREVIEW_MAX_LENGTH)}
          </div>
        </div>

        {/* Preamble indicator */}
        {group.preamble && (
          <div className="text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />
              Has preamble ({group.preamble.length} chars)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Definition groups visualization for 3+ runs
 */
export function DefinitionGroups({ runs }: DefinitionGroupsProps) {
  const groups = useMemo(() => groupRunsByDefinition(runs), [runs]);

  const uniqueDefinitions = groups.length;
  const totalRuns = runs.length;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">
              {uniqueDefinitions} vignette{uniqueDefinitions !== 1 ? 's' : ''} across {totalRuns} runs
            </div>
            <div className="text-sm text-gray-500">
              {uniqueDefinitions === 1
                ? 'All selected runs use the same vignette'
                : 'Select exactly 2 runs to see a detailed diff view'}
            </div>
          </div>
        </div>
      </div>

      {/* Definition cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <DefinitionCard key={group.definitionId} group={group} />
        ))}
      </div>
    </div>
  );
}
