import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DefinitionList } from '../components/definitions/DefinitionList';
import { type DefinitionFilterState } from '../components/definitions/DefinitionFilters';
import { useInfiniteDefinitions } from '../hooks/useInfiniteDefinitions';

const defaultFilters: DefinitionFilterState = {
  search: '',
  rootOnly: false,
  hasRuns: false,
  tagIds: [],
};

export function Definitions() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DefinitionFilterState>(defaultFilters);

  const { definitions, loading, loadingMore, error, hasNextPage, totalCount, loadMore } =
    useInfiniteDefinitions({
      search: filters.search || undefined,
      rootOnly: filters.rootOnly || undefined,
      hasRuns: filters.hasRuns || undefined,
      tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
    });

  const handleCreateNew = () => {
    navigate('/definitions/new');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Vignettes</h1>
      <DefinitionList
        definitions={definitions}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasNextPage={hasNextPage}
        totalCount={totalCount}
        onLoadMore={loadMore}
        onCreateNew={handleCreateNew}
        filters={filters}
        onFiltersChange={setFilters}
      />
    </div>
  );
}
