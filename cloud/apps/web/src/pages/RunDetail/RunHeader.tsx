/**
 * Run Header
 *
 * Header section with back button and run controls (re-run, delete, pause/resume/cancel).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { RunControls } from '../../components/runs/RunControls';
import type { RunStatus } from '../../api/operations/runs';

type RunHeaderProps = {
  runId: string;
  status: RunStatus;
  isTerminal: boolean;
  onPause: (runId: string) => Promise<void>;
  onResume: (runId: string) => Promise<void>;
  onCancel: (runId: string) => Promise<void>;
  onRerun: () => void;
  onDelete: () => void;
};

export function RunHeader({
  runId,
  status,
  isTerminal,
  onPause,
  onResume,
  onCancel,
  onRerun,
  onDelete,
}: RunHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Runs
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {/* Re-run button - shown for terminal states */}
        {isTerminal && (
          <Button variant="secondary" onClick={onRerun}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-run
          </Button>
        )}
        {/* Delete button - shown for terminal states */}
        {isTerminal && (
          <Button
            variant="ghost"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        )}
        {/* Run controls - shown for non-terminal states */}
        <RunControls
          runId={runId}
          status={status}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
