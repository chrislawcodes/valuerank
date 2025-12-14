/**
 * Definition Header
 *
 * Header section with back button and action buttons (export, delete, fork, edit, run).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, GitBranch, Play, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ExportButton } from '../../components/export/ExportButton';

type DefinitionHeaderProps = {
  definitionId: string;
  scenarioCount: number;
  onEdit: () => void;
  onFork: () => void;
  onDelete: () => void;
  onStartRun: () => void;
};

export function DefinitionHeader({
  definitionId,
  scenarioCount,
  onEdit,
  onFork,
  onDelete,
  onStartRun,
}: DefinitionHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <ExportButton definitionId={definitionId} hasScenarios={scenarioCount > 0} />
        <Button
          variant="ghost"
          onClick={onDelete}
          className="text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
        <Button variant="secondary" onClick={onFork}>
          <GitBranch className="w-4 h-4 mr-2" />
          Fork
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
        <Button variant="primary" onClick={onStartRun} disabled={scenarioCount === 0}>
          <Play className="w-4 h-4 mr-2" />
          Start Run
        </Button>
      </div>
    </div>
  );
}
