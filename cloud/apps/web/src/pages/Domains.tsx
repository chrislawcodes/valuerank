import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { Folder, FolderOpen, Plus, Pencil, Trash2, Play, Loader2, CheckCircle, XCircle, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Badge } from '../components/ui/Badge';
import { DefinitionFilters, type DefinitionFilterState } from '../components/definitions/DefinitionFilters';
import { DEFINITION_COUNT_QUERY, type DefinitionCountQueryResult, type DefinitionCountQueryVariables } from '../api/operations/definitions';
import { useDefinitions } from '../hooks/useDefinitions';
import { useDomains } from '../hooks/useDomains';

const defaultFilters: DefinitionFilterState = {
  search: '',
  rootOnly: false,
  hasRuns: false,
  tagIds: [],
};

type FolderKey = string;
type DomainTrialStatus = {
  domainName: string;
  targetedDefinitions: number;
  startedRuns: number;
  failedDefinitions: number;
  startedAt: number;
};

function getFilterSummary(filters: DefinitionFilterState): string {
  const parts: string[] = [];
  if (filters.search.trim() !== '') parts.push(`search "${filters.search.trim()}"`);
  if (filters.rootOnly) parts.push('root only');
  if (filters.hasRuns) parts.push('has trials');
  if (filters.tagIds.length > 0) parts.push(`${filters.tagIds.length} tag filter${filters.tagIds.length !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'default';
  return String(Number(value.toFixed(2)));
}

export function Domains() {
  const [filters, setFilters] = useState<DefinitionFilterState>(defaultFilters);
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>('all');
  const [selectedDefinitionIds, setSelectedDefinitionIds] = useState<Set<string>>(new Set());
  const [selectAllShown, setSelectAllShown] = useState(false);
  const [assignTargetDomainId, setAssignTargetDomainId] = useState<string>('none');

  const [createName, setCreateName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastDomainTrialStatus, setLastDomainTrialStatus] = useState<DomainTrialStatus | null>(null);
  const [domainTrialStatusDismissed, setDomainTrialStatusDismissed] = useState(false);

  const {
    domains,
    queryLoading: domainQueryLoading,
    creating,
    renaming,
    deleting,
    runningDomainTrials,
    assigningByIds,
    assigningByFilter,
    error: domainError,
    refetch: refetchDomains,
    createDomain,
    renameDomain,
    deleteDomain,
    assignDomainToDefinitions,
    assignDomainToDefinitionsByFilter,
    runTrialsForDomain,
  } = useDomains();

  const definitionFilterArgs = useMemo(() => {
    if (selectedFolder === 'all') {
      return { domainId: undefined, withoutDomain: undefined };
    }
    if (selectedFolder === 'none') {
      return { domainId: undefined, withoutDomain: true };
    }
    return { domainId: selectedFolder, withoutDomain: undefined };
  }, [selectedFolder]);

  const { definitions, loading: definitionsLoading, error: definitionsError, refetch: refetchDefinitions } = useDefinitions({
    search: filters.search || undefined,
    rootOnly: filters.rootOnly || undefined,
    hasRuns: filters.hasRuns || undefined,
    tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
    domainId: definitionFilterArgs.domainId,
    withoutDomain: definitionFilterArgs.withoutDomain,
    limit: 1000,
  });

  const [{ data: countData }] = useQuery<DefinitionCountQueryResult, DefinitionCountQueryVariables>({
    query: DEFINITION_COUNT_QUERY,
    variables: {
      search: filters.search || undefined,
      rootOnly: filters.rootOnly || undefined,
      hasRuns: filters.hasRuns || undefined,
      tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
      domainId: definitionFilterArgs.domainId,
      withoutDomain: definitionFilterArgs.withoutDomain,
    },
  });
  const shownCount = countData?.definitionCount ?? null;

  const [{ data: noneCountData }] = useQuery<DefinitionCountQueryResult, DefinitionCountQueryVariables>({
    query: DEFINITION_COUNT_QUERY,
    variables: { withoutDomain: true },
  });
  const noneCount = noneCountData?.definitionCount ?? 0;

  const [{ data: allCountData }] = useQuery<DefinitionCountQueryResult, DefinitionCountQueryVariables>({
    query: DEFINITION_COUNT_QUERY,
    variables: {},
  });
  const allCount = allCountData?.definitionCount ?? null;
  const trialValidationErrors = useMemo(
    () => definitions.filter((definition) => definition.trialConfig?.isConsistent === false),
    [definitions],
  );

  const resetSelection = useCallback(() => {
    setSelectedDefinitionIds(new Set());
    setSelectAllShown(false);
  }, []);

  useEffect(() => {
    resetSelection();
  }, [selectedFolder, filters.search, filters.rootOnly, filters.hasRuns, filters.tagIds, resetSelection]);

  const handleToggleDefinition = (id: string) => {
    setSelectAllShown(false);
    setSelectedDefinitionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    setInlineError(null);
    setInlineSuccess(null);
    const targetDomainId = assignTargetDomainId === 'none' ? null : assignTargetDomainId;
    try {
      let result: { success: boolean; affectedDefinitions: number } | null = null;
      if (selectAllShown) {
        result = await assignDomainToDefinitionsByFilter({
          domainId: targetDomainId,
          search: filters.search || undefined,
          rootOnly: filters.rootOnly || undefined,
          hasRuns: filters.hasRuns || undefined,
          tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
          sourceDomainId: selectedFolder === 'all' || selectedFolder === 'none' ? undefined : selectedFolder,
          withoutDomain: selectedFolder === 'none' ? true : undefined,
        });
      } else if (selectedDefinitionIds.size > 0) {
        result = await assignDomainToDefinitions(Array.from(selectedDefinitionIds), targetDomainId);
      } else {
        setInlineError('Select one or more vignettes first.');
        return;
      }
      const targetName = targetDomainId === null
        ? 'None'
        : (domains.find((domain) => domain.id === targetDomainId)?.name ?? 'selected domain');
      setInlineSuccess(`${result?.affectedDefinitions ?? 0} vignette${(result?.affectedDefinitions ?? 0) === 1 ? '' : 's'} assigned to ${targetName}.`);
      resetSelection();
      refetchDefinitions();
      refetchDomains();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : 'Failed to assign domain');
    }
  };

  const handleRunDomainTrials = async () => {
    if (!selectedDomain) return;
    setRunError(null);
    setLastDomainTrialStatus(null);
    setDomainTrialStatusDismissed(false);
    const confirmed = window.confirm(
      `Start trials for domain "${selectedDomain.name}"?\n\nThis will run only the latest version per vignette lineage in this domain using default active models.`
    );
    if (!confirmed) return;

    try {
      const result = await runTrialsForDomain(selectedDomain.id);
      if (result === null) {
        setRunError('Failed to start domain trials.');
        return;
      }
      setLastDomainTrialStatus({
        domainName: selectedDomain.name,
        targetedDefinitions: result.targetedDefinitions,
        startedRuns: result.startedRuns,
        failedDefinitions: result.failedDefinitions,
        startedAt: Date.now(),
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Failed to start domain trials');
    }
  };

  const selectedDomain = selectedFolder !== 'all' && selectedFolder !== 'none'
    ? domains.find((d) => d.id === selectedFolder) ?? null
    : null;

  const handleCreateDomain = async () => {
    setInlineError(null);
    setInlineSuccess(null);
    try {
      if (createName.trim() === '') return;
      const created = await createDomain(createName);
      setCreateName('');
      if (created?.id) {
        setSelectedFolder(created.id);
      }
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : 'Failed to create domain');
    }
  };

  const handleRenameDomain = async () => {
    if (!selectedDomain) return;
    setInlineError(null);
    setInlineSuccess(null);
    try {
      if (renameName.trim() === '') return;
      await renameDomain(selectedDomain.id, renameName);
      setRenameName('');
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : 'Failed to rename domain');
    }
  };

  const handleDeleteDomain = async () => {
    if (!selectedDomain) return;
    setInlineError(null);
    setInlineSuccess(null);
    const ok = window.confirm(
      `Delete domain "${selectedDomain.name}"? Attached vignettes will be moved to None.`
    );
    if (!ok) return;
    try {
      await deleteDomain(selectedDomain.id);
      setSelectedFolder('none');
      resetSelection();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : 'Failed to delete domain');
    }
  };

  const folderRows: Array<{ key: FolderKey; name: string; count: number }> = [
    { key: 'all', name: 'All', count: allCount ?? domains.reduce((sum, d) => sum + d.definitionCount, 0) + noneCount },
    { key: 'none', name: 'None', count: noneCount },
    ...domains.map((domain) => ({ key: domain.id, name: domain.name, count: domain.definitionCount })),
  ];
  const startPercent = lastDomainTrialStatus && lastDomainTrialStatus.targetedDefinitions > 0
    ? (lastDomainTrialStatus.startedRuns / lastDomainTrialStatus.targetedDefinitions) * 100
    : 0;
  const showDomainTrialStatusPanel =
    !domainTrialStatusDismissed && (runningDomainTrials || lastDomainTrialStatus !== null || runError !== null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domains</h1>

      {(domainError || definitionsError) && (
        <ErrorMessage message={`Failed to load domains: ${(domainError ?? definitionsError)?.message ?? 'Unknown error'}`} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6">
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-gray-700">Folders</h2>
          <div className="space-y-1">
            {folderRows.map((folder) => {
              const isActive = selectedFolder === folder.key;
              return (
                <Button
                  key={folder.key}
                  type="button"
                  onClick={() => {
                    setSelectedFolder(folder.key);
                    setRenameName('');
                    resetSelection();
                  }}
                  variant="ghost"
                  size="sm"
                  className={`w-full !justify-between rounded-md px-2 py-2 text-left text-sm ${
                    isActive ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isActive ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                    {folder.name}
                  </span>
                  <Badge variant={isActive ? 'info' : 'neutral'} size="count">{folder.count}</Badge>
                </Button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-gray-200 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreateDomain();
                  }
                }}
                placeholder="New domain name"
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <Button onClick={() => void handleCreateDomain()} size="sm" variant="secondary" disabled={creating}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {selectedDomain && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleRenameDomain();
                      }
                    }}
                    placeholder={selectedDomain.name}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <Button onClick={() => void handleRenameDomain()} size="sm" variant="secondary" disabled={renaming}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
                <Button onClick={() => void handleDeleteDomain()} size="sm" variant="secondary" className="w-full" disabled={deleting}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Domain
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <DefinitionFilters filters={filters} onFiltersChange={setFilters} />

          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-teal-900">Run Domain Trials</h3>
                <p className="text-xs text-teal-800">
                  Start one trial for each latest vignette version in the selected domain.
                </p>
              </div>
              <Button
                onClick={() => void handleRunDomainTrials()}
                disabled={selectedDomain === null || runningDomainTrials}
              >
                <Play className="w-4 h-4 mr-1" />
                {runningDomainTrials ? 'Starting Trials...' : 'Run Domain Trials'}
              </Button>
            </div>
            {selectedDomain === null && (
              <p className="text-xs text-teal-800">
                Select a specific domain folder to run domain trials.
              </p>
            )}
          </div>

          {showDomainTrialStatusPanel && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {runningDomainTrials ? (
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  ) : runError ? (
                    <XCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  <h3 className="text-sm font-semibold text-gray-900">Domain Trial Status</h3>
                </div>
                <Badge
                  variant={runningDomainTrials ? 'warning' : runError ? 'error' : 'success'}
                  size="count"
                >
                  {runningDomainTrials ? 'Starting' : runError ? 'Failed' : 'Started'}
                </Badge>
                {!runningDomainTrials && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDomainTrialStatusDismissed(true)}
                    className="!p-1 text-gray-500 hover:text-gray-700"
                    aria-label="Dismiss domain trial status"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {runningDomainTrials && (
                <p className="text-sm text-gray-700">
                  Starting domain trials now. This may take a minute for larger domains.
                </p>
              )}

              {!runningDomainTrials && runError && (
                <p className="text-sm text-red-600">{runError}</p>
              )}

              {!runningDomainTrials && !runError && lastDomainTrialStatus && (
                <>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">{lastDomainTrialStatus.domainName}</span>: started {lastDomainTrialStatus.startedRuns} of {lastDomainTrialStatus.targetedDefinitions} latest-version trials.
                  </div>
                  <div className="text-xs text-gray-600">
                    Started at {formatTime(lastDomainTrialStatus.startedAt)}
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>Trials queued</span>
                      <span>{Math.round(startPercent)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 transition-all duration-300"
                        style={{ width: `${startPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    Failed starts: {lastDomainTrialStatus.failedDefinitions}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-gray-600">
                {shownCount === null ? '...' : shownCount} vignette{shownCount === 1 ? '' : 's'} shown
                {getFilterSummary(filters) !== '' && ` (${getFilterSummary(filters)})`}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectAllShown}
                    onChange={(e) => {
                      setSelectAllShown(e.target.checked);
                      if (e.target.checked) setSelectedDefinitionIds(new Set());
                    }}
                  />
                  Select all shown ({shownCount ?? '...'})
                </label>
                <select
                  value={assignTargetDomainId}
                  onChange={(e) => setAssignTargetDomainId(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                >
                  <option value="none">None</option>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
                <Button onClick={() => void handleBulkAssign()} size="sm" disabled={assigningByIds || assigningByFilter}>
                  {(assigningByIds || assigningByFilter) ? 'Assigning...' : 'Assign'}
                </Button>
              </div>
            </div>

            {inlineError && (
              <div className="text-sm text-red-600">{inlineError}</div>
            )}
            {inlineSuccess && (
              <div className="text-sm text-green-700">{inlineSuccess}</div>
            )}
            {trialValidationErrors.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium">
                  Validation error: {trialValidationErrors.length} vignette
                  {trialValidationErrors.length === 1 ? '' : 's'} have mixed version/temperature across trials.
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {trialValidationErrors.slice(0, 8).map((definition) => (
                    <li key={definition.id}>
                      {definition.name}: {definition.trialConfig?.message ?? 'Inconsistent trial settings.'}
                    </li>
                  ))}
                </ul>
                {trialValidationErrors.length > 8 && (
                  <p className="mt-1 text-xs">Showing first 8 rows only.</p>
                )}
              </div>
            )}
            {shownCount !== null && shownCount > definitions.length && (
              <p className="text-xs text-amber-700">
                Showing first {definitions.length} of {shownCount} matching vignettes.
              </p>
            )}

            {definitionsLoading || domainQueryLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : definitions.length === 0 ? (
              <p className="text-sm text-gray-500">No vignettes found for this folder/filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3">Select</th>
                      <th className="py-2 pr-3">Vignette</th>
                      <th className="py-2 pr-3">Version</th>
                      <th className="py-2 pr-3">Temperature</th>
                      <th className="py-2 pr-3">Domain</th>
                      <th className="py-2 pr-3">Trials</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definitions.map((definition) => (
                      <tr
                        key={definition.id}
                        className={`border-b border-gray-100 ${
                          definition.trialConfig?.isConsistent === false ? 'bg-red-50/40' : ''
                        }`}
                      >
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={selectedDefinitionIds.has(definition.id)}
                            onChange={() => handleToggleDefinition(definition.id)}
                            disabled={selectAllShown}
                          />
                        </td>
                        <td className="py-2 pr-3 text-gray-900">{definition.name}</td>
                        <td className="py-2 pr-3 text-gray-600">
                          {definition.trialConfig?.isConsistent === false
                            ? 'Mixed'
                            : definition.trialConfig?.definitionVersion ?? definition.version}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {definition.trialConfig?.isConsistent === false
                            ? 'Mixed'
                            : formatTemperature(definition.trialConfig?.temperature)}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">{definition.domain?.name ?? 'None'}</td>
                        <td className="py-2 pr-3 text-gray-600">{definition.trialCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
