/**
 * ScenarioCard Component
 *
 * Displays a single scenario with expandable content.
 * Extracted from ExpandedScenarios for file size reduction.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Scenario, ScenarioContent } from '../../../api/operations/scenarios';

function formatDimensions(content: ScenarioContent): string[] {
  if (!content.dimensions) return [];
  return Object.entries(content.dimensions).map(
    ([key, value]) => `${key}: ${value}`
  );
}

export type ScenarioCardProps = {
  scenario: Scenario;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
};

export function ScenarioCard({ scenario, index, isExpanded, onToggle }: ScenarioCardProps) {
  const content = scenario.content;
  const dimensions = formatDimensions(content);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      {/* eslint-disable-next-line react/forbid-elements -- Accordion button requires custom full-width layout */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="font-medium text-gray-700">
          {scenario.name || `Narrative ${index + 1}`}
        </span>
        <div className="flex items-center gap-2">
          {dimensions.length > 0 && (
            <span className="text-xs text-gray-500 truncate max-w-[300px]">
              {dimensions.slice(0, 2).join(', ')}
              {dimensions.length > 2 && ` +${dimensions.length - 2} more`}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Dimension values */}
          {dimensions.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Dimension Values</p>
              <div className="flex flex-wrap gap-2">
                {dimensions.map((dim) => (
                  <span
                    key={dim}
                    className="inline-flex items-center px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-full"
                  >
                    {dim}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preamble */}
          {content.preamble && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Preamble</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900 whitespace-pre-wrap font-mono">
                  {content.preamble}
                </p>
              </div>
            </div>
          )}

          {/* Prompt */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Prompt</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {content.prompt}
              </p>
            </div>
          </div>

          {/* Followups */}
          {content.followups && content.followups.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Followups ({content.followups.length})</p>
              <div className="space-y-2">
                {content.followups.map((followup, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-medium mb-1">
                      {followup.label || `Followup ${idx + 1}`}
                    </p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">
                      {followup.prompt}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>ID: {scenario.id}</span>
            <span className="mx-2">|</span>
            <span>Created: {new Date(scenario.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
