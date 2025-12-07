import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, FileText, Calendar, Play, GitBranch } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { DefinitionEditor } from '../components/definitions/DefinitionEditor';
import { useDefinition } from '../hooks/useDefinition';
import { useDefinitionMutations } from '../hooks/useDefinitionMutations';
import type { DefinitionContent } from '../api/operations/definitions';

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

  const isNewDefinition = id === 'new';

  const { definition, loading, error, refetch } = useDefinition({
    id: id || '',
    pause: isNewDefinition,
  });

  const {
    createDefinition,
    updateDefinition,
    isCreating,
    isUpdating
  } = useDefinitionMutations();

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
        <Button variant="primary" onClick={() => setIsEditing(true)}>
          <Edit className="w-4 h-4 mr-2" />
          Edit Definition
        </Button>
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
        {definition.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {definition.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content sections */}
        <div className="space-y-6">
          {/* Preamble */}
          {definition.content.preamble && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preamble</h3>
              <p className="text-gray-600 bg-gray-50 rounded-lg p-4">
                {definition.content.preamble}
              </p>
            </div>
          )}

          {/* Template */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Scenario Template</h3>
            <pre className="text-gray-600 bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
              {definition.content.template}
            </pre>
          </div>

          {/* Dimensions */}
          {definition.content.dimensions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Dimensions ({definition.content.dimensions.length})
              </h3>
              <div className="space-y-3">
                {definition.content.dimensions.map((dim, index) => (
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
      </div>
    </div>
  );
}
