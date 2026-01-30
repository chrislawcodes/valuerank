/**
 * Definition Visualization Orchestrator
 *
 * Routes to appropriate sub-component based on run count:
 * - 2 runs: DefinitionDiff (Monaco diff editor)
 * - 3+ runs: DefinitionGroups (card layout)
 * - 0-1 runs: Message to select more runs
 */

import { FileText } from 'lucide-react';
import type { ComparisonVisualizationProps } from '../types';
import { DefinitionDiff } from './DefinitionDiff';
import { DefinitionGroups } from './DefinitionGroups';

/**
 * Main definition visualization component
 */
export function DefinitionViz({ runs }: ComparisonVisualizationProps) {
  // Handle insufficient runs
  if (runs.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <FileText className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-600">Select at least 2 runs</p>
        <p className="text-gray-500 text-sm mt-1">
          Vignette comparison requires 2 or more runs
        </p>
      </div>
    );
  }

  // 2 runs: Show Monaco diff view
  if (runs.length === 2) {
    const [leftRun, rightRun] = runs;
    if (leftRun && rightRun) {
      return <DefinitionDiff leftRun={leftRun} rightRun={rightRun} />;
    }
  }

  // 3+ runs: Show grouped card view
  return <DefinitionGroups runs={runs} />;
}
