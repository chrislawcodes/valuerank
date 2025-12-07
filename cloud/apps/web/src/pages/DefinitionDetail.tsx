import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { DefinitionEditor } from '../components/definitions/DefinitionEditor';
import { useDefinitionMutations } from '../hooks/useDefinitionMutations';
import type { DefinitionContent } from '../api/operations/definitions';

export function DefinitionDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { createDefinition, isCreating } = useDefinitionMutations();

  const isNewDefinition = id === 'new';

  const handleSave = async (name: string, content: DefinitionContent) => {
    if (isNewDefinition) {
      const definition = await createDefinition({ name, content });
      navigate(`/definitions/${definition.id}`, { replace: true });
    }
    // Edit mode will be implemented in Phase 5 (US3)
  };

  const handleCancel = () => {
    navigate('/definitions');
  };

  // For now, only support create mode (edit mode in Phase 5)
  if (!isNewDefinition) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/definitions')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-gray-600">
            Definition detail view coming in Phase 5 (Edit Existing Definition).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
