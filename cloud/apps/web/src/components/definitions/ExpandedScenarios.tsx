/**
 * ExpandedScenarios Component
 *
 * Displays the list of generated scenarios for a definition.
 * Allows viewing, refreshing, and regenerating scenarios.
 */

import { useState, useEffect, useRef } from 'react';
import { useMutation } from 'urql';
import { ChevronDown, ChevronUp, Database, RefreshCw, RotateCcw, AlertCircle, StopCircle } from 'lucide-react';
import { useExpandedScenarios } from '../../hooks/useExpandedScenarios';
import {
  type ExpansionStatus,
  REGENERATE_SCENARIOS_MUTATION,
  type RegenerateScenariosResult,
  CANCEL_SCENARIO_EXPANSION_MUTATION,
  type CancelScenarioExpansionResult,
} from '../../api/operations/definitions';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { ScenarioCard, ExpansionStatusBadge } from './scenarios';

type ExpandedScenariosProps = {
  definitionId: string;
  expansionStatus?: ExpansionStatus;
  onRegenerateTriggered?: () => void;
  className?: string;
};

export function ExpandedScenarios({ definitionId, expansionStatus, onRegenerateTriggered, className = '' }: ExpandedScenariosProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { scenarios, totalCount, loading, error, refetch } = useExpandedScenarios({
    definitionId,
    pause: !isOpen,
  });

  const [{ fetching: regenerating }, executeRegenerate] = useMutation<RegenerateScenariosResult>(REGENERATE_SCENARIOS_MUTATION);
  const [{ fetching: cancelling }, executeCancel] = useMutation<CancelScenarioExpansionResult>(CANCEL_SCENARIO_EXPANSION_MUTATION);

  const handleRegenerate = async () => {
    const result = await executeRegenerate({ definitionId });
    if (!result.error && result.data?.regenerateScenarios.queued) {
      // Notify parent to start polling for status updates
      onRegenerateTriggered?.();
    }
  };

  const handleCancel = async () => {
    const result = await executeCancel({ definitionId });
    if (!result.error) {
      // Notify parent to refresh status
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
            {isExpanding ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                title="Cancel scenario expansion"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <StopCircle className={`w-4 h-4 mr-1 ${cancelling ? 'animate-pulse' : ''}`} />
                Cancel
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={loading || regenerating}
                title="Regenerate all scenarios using LLM"
              >
                <RotateCcw className={`w-4 h-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            )}
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
