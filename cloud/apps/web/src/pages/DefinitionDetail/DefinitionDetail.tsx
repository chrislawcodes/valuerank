/**
 * Definition Detail Page
 *
 * Main page component for viewing, editing, and managing a definition.
 * Orchestrates sub-components for header, metadata, content, and modals.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from 'urql';
import { ArrowLeft, FileText, GitBranch } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { DefinitionEditor } from '../../components/definitions/DefinitionEditor';
import { ForkDialog } from '../../components/definitions/ForkDialog';
import { TagSelector } from '../../components/definitions/TagSelector';
import { VersionTree } from '../../components/definitions/VersionTree';
import { ExpandedScenarios } from '../../components/definitions/ExpandedScenarios';
import { useDefinition } from '../../hooks/useDefinition';
import { useDefinitionMutations } from '../../hooks/useDefinitionMutations';
import { useRunMutations } from '../../hooks/useRunMutations';
import { useExpandedScenarios } from '../../hooks/useExpandedScenarios';
import type { DefinitionContent } from '../../api/operations/definitions';
import type { StartRunInput } from '../../api/operations/runs';
import {
  ADD_TAG_TO_DEFINITION_MUTATION,
  REMOVE_TAG_FROM_DEFINITION_MUTATION,
  CREATE_AND_ASSIGN_TAG_MUTATION,
  type AddTagToDefinitionResult,
  type RemoveTagFromDefinitionResult,
  type CreateAndAssignTagResult,
} from '../../api/operations/tags';
import { DefinitionHeader } from './DefinitionHeader';
import { DefinitionMetadata } from './DefinitionMetadata';
import { DefinitionContentView } from './DefinitionContentView';
import { DeleteDefinitionModal } from './DeleteDefinitionModal';
import { RunFormModal } from './RunFormModal';

export function DefinitionDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isEditing, setIsEditing] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const isNewDefinition = id === 'new';

  const { definition, loading, error, refetch } = useDefinition({
    id: id || '',
    pause: isNewDefinition,
  });

  // Fetch scenario count for run form
  const { totalCount: scenarioCount } = useExpandedScenarios({
    definitionId: id || '',
    pause: isNewDefinition || !id,
    limit: 1,
  });

  const { startRun, loading: isStartingRun } = useRunMutations();

  // Poll for definition updates while expansion is in progress
  const isExpanding =
    definition?.expansionStatus?.status === 'PENDING' ||
    definition?.expansionStatus?.status === 'ACTIVE';

  useEffect(() => {
    if (isExpanding && !isNewDefinition && !isEditing) {
      const interval = setInterval(() => {
        refetch();
      }, 3000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isExpanding, isNewDefinition, isEditing, refetch]);

  const {
    createDefinition,
    updateDefinition,
    forkDefinition,
    deleteDefinition,
    isCreating,
    isUpdating,
    isForking,
    isDeleting,
  } = useDefinitionMutations();

  // Tag mutations
  const [, executeAddTag] = useMutation<AddTagToDefinitionResult>(ADD_TAG_TO_DEFINITION_MUTATION);
  const [, executeRemoveTag] = useMutation<RemoveTagFromDefinitionResult>(
    REMOVE_TAG_FROM_DEFINITION_MUTATION
  );
  const [, executeCreateAndAssignTag] = useMutation<CreateAndAssignTagResult>(
    CREATE_AND_ASSIGN_TAG_MUTATION
  );

  const handleTagAdd = async (tagId: string) => {
    if (!definition) return;
    const result = await executeAddTag({ definitionId: definition.id, tagId });
    if (!result.error) {
      refetch();
    }
  };

  const handleTagRemove = async (tagId: string) => {
    if (!definition) return;
    const result = await executeRemoveTag({ definitionId: definition.id, tagId });
    if (!result.error) {
      refetch();
    }
  };

  const handleTagCreate = async (tagName: string) => {
    if (!definition) return;
    const result = await executeCreateAndAssignTag({ definitionId: definition.id, tagName });
    if (result.error) {
      const message = result.error.graphQLErrors?.[0]?.message || result.error.message;
      alert(`Failed to create tag: ${message}`);
    } else {
      refetch();
    }
  };

  const handleSave = async (name: string, content: DefinitionContent, preambleVersionId?: string | null) => {
    if (isNewDefinition) {
      const newDefinition = await createDefinition({ name, content, preambleVersionId: preambleVersionId || undefined });
      navigate(`/definitions/${newDefinition.id}`, { replace: true });
    } else if (definition) {
      await updateDefinition(definition.id, { name, content, preambleVersionId });
      setIsEditing(false);
      refetch();
    }
  };

  const handleCancel = () => {
    if (isNewDefinition) {
      navigate('/definitions');
    } else {
      setIsEditing(false);
    }
  };

  const handleFork = async (newName: string) => {
    if (!definition) return;
    const forkedDefinition = await forkDefinition({
      parentId: definition.id,
      name: newName,
    });
    navigate(`/definitions/${forkedDefinition.id}`);
  };

  const handleDelete = async () => {
    if (!definition) return;
    try {
      await deleteDefinition(definition.id);
      setShowDeleteConfirm(false);
      navigate('/definitions');
    } catch (err) {
      setShowDeleteConfirm(false);
      console.error('Failed to delete definition:', err);
    }
  };

  const handleStartRun = async (input: StartRunInput) => {
    setRunError(null);
    try {
      const result = await startRun(input);
      setShowRunForm(false);
      navigate(`/runs/${result.run.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start run';
      setRunError(message);
      throw err;
    }
  };

  // Create mode
  if (isNewDefinition) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Vignettes
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-xl font-medium text-gray-900 mb-6">Create New Vignette</h1>

          <DefinitionEditor
            mode="create"
            onSave={handleSave}
            onCancel={handleCancel}
            isSaving={isCreating}
          />
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Loading size="lg" text="Loading vignette..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message={`Failed to load vignette: ${error.message}`} />
      </div>
    );
  }

  // Not found
  if (!definition) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message="Vignette not found" />
      </div>
    );
  }

  // Edit mode
  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Cancel Editing
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-xl font-medium text-gray-900 mb-6">Edit Vignette</h1>

          <DefinitionEditor
            mode="edit"
            initialName={definition.name}
            initialContent={definition.resolvedContent ?? definition.content}
            initialPreambleVersionId={definition.preambleVersionId}
            onSave={handleSave}
            onCancel={handleCancel}
            isSaving={isUpdating}
            isForked={definition.isForked}
            parentName={definition.parent?.name}
            parentId={definition.parentId ?? undefined}
            overrides={definition.overrides}
          />
        </div>
      </div>
    );
  }

  const childCount = definition.children?.length ?? 0;

  // View mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <DefinitionHeader
        definitionId={definition.id}
        scenarioCount={scenarioCount}
        onEdit={() => setIsEditing(true)}
        onFork={() => setShowForkDialog(true)}
        onDelete={() => setShowDeleteConfirm(true)}
        onStartRun={() => setShowRunForm(true)}
      />

      {/* Main content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Title and icon */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-medium text-gray-900">{definition.name}</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  v{definition.version}
                </span>
              </div>
              {definition.parentId && (
                <p className="text-sm text-gray-500">
                  <GitBranch className="w-3 h-3 inline mr-1" />
                  Forked from parent
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Metadata row */}
        <DefinitionMetadata
          createdAt={definition.createdAt}
          runCount={definition.runCount}
          childCount={childCount}
        />

        {/* Tags */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Tags</h3>
          <TagSelector
            selectedTags={definition.tags}
            inheritedTags={definition.inheritedTags ?? []}
            onTagAdd={handleTagAdd}
            onTagRemove={handleTagRemove}
            onTagCreate={handleTagCreate}
          />
        </div>

        {/* Content sections */}
        <DefinitionContentView content={definition.resolvedContent ?? definition.content} />

        {/* Expanded Scenarios */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <ExpandedScenarios
            definitionId={definition.id}
            expansionStatus={definition.expansionStatus}
            onRegenerateTriggered={() => refetch()}
          />
        </div>
      </div>

      {/* Version Tree */}
      <div className="bg-white rounded-lg border border-gray-200">
        <VersionTree
          definitionId={definition.id}
          onNodeClick={(nodeId) => {
            if (nodeId !== definition.id) {
              navigate(`/definitions/${nodeId}`);
            }
          }}
        />
      </div>

      {/* Fork Dialog */}
      {showForkDialog && (
        <ForkDialog
          originalName={definition.name}
          onFork={handleFork}
          onClose={() => setShowForkDialog(false)}
          isForking={isForking}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteDefinitionModal
        isOpen={showDeleteConfirm}
        definitionName={definition.name}
        childCount={childCount}
        isDeleting={isDeleting}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />

      {/* Run Form Dialog */}
      <RunFormModal
        isOpen={showRunForm}
        definitionId={definition.id}
        definitionName={definition.name}
        scenarioCount={scenarioCount}
        error={runError}
        isSubmitting={isStartingRun}
        onSubmit={handleStartRun}
        onClose={() => {
          setShowRunForm(false);
          setRunError(null);
        }}
      />
    </div>
  );
}
