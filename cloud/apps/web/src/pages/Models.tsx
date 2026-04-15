import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { useDomains } from '../hooks/useDomains';
import {
  MODELS_ANALYSIS_QUERY,
  type ModelsAnalysisQueryResult,
  type ModelsAnalysisQueryVariables,
  type ModelsAnalysisValueResult,
} from '../api/operations/modelsAnalysis';
import { ModelValueDetailDrawer } from '../components/models/ModelValueDetailDrawer';
import {
  ModelsMatrix,
  VALUE_SHORT_LABELS,
  type ModelsMatrixSortKey,
  type StabilityVisibility,
} from '../components/models/ModelsMatrix';

export function Models() {
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();
  const [{ data, fetching, error }] = useQuery<ModelsAnalysisQueryResult, ModelsAnalysisQueryVariables>({
    query: MODELS_ANALYSIS_QUERY,
    variables: {},
    requestPolicy: 'cache-and-network',
  });

  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<ModelsMatrixSortKey>('model');
  const [stabilityVisibility, setStabilityVisibility] = useState<StabilityVisibility>('all');
  const [selectedCell, setSelectedCell] = useState<{ modelId: string; valueKey: string } | null>(null);
  const initializedModelSelection = useRef(false);

  const models = useMemo(() => data?.modelsAnalysis.models ?? [], [data]);
  const selectedDomain = selectedDomainId != null ? domains.find((domain) => domain.id === selectedDomainId) ?? null : null;
  const singleDomainActive = selectedDomainId != null;

  useEffect(() => {
    if (selectedDomainId == null) return;
    if (domains.some((domain) => domain.id === selectedDomainId)) return;
    setSelectedDomainId(null);
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (initializedModelSelection.current) return;
    if (models.length === 0) return;
    setSelectedModelIds(models.map((model) => model.modelId));
    initializedModelSelection.current = true;
  }, [models]);

  useEffect(() => {
    if (!initializedModelSelection.current) return;
    setSelectedModelIds((current) => {
      if (current.length === 0) return current;
      const validIds = new Set(models.map((model) => model.modelId));
      const next = current.filter((modelId) => validIds.has(modelId));
      return next.length === current.length ? current : next;
    });
  }, [models]);

  const modelOptions = useMemo(() => models.map((model) => ({
    value: model.modelId,
    label: model.label,
  })), [models]);

  const sortOptions = useMemo(() => [
    { value: 'model', label: 'Model name' },
    ...Object.entries(VALUE_SHORT_LABELS).map(([valueKey, label]) => ({
      value: valueKey as ModelsMatrixSortKey,
      label,
    })),
  ], []);

  const domainOptions = useMemo(() => [
    { value: 'all', label: 'All domains' },
    ...domains.map((domain) => ({
      value: domain.id,
      label: `${domain.name}`,
    })),
  ], [domains]);

  const selectedModel = selectedCell != null
    ? models.find((model) => model.modelId === selectedCell.modelId) ?? null
    : null;
  const selectedValue: ModelsAnalysisValueResult | null = useMemo(() => {
    if (selectedCell == null || selectedModel == null) return null;
    return selectedModel.values.find((value) => value.valueKey === selectedCell.valueKey) ?? null;
  }, [selectedCell, selectedModel]);

  const loading = (domainsLoading && domains.length === 0) || (fetching && data == null);
  const selectedModelCount = selectedModelIds.length;

  const toggleModelId = (modelId: string) => {
    setSelectedModelIds((current) => (
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
    ));
  };

  const selectAllModels = () => {
    setSelectedModelIds(models.map((model) => model.modelId));
  };

  const clearModels = () => {
    setSelectedModelIds([]);
  };

  const handleCellClick = (modelId: string, valueKey: string) => {
    setSelectedCell({ modelId, valueKey });
  };

  const stabilityDisabled = singleDomainActive;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Models</h1>
        <p className="text-sm text-gray-600">
          Compare model preferences by value and scan whether each pattern stays steady across domains.
        </p>
      </div>

      {(domainsError != null || error != null) && (
        <ErrorMessage message={`Failed to load models analysis: ${(domainsError ?? error)?.message ?? 'Unknown error'}`} />
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Domain scope"
            options={domainOptions}
            value={selectedDomainId ?? 'all'}
            onChange={(value) => setSelectedDomainId(value === 'all' ? null : value)}
            placeholder="All domains"
          />
          <Select
            label="Sort rows by"
            options={sortOptions}
            value={sortBy}
            onChange={(value) => setSortBy(value as ModelsMatrixSortKey)}
          />
          <Select
            label="Stability visibility"
            options={[
              { value: 'all', label: 'All' },
              { value: 'stable', label: 'Stable only' },
              { value: 'low', label: 'Low stability only' },
            ]}
            value={stabilityVisibility}
            onChange={(value) => setStabilityVisibility(value as StabilityVisibility)}
            disabled={stabilityDisabled}
            placeholder="All"
          />
          <div className="flex items-end">
            <div className="text-xs text-gray-500">
              {singleDomainActive ? 'Stability visibility is disabled while a single domain is selected.' : 'Stability is a cross-domain scan signal.'}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Model set</h2>
              <p className="text-xs text-gray-600">All visible models are selected by default.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={selectAllModels} disabled={loading}>
                Select all
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={clearModels} disabled={loading}>
                Clear
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {modelOptions.map((model) => {
              const isSelected = selectedModelIds.includes(model.value);
              return (
                <Button
                  key={model.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleModelId(model.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-0 ${
                    isSelected
                      ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-teal-400 hover:text-teal-700 hover:bg-white'
                  }`}
                  title={model.label}
                >
                  {model.label}
                </Button>
              );
            })}
            {modelOptions.length === 0 && !loading && (
              <span className="text-sm text-gray-500">No active models are available.</span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {loading
              ? 'Loading models and domains...'
              : modelOptions.length === 0
                ? 'No active models are available.'
                : selectedModelCount === modelOptions.length
                  ? 'All visible models selected.'
                  : `${selectedModelCount} of ${modelOptions.length} visible models selected.`}
            {singleDomainActive && selectedDomain != null && (
              <span className="ml-2">Viewing {selectedDomain.name} only, so stability uses one domain at most.</span>
            )}
          </div>
        </div>
      </section>

      {loading && <Loading size="lg" text="Loading models analysis..." />}

      {!loading && (
        <ModelsMatrix
          models={models}
          selectedModelIds={selectedModelIds}
          sortBy={sortBy}
          stabilityVisibility={stabilityVisibility}
          singleDomainActive={singleDomainActive}
          selectedCellKey={selectedCell == null ? null : `${selectedCell.modelId}:${selectedCell.valueKey}`}
          onCellClick={handleCellClick}
        />
      )}

      <ModelValueDetailDrawer
        open={selectedCell != null}
        model={selectedModel}
        value={selectedValue}
        singleDomainActive={singleDomainActive}
        onClose={() => setSelectedCell(null)}
      />
    </div>
  );
}
