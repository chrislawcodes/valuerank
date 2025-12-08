import { useState, useEffect, useRef } from 'react';
import { useMutation } from 'urql';
import { ChevronDown, ChevronUp, Database, RefreshCw, RotateCcw, AlertCircle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useExpandedScenarios } from '../../hooks/useExpandedScenarios';
import type { Scenario, ScenarioContent } from '../../api/operations/scenarios';
import {
  type ExpansionStatus,
  REGENERATE_SCENARIOS_MUTATION,
  type RegenerateScenariosResult,
} from '../../api/operations/definitions';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';

type ExpandedScenariosProps = {
  definitionId: string;
  expansionStatus?: ExpansionStatus;
  onRegenerateTriggered?: () => void;
  className?: string;
};

type ScenarioCardProps = {
  scenario: Scenario;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
};

function formatDimensions(content: ScenarioContent): string[] {
  if (!content.dimensions) return [];
  return Object.entries(content.dimensions).map(
    ([key, value]) => `${key}: ${value}`
  );
}

function ScenarioCard({ scenario, index, isExpanded, onToggle }: ScenarioCardProps) {
  const content = scenario.content as ScenarioContent;
  const dimensions = formatDimensions(content);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="font-medium text-gray-700">
          {scenario.name || `Scenario ${index + 1}`}
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

function ExpansionStatusBadge({ status, scenarioCount }: { status?: ExpansionStatus; scenarioCount?: number }) {
  const isExpanding = status?.status === 'PENDING' || status?.status === 'ACTIVE';
  const isCompleted = status?.status === 'COMPLETED';
  const isFailed = status?.status === 'FAILED';

  if (isExpanding) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Generating...
      </span>
    );
  }

  if (isFailed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs" title={status?.error || 'Unknown error'}>
        <XCircle className="w-3 h-3" />
        Failed
      </span>
    );
  }

  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Ready
      </span>
    );
  }

  // No job or status is 'NONE' - show count or nothing
  if (scenarioCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
        <AlertCircle className="w-3 h-3" />
        No scenarios
      </span>
    );
  }

  return null;
}

export function ExpandedScenarios({ definitionId, expansionStatus, onRegenerateTriggered, className = '' }: ExpandedScenariosProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { scenarios, totalCount, loading, error, refetch } = useExpandedScenarios({
    definitionId,
    pause: !isOpen,
  });

  const [{ fetching: regenerating }, executeRegenerate] = useMutation<RegenerateScenariosResult>(REGENERATE_SCENARIOS_MUTATION);

  const handleRegenerate = async () => {
    const result = await executeRegenerate({ definitionId });
    if (!result.error && result.data?.regenerateScenarios.queued) {
      // Notify parent to start polling for status updates
      onRegenerateTriggered?.();
    }
  };

  // Track previous expansion state to detect when it completes
  const isExpanding = expansionStatus?.status === 'PENDING' || expansionStatus?.status === 'ACTIVE';
  const wasExpandingRef = useRef(isExpanding);

  // Auto-refresh when expansion completes (transition from expanding -> not expanding)
  useEffect(() => {
    if (wasExpandingRef.current && !isExpanding && isOpen) {
      // Expansion just completed, refresh scenarios
      refetch();
    }
    wasExpandingRef.current = isExpanding;
  }, [isExpanding, isOpen, refetch]);

  // Auto-refresh while expanding
  useEffect(() => {
    if (isExpanding && isOpen) {
      const interval = setInterval(() => {
        refetch();
      }, 3000); // Poll every 3 seconds
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isExpanding, isOpen, refetch]);

  const handleToggleScenario = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Database className="w-4 h-4" />
          <span>Database Scenarios</span>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
              {totalCount}
            </span>
          )}
          <ExpansionStatusBadge status={expansionStatus} scenarioCount={totalCount} />
          {isOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {isOpen && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
              disabled={loading || isExpanding || regenerating}
              title="Regenerate all scenarios using LLM"
            >
              <RotateCcw className={`w-4 h-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={loading || isExpanding}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="space-y-3">
          {loading && scenarios.length === 0 && (
            <Loading text="Loading scenarios..." />
          )}

          {error && (
            <ErrorMessage message={error.message} onRetry={() => refetch()} />
          )}

          {!loading && !error && scenarios.length === 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 text-gray-600">
                <AlertCircle className="w-4 h-4" />
                <p className="text-sm">
                  No scenarios found. Generate scenarios by saving this definition.
                </p>
              </div>
            </div>
          )}

          {scenarios.map((scenario, index) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              index={index}
              isExpanded={expandedId === scenario.id}
              onToggle={() => handleToggleScenario(scenario.id)}
            />
          ))}

          {totalCount > scenarios.length && (
            <p className="text-sm text-gray-500 text-center py-2">
              Showing {scenarios.length} of {totalCount} scenarios
            </p>
          )}
        </div>
      )}
    </div>
  );
}
