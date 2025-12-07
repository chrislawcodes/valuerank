import { useState } from 'react';
import { Eye, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useScenarioPreview, type PreviewScenario } from '../../hooks/useScenarioPreview';
import type { DefinitionContent } from '../../api/operations/definitions';
import { Button } from '../ui/Button';

type ScenarioPreviewProps = {
  content: DefinitionContent | null;
  maxSamples?: number;
  className?: string;
};

type ScenarioCardProps = {
  scenario: PreviewScenario;
  isExpanded: boolean;
  onToggle: () => void;
};

function ScenarioCard({ scenario, isExpanded, onToggle }: ScenarioCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="font-medium text-gray-700">
          Scenario {scenario.id}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {scenario.dimensionValues
              .map((dv) => `${dv.name}: ${dv.level.label}`)
              .join(', ')}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Dimension values */}
          <div className="flex flex-wrap gap-2">
            {scenario.dimensionValues.map((dv) => (
              <span
                key={dv.name}
                className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-full"
              >
                <span className="font-medium">{dv.name}:</span>
                <span>{dv.level.label}</span>
                <span className="text-teal-600">({dv.level.score})</span>
              </span>
            ))}
          </div>

          {/* Filled template */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {scenario.filledTemplate}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScenarioPreview({
  content,
  maxSamples = 10,
  className = '',
}: ScenarioPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { scenarios, totalCount, displayedCount, error } = useScenarioPreview(
    content,
    maxSamples
  );

  return (
    <div className={className}>
      {/* Preview button */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!!error && !content}
      >
        <Eye className="w-4 h-4 mr-2" />
        Preview Scenarios
        {totalCount > 0 && (
          <span className="ml-2 px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">
            {totalCount}
          </span>
        )}
      </Button>

      {/* Preview panel */}
      {isOpen && (
        <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Scenario Preview
            </h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Cannot generate preview</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Scenarios */}
          {!error && scenarios.length > 0 && (
            <>
              {/* Summary */}
              <p className="text-sm text-gray-500 mb-4">
                Showing {displayedCount} of {totalCount} possible scenario
                {totalCount !== 1 ? 's' : ''}
                {totalCount > displayedCount && (
                  <span className="text-gray-400">
                    {' '}
                    (first {displayedCount} combinations)
                  </span>
                )}
              </p>

              {/* Scenario list */}
              <div className="space-y-2">
                {scenarios.map((scenario) => (
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    isExpanded={expandedId === scenario.id}
                    onToggle={() =>
                      setExpandedId(
                        expandedId === scenario.id ? null : scenario.id
                      )
                    }
                  />
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {!error && scenarios.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Add dimensions with levels to preview scenarios
            </p>
          )}
        </div>
      )}
    </div>
  );
}
