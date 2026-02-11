/**
 * Definition Header
 *
 * Header section with back button and action buttons (export, delete, fork, edit, run).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, GitBranch, Play, Trash2, Unlink2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ExportButton } from '../../components/export/ExportButton';

type DefinitionHeaderProps = {
  definitionId: string;
  scenarioCount: number;
  isForked: boolean;
  isUnforking: boolean;
  onEdit: () => void;
  onFork: () => void;
  onUnfork: () => void;
  onDelete: () => void;
  onStartRun: () => void;
};

export function DefinitionHeader({
  definitionId,
  scenarioCount,
  isForked,
  isUnforking,
  onEdit,
  onFork,
  onUnfork,
  onDelete,
  onStartRun,
}: DefinitionHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
        <ArrowLeft className="w-4 h-4 sm:mr-1" />
        <span className="hidden sm:inline">Back</span>
      </Button>
      <div className="flex items-center gap-1 sm:gap-2">
        <ExportButton definitionId={definitionId} hasScenarios={scenarioCount > 0} />
        <Button
          variant="ghost"
          onClick={onDelete}
          className="text-red-600 hover:bg-red-50"
          title="Delete"
        >
          <Trash2 className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
        <Button variant="secondary" onClick={onFork} title="Fork">
          <GitBranch className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Fork</span>
        </Button>
        {isForked && (
          <Button variant="secondary" onClick={onUnfork} isLoading={isUnforking} title="Unfork">
            <Unlink2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Unfork</span>
          </Button>
        )}
        <Button variant="secondary" onClick={onEdit} title="Edit">
          <Edit className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button variant="primary" onClick={onStartRun} disabled={scenarioCount === 0} title="Start Trial">
          <Play className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Start Trial</span>
        </Button>
      </div>
    </div>
  );
}
