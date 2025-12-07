import { useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { DefinitionCard } from './DefinitionCard';
import { EmptyState } from '../ui/EmptyState';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Button } from '../ui/Button';
import type { Definition } from '../../api/operations/definitions';

type DefinitionListProps = {
  definitions: Definition[];
  loading: boolean;
  error: Error | null;
  onCreateNew?: () => void;
};

function DefinitionListSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-gray-200 rounded" />
            <div className="h-5 bg-gray-200 rounded w-1/3" />
          </div>
          <div className="flex gap-2 mb-3">
            <div className="h-5 bg-gray-100 rounded-full w-16" />
            <div className="h-5 bg-gray-100 rounded-full w-20" />
          </div>
          <div className="flex gap-4">
            <div className="h-4 bg-gray-100 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DefinitionList({ definitions, loading, error, onCreateNew }: DefinitionListProps) {
  const navigate = useNavigate();

  if (loading && definitions.length === 0) {
    return <DefinitionListSkeleton />;
  }

  if (error) {
    return (
      <ErrorMessage message={`Failed to load definitions: ${error.message}`} />
    );
  }

  if (definitions.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No definitions yet"
        description="Create your first scenario definition to get started with AI moral values evaluation."
        action={
          onCreateNew
            ? {
                label: 'Create Definition',
                onClick: onCreateNew,
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with count and create button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {definitions.length} definition{definitions.length !== 1 ? 's' : ''}
        </p>
        {onCreateNew && (
          <Button onClick={onCreateNew} variant="primary" size="sm">
            <Plus className="w-4 h-4 mr-1" />
            New Definition
          </Button>
        )}
      </div>

      {/* Definition cards */}
      <div className="space-y-3">
        {definitions.map((definition) => (
          <DefinitionCard
            key={definition.id}
            definition={definition}
            onClick={() => navigate(`/definitions/${definition.id}`)}
          />
        ))}
      </div>

      {/* Loading indicator for pagination */}
      {loading && definitions.length > 0 && (
        <Loading size="sm" text="Loading more..." />
      )}
    </div>
  );
}
