import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, List, FolderTree, Upload } from 'lucide-react';
import { DefinitionCard } from './DefinitionCard';
import { DefinitionFilters, type DefinitionFilterState } from './DefinitionFilters';
import { DefinitionFolderView } from './DefinitionFolderView';
import { EmptyState } from '../ui/EmptyState';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Button } from '../ui/Button';
import { importDefinitionFromMd, ImportApiError } from '../../api/import';
import type { Definition } from '../../api/operations/definitions';

type ViewMode = 'flat' | 'folder';

type DefinitionListProps = {
  definitions: Definition[];
  loading: boolean;
  error: Error | null;
  onCreateNew?: () => void;
  filters?: DefinitionFilterState;
  onFiltersChange?: (filters: DefinitionFilterState) => void;
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

const defaultFilters: DefinitionFilterState = {
  search: '',
  rootOnly: false,
  hasRuns: false,
  tagIds: [],
};

export function DefinitionList({
  definitions,
  loading,
  error,
  onCreateNew,
  filters: externalFilters,
  onFiltersChange: externalOnFiltersChange,
}: DefinitionListProps) {
  const navigate = useNavigate();

  // Use internal state if no external filters provided
  const [internalFilters, setInternalFilters] = useState<DefinitionFilterState>(defaultFilters);
  const filters = externalFilters ?? internalFilters;
  const onFiltersChange = externalOnFiltersChange ?? setInternalFilters;

  // View mode state (flat list vs folder view)
  const [viewMode, setViewMode] = useState<ViewMode>('folder');

  // Import state
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasActiveFilters =
    filters.search.length > 0 ||
    filters.rootOnly ||
    filters.hasRuns ||
    filters.tagIds.length > 0;

  // Must be defined before any early returns (React hooks rule)
  const handleDefinitionClick = useCallback(
    (definition: Definition) => {
      navigate(`/definitions/${definition.id}`);
    },
    [navigate]
  );

  // State for handling name conflicts
  const [pendingImport, setPendingImport] = useState<{
    content: string;
    alternativeName?: string;
  } | null>(null);

  // Handle file import
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.md')) {
        setImportError('Please select a Markdown (.md) file');
        return;
      }

      setIsImporting(true);
      setImportError(null);

      // Read content first so we can store it for retry
      const content = await file.text();

      try {
        const result = await importDefinitionFromMd(content);
        setPendingImport(null);
        navigate(`/definitions/${result.id}`);
      } catch (err) {
        if (err instanceof ImportApiError && err.errorCode === 'VALIDATION_ERROR') {
          // Check if it's a name conflict with a suggested alternative
          if (err.suggestions?.alternativeName) {
            setPendingImport({ content, alternativeName: err.suggestions.alternativeName });
            setImportError(`A definition with this name already exists. Use "${err.suggestions.alternativeName}" instead?`);
          } else {
            setImportError(err.details?.map(d => d.message).join('; ') || err.message);
          }
        } else {
          const message = err instanceof Error ? err.message : 'Import failed';
          setImportError(message);
        }
      } finally {
        setIsImporting(false);
      }
    },
    [navigate]
  );

  // Handle importing with alternative name
  const handleImportWithAlternativeName = useCallback(async () => {
    if (!pendingImport?.content) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const result = await importDefinitionFromMd(pendingImport.content, {
        forceAlternativeName: true,
      });
      setPendingImport(null);
      navigate(`/definitions/${result.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  }, [pendingImport, navigate]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  if (error) {
    return (
      <ErrorMessage message={`Failed to load definitions: ${error.message}`} />
    );
  }

  // Show empty state only when not loading and no definitions exist AND no filters are active
  if (!loading && definitions.length === 0 && !hasActiveFilters) {
    return (
      <EmptyState
        icon={FileText}
        title="No vignettes yet"
        description="Create your first vignette to get started with AI moral values evaluation."
        action={
          onCreateNew
            ? {
              label: 'Create Vignette',
              onClick: onCreateNew,
            }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with create button and view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Vignettes</h2>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <Button
              type="button"
              onClick={() => setViewMode('flat')}
              variant="ghost"
              size="icon"
              className={`p-1.5 rounded-none ${viewMode === 'flat'
                  ? 'bg-teal-50 text-teal-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              title="List view"
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              onClick={() => setViewMode('folder')}
              variant="ghost"
              size="icon"
              className={`p-1.5 rounded-none ${viewMode === 'folder'
                  ? 'bg-teal-50 text-teal-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              title="Folder view (by tag)"
              aria-label="Folder view (by tag)"
            >
              <FolderTree className="w-4 h-4" />
            </Button>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className="relative"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="secondary"
              size="sm"
              disabled={isImporting}
              className={isDragging ? 'ring-2 ring-teal-500 ring-offset-1' : ''}
            >
              <Upload className="w-4 h-4 mr-1" />
              {isImporting ? 'Importing...' : isDragging ? 'Drop here' : 'Import'}
            </Button>
          </div>
          {onCreateNew && (
            <Button onClick={onCreateNew} variant="primary" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              New Vignette
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <DefinitionFilters filters={filters} onFiltersChange={onFiltersChange} />

      {/* Loading skeleton */}
      {loading && definitions.length === 0 && <DefinitionListSkeleton />}

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-gray-500">
          {definitions.length} vignette{definitions.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' matching filters'}
        </p>
      )}

      {/* No results with filters */}
      {!loading && definitions.length === 0 && hasActiveFilters && (
        <div className="text-center py-8">
          <p className="text-gray-500">No vignettes match your filters</p>
          <Button
            type="button"
            onClick={() => onFiltersChange(defaultFilters)}
            variant="ghost"
            size="sm"
            className="mt-2 text-teal-600 hover:text-teal-700"
          >
            Clear filters
          </Button>
        </div>
      )}

      {/* Definition cards - flat list or folder view */}
      {definitions.length > 0 && viewMode === 'flat' && (
        <div className="space-y-3">
          {definitions.map((definition) => (
            <DefinitionCard
              key={definition.id}
              definition={definition}
              onClick={() => handleDefinitionClick(definition)}
            />
          ))}
        </div>
      )}

      {/* Folder view grouped by tags */}
      {definitions.length > 0 && viewMode === 'folder' && (
        <DefinitionFolderView
          definitions={definitions}
          onDefinitionClick={handleDefinitionClick}
        />
      )}

      {/* Loading indicator for pagination */}
      {loading && definitions.length > 0 && (
        <Loading size="sm" text="Loading more..." />
      )}

      {/* Import error toast */}
      {importError && (
        <div className="fixed bottom-4 right-4 max-w-md p-4 bg-red-50 border border-red-200 rounded-lg shadow-lg z-50">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Import failed</p>
              <p className="text-sm text-red-600 mt-1">{importError}</p>
              {pendingImport?.alternativeName && (
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={handleImportWithAlternativeName}
                    disabled={isImporting}
                    variant="primary"
                    size="sm"
                  >
                    {isImporting ? 'Importing...' : 'Use Alternative Name'}
                  </Button>
                  <Button
                    onClick={() => {
                      setPendingImport(null);
                      setImportError(null);
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <Button
              onClick={() => {
                setPendingImport(null);
                setImportError(null);
              }}
              variant="ghost"
              size="icon"
              className="w-6 h-6 p-0 text-red-400 hover:text-red-600 hover:bg-transparent"
              aria-label="Dismiss error"
            >
              ×
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
