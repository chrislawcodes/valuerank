import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from 'urql';
import { ArrowLeft, Edit, FileText, Calendar, Play, GitBranch, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { DefinitionEditor } from '../components/definitions/DefinitionEditor';
import { ForkDialog } from '../components/definitions/ForkDialog';
import { TagSelector } from '../components/definitions/TagSelector';
import { VersionTree } from '../components/definitions/VersionTree';
import { ExpandedScenarios } from '../components/definitions/ExpandedScenarios';
import { RunForm } from '../components/runs/RunForm';
import { useDefinition } from '../hooks/useDefinition';
import { useDefinitionMutations } from '../hooks/useDefinitionMutations';
import { useRunMutations } from '../hooks/useRunMutations';
import { useExpandedScenarios } from '../hooks/useExpandedScenarios';
import type { DefinitionContent } from '../api/operations/definitions';
import type { StartRunInput } from '../api/operations/runs';
import {
  ADD_TAG_TO_DEFINITION_MUTATION,
  REMOVE_TAG_FROM_DEFINITION_MUTATION,
  CREATE_AND_ASSIGN_TAG_MUTATION,
  type AddTagToDefinitionResult,
  type RemoveTagFromDefinitionResult,
  type CreateAndAssignTagResult,
} from '../api/operations/tags';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
    limit: 1, // We only need the count, not the actual scenarios
  });

  const { startRun, loading: isStartingRun } = useRunMutations();

  // Poll for definition updates while expansion is in progress
  const isExpanding = definition?.expansionStatus?.status === 'PENDING' ||
                      definition?.expansionStatus?.status === 'ACTIVE';

  useEffect(() => {
    if (isExpanding && !isNewDefinition) {
      const interval = setInterval(() => {
        refetch();
      }, 3000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isExpanding, isNewDefinition, refetch]);

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
  const [, executeRemoveTag] = useMutation<RemoveTagFromDefinitionResult>(REMOVE_TAG_FROM_DEFINITION_MUTATION);
  const [, executeCreateAndAssignTag] = useMutation<CreateAndAssignTagResult>(CREATE_AND_ASSIGN_TAG_MUTATION);

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
      // Extract the error message and show to user
      const message = result.error.graphQLErrors?.[0]?.message || result.error.message;
      alert(`Failed to create tag: ${message}`);
    } else {
      refetch();
    }
  };

  const handleSave = async (name: string, content: DefinitionContent) => {
    if (isNewDefinition) {
      const newDefinition = await createDefinition({ name, content });
      navigate(`/definitions/${newDefinition.id}`, { replace: true });
    } else if (definition) {
      await updateDefinition(definition.id, { name, content });
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
      // Close dialog on error too - user can retry
      setShowDeleteConfirm(false);
      console.error('Failed to delete definition:', err);
    }
  };

  const handleStartRun = async (input: StartRunInput) => {
    setRunError(null);
    try {
      const result = await startRun(input);
      setShowRunForm(false);
      // Navigate to the run detail page (or runs list until RunDetail is implemented)
      navigate(`/runs/${result.run.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start run';
      setRunError(message);
      throw err; // Re-throw so RunForm knows it failed
    }
  };

  // Create mode
  if (isNewDefinition) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Definitions
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-xl font-medium text-gray-900 mb-6">
            Create New Definition
          </h1>

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
        <Loading size="lg" text="Loading definition..." />
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
        <ErrorMessage message={`Failed to load definition: ${error.message}`} />
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
        <ErrorMessage message="Definition not found" />
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
          <h1 className="text-xl font-medium text-gray-900 mb-6">
            Edit Definition
          </h1>

          <DefinitionEditor
            mode="edit"
            initialName={definition.name}
            initialContent={definition.content}
            onSave={handleSave}
            onCancel={handleCancel}
            isSaving={isUpdating}
          />
        </div>
      </div>
    );
  }

  // View mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
          <Button variant="secondary" onClick={() => setShowForkDialog(true)}>
            <GitBranch className="w-4 h-4 mr-2" />
            Fork
          </Button>
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="primary"
            onClick={() => setShowRunForm(true)}
            disabled={scenarioCount === 0}
          >
            <Play className="w-4 h-4 mr-2" />
            Start Run
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Title and metadata */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-gray-900">{definition.name}</h1>
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
        <div className="flex items-center gap-6 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Created {formatDate(definition.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <Play className="w-4 h-4" />
            {definition.runCount} run{definition.runCount !== 1 ? 's' : ''}
          </span>
          {definition.children && definition.children.length > 0 && (
            <span className="flex items-center gap-1">
              <GitBranch className="w-4 h-4" />
              {definition.children.length} fork{definition.children.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

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

        {/* Content sections - use resolvedContent for display (handles inheritance) */}
        {(() => {
          // Use resolvedContent when available (has inheritance resolved), fallback to content
          const displayContent = definition.resolvedContent ?? definition.content;
          const preamble = displayContent?.preamble ?? '';
          const template = displayContent?.template ?? '';
          const dimensions = displayContent?.dimensions ?? [];

          return (
            <div className="space-y-6">
              {/* Preamble */}
              {preamble && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Preamble</h3>
                  <p className="text-gray-600 bg-gray-50 rounded-lg p-4">
                    {preamble}
                  </p>
                </div>
              )}

              {/* Template */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Scenario Template</h3>
                <pre className="text-gray-600 bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
                  {template}
                </pre>
              </div>

              {/* Dimensions */}
              {dimensions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Dimensions ({dimensions.length})
                  </h3>
                  <div className="space-y-3">
                    {dimensions.map((dim, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">
                          [{dim.name}]
                        </h4>
                        <div className="space-y-2">
                          {dim.levels.map((level, levelIndex) => (
                            <div key={levelIndex} className="flex items-start gap-3 text-sm">
                              <span className="inline-flex px-2 py-0.5 bg-teal-100 text-teal-800 rounded font-medium">
                                {level.score}
                              </span>
                              <div>
                                <span className="font-medium text-gray-900">{level.label}</span>
                                {level.description && (
                                  <p className="text-gray-500">{level.description}</p>
                                )}
                                {level.options && level.options.length > 0 && (
                                  <p className="text-gray-400 text-xs">
                                    Options: {level.options.join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Expanded Scenarios (from database) */}
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
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Delete Definition
            </h2>
            <p className="text-gray-600 mb-2">
              Are you sure you want to delete &quot;{definition.name}&quot;?
            </p>
            {definition.children && definition.children.length > 0 && (
              <p className="text-amber-600 text-sm mb-4">
                This will also delete {definition.children.length} forked definition
                {definition.children.length !== 1 ? 's' : ''}.
              </p>
            )}
            <p className="text-gray-500 text-sm mb-6">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Run Form Dialog */}
      {showRunForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Start Evaluation Run
            </h2>
            <p className="text-gray-600 mb-6">
              Configure and start an evaluation run for &quot;{definition.name}&quot;
            </p>
            {runError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {runError}
              </div>
            )}
            <RunForm
              definitionId={definition.id}
              scenarioCount={scenarioCount}
              onSubmit={handleStartRun}
              onCancel={() => {
                setShowRunForm(false);
                setRunError(null);
              }}
              isSubmitting={isStartingRun}
            />
          </div>
        </div>
      )}
    </div>
  );
}
