import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DefinitionList } from '../components/definitions/DefinitionList';
import { type DefinitionFilterState } from '../components/definitions/DefinitionFilters';
import { useDefinitions } from '../hooks/useDefinitions';

const defaultFilters: DefinitionFilterState = {
  search: '',
  rootOnly: false,
  hasRuns: false,
  tagIds: [],
};

export function Definitions() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DefinitionFilterState>(defaultFilters);

  const { definitions, loading, error } = useDefinitions({
    search: filters.search || undefined,
    rootOnly: filters.rootOnly || undefined,
    hasRuns: filters.hasRuns || undefined,
    tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
    limit: 1000,
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
        error={error}
        onCreateNew={handleCreateNew}
        filters={filters}
        onFiltersChange={setFilters}
      />
    </div>
  );
}
