import { useCallback, useEffect, useMemo, useState } from 'react';
import { gql, useQuery, useMutation } from 'urql';
import { Play, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { DefinitionFilters, type DefinitionFilterState } from '../components/definitions/DefinitionFilters';
import { DEFINITION_COUNT_QUERY, type DefinitionCountQueryResult, type DefinitionCountQueryVariables } from '../api/operations/definitions';
import { useDefinitions } from '../hooks/useDefinitions';
import { useDomains } from '../hooks/useDomains';
import { DomainContexts } from './DomainContexts';
import { ValueStatements } from './ValueStatements';
import { CoverageMatrix } from '../components/domains/CoverageMatrix';
import {
  DOMAIN_CONTEXTS_QUERY,
  type DomainContextsQueryResult,
  type DomainContextsQueryVariables,
} from '../api/operations/domain-contexts';
import {
  VALUE_STATEMENTS_QUERY,
  type ValueStatementsQueryResult,
  type ValueStatementsQueryVariables,
} from '../api/operations/value-statements';
import {
  SET_DOMAIN_DEFAULTS_MUTATION,
  type SetDomainDefaultsMutationResult,
  type SetDomainDefaultsMutationVariables,
} from '../api/operations/domains';
import {
  LEVEL_PRESETS_QUERY,
  type LevelPresetsQueryData,
} from '../api/operations/level-presets';

type PreambleSummary = {
  id: string;
  name: string;
  latestVersion: { id: string; version: string } | null;
};

type PreamblesQueryResult = { preambles: PreambleSummary[] };

const PREAMBLES_QUERY = gql`
  query PreamblesForDomainDefaults {
    preambles {
      id
      name
      latestVersion {
        id
        version
      }
    }
  }
`;

const defaultFilters: DefinitionFilterState = {
  search: '',
  rootOnly: false,
  hasRuns: false,
  tagIds: [],
};

type FolderKey = string;
type DomainTab = 'overview' | 'vignettes' | 'setup' | 'runs' | 'findings';
type SetupTab = 'contexts' | 'value-statements' | 'defaults';

type MissingSetupRequirement = {
  label: string;
  tab: SetupTab;
};

function getFilterSummary(filters: DefinitionFilterState): string {
  const parts: string[] = [];
  if (filters.search.trim() !== '') parts.push(`search "${filters.search.trim()}"`);
  if (filters.rootOnly) parts.push('root only');
  if (filters.hasRuns) parts.push('has trials');
  if (filters.tagIds.length > 0) parts.push(`${filters.tagIds.length} tag filter${filters.tagIds.length !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'default';
  return String(Number(value.toFixed(2)));
}

function formatRequirementList(requirements: MissingSetupRequirement[]): string {
  if (requirements.length === 0) return '';
  if (requirements.length === 1) return requirements[0]?.label ?? '';
  if (requirements.length === 2) {
    return `${requirements[0]?.label ?? ''} and ${requirements[1]?.label ?? ''}`;
  }
  return `${requirements.slice(0, -1).map((item) => item.label).join(', ')}, and ${requirements.at(-1)?.label ?? ''}`;
}

export function Domains() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialSelectedFolder = searchParams.get('domainId');
  const initialTab = searchParams.get('tab');
  const initialSetupTab = searchParams.get('setupTab');
  const [filters, setFilters] = useState<DefinitionFilterState>(defaultFilters);
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>(initialSelectedFolder ?? 'all');

  const [activeTab, setActiveTab] = useState<DomainTab>(
    initialTab === 'overview' || initialTab === 'vignettes' || initialTab === 'setup' || initialTab === 'runs' || initialTab === 'findings'
      ? initialTab
      : 'overview',
  );
  const [setupTab, setSetupTab] = useState<SetupTab>(
    initialSetupTab === 'contexts' || initialSetupTab === 'value-statements' || initialSetupTab === 'defaults'
      ? initialSetupTab
      : 'contexts',
  );

  const [inlineError, setInlineError] = useState<string | null>(null);

  const {
    domains,
    queryLoading: domainQueryLoading,
    error: domainError,
  } = useDomains();

  const definitionFilterArgs = useMemo(() => {
    return { domainId: selectedFolder || undefined, withoutDomain: undefined };
  }, [selectedFolder]);

  const { definitions, loading: definitionsLoading, error: definitionsError } = useDefinitions({
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

  const selectedDomain = domains.find((d) => d.id === selectedFolder) ?? null;

  const [{ data: selectedDomainContextsData }] = useQuery<
    DomainContextsQueryResult,
    DomainContextsQueryVariables
  >({
    query: DOMAIN_CONTEXTS_QUERY,
    variables: { domainId: selectedDomain?.id },
    pause: selectedDomain == null,
  });
  const [{ data: selectedDomainValueStatementsData }] = useQuery<
    ValueStatementsQueryResult,
    ValueStatementsQueryVariables
  >({
    query: VALUE_STATEMENTS_QUERY,
    variables: { domainId: selectedDomain?.id ?? '' },
    pause: selectedDomain == null,
  });

  const [{ data: preamblesData }] = useQuery<PreamblesQueryResult>({
    query: PREAMBLES_QUERY,
  });
  const [{ data: levelPresetsData }] = useQuery<LevelPresetsQueryData>({
    query: LEVEL_PRESETS_QUERY,
  });
  const [, executeSetDomainDefaults] = useMutation<
    SetDomainDefaultsMutationResult,
    SetDomainDefaultsMutationVariables
  >(SET_DOMAIN_DEFAULTS_MUTATION);

  const [formDefaultContextId, setFormDefaultContextId] = useState<string>('');
  const [formDefaultPreambleVersionId, setFormDefaultPreambleVersionId] = useState<string>('');
  const [formDefaultLevelPresetVersionId, setFormDefaultLevelPresetVersionId] = useState<string>('');
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaveError, setDefaultsSaveError] = useState<string | null>(null);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  useEffect(() => {
    if (selectedDomain != null) {
      setFormDefaultContextId(selectedDomain.defaultContextId ?? '');
      setFormDefaultPreambleVersionId(selectedDomain.defaultPreambleVersionId ?? '');
      setFormDefaultLevelPresetVersionId(selectedDomain.defaultLevelPresetVersionId ?? '');
      setDefaultsSaveError(null);
      setDefaultsSaved(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain?.id]);

  const handleSaveDomainDefaults = useCallback(async () => {
    if (selectedDomain == null) return;
    setDefaultsSaving(true);
    setDefaultsSaveError(null);
    setDefaultsSaved(false);
    try {
      const result = await executeSetDomainDefaults({
        id: selectedDomain.id,
        defaultContextId: formDefaultContextId !== '' ? formDefaultContextId : null,
        defaultPreambleVersionId: formDefaultPreambleVersionId !== '' ? formDefaultPreambleVersionId : null,
        defaultLevelPresetVersionId: formDefaultLevelPresetVersionId !== '' ? formDefaultLevelPresetVersionId : null,
      });
      if (result.error != null) {
        setDefaultsSaveError(result.error.message);
      } else {
        setDefaultsSaved(true);
      }
    } catch (error) {
      setDefaultsSaveError(error instanceof Error ? error.message : 'Failed to save defaults');
    } finally {
      setDefaultsSaving(false);
    }
  }, [selectedDomain, executeSetDomainDefaults, formDefaultContextId, formDefaultPreambleVersionId, formDefaultLevelPresetVersionId]);

  const inconsistentBatchDefinitions = useMemo(
    () => definitions.filter((definition) => definition.trialConfig?.isConsistent === false),
    [definitions],
  );
  const contextsCount = selectedDomainContextsData?.domainContexts.length ?? 0;
  const valueStatementsCount = selectedDomainValueStatementsData?.valueStatements.length ?? 0;
  const missingSetupRequirements = useMemo<MissingSetupRequirement[]>(() => {
    const requirements: MissingSetupRequirement[] = [];
    if (contextsCount === 0) {
      requirements.push({ label: 'at least one context', tab: 'contexts' });
    }
    if (valueStatementsCount < 2) {
      requirements.push({ label: 'at least two value statements', tab: 'value-statements' });
    }
    return requirements;
  }, [contextsCount, valueStatementsCount]);
  const setupReady = missingSetupRequirements.length === 0;
  const recommendedPilotCount = useMemo(
    () => (setupReady ? definitions.filter((definition) => definition.runCount === 0).length : 0),
    [definitions, setupReady],
  );
  const evaluatedDefinitionCount = useMemo(
    () => definitions.filter((definition) => definition.runCount > 0).length,
    [definitions],
  );

  useEffect(() => {
    if (selectedFolder === 'all' || selectedFolder === 'none' || selectedDomain == null) {
      if (domains.length > 0 && domains[0] != null) {
        setSelectedFolder(domains[0].id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedDomain != null) {
      next.set('domainId', selectedFolder);
      next.set('tab', activeTab);
      if (activeTab === 'setup') {
        next.set('setupTab', setupTab);
      } else {
        next.delete('setupTab');
      }
    } else {
      next.delete('domainId');
      next.delete('tab');
      next.delete('setupTab');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, selectedDomain, selectedFolder, setSearchParams, setupTab]);

  const handleRunDomainTrials = () => {
    if (!selectedDomain) return;
    navigate(`/domains/${selectedDomain.id}/run-trials`);
  };
  const handleOpenDomainFindings = () => {
    if (!selectedDomain) return;
    navigate(`/domains/analysis?domainId=${selectedDomain.id}`);
  };
  const handleOpenDomainCoverage = () => {
    if (!selectedDomain) return;
    navigate(`/domains/coverage?domainId=${selectedDomain.id}`);
  };
  const handleOpenCompare = () => {
    navigate('/compare');
  };
  const handleCreateVignettePair = () => {
    if (selectedDomain == null) {
      setInlineError('Select a specific domain before creating a vignette.');
      return;
    }
    if (!setupReady) {
      const nextTab = missingSetupRequirements[0]?.tab ?? 'contexts';
      setActiveTab('setup');
      setSetupTab(nextTab);
      setInlineError(
        `Before creating a vignette for ${selectedDomain.name}, add ${formatRequirementList(missingSetupRequirements)} in Setup.`,
      );
      return;
    }
    navigate(`/job-choice/new?domainId=${selectedDomain.id}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domains</h1>

      {(domainError || definitionsError) && (
        <ErrorMessage message={`Failed to load domains: ${(domainError ?? definitionsError)?.message ?? 'Unknown error'}`} />
      )}

      {domains.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.definitionCount})</option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => navigate('/domains/manage')}>
            Manage Domains
          </Button>
        </div>
      )}

      <div className="space-y-4">
          {selectedDomain != null && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Domain workspace</p>
                <div className="mt-2">
                  <div>
                    <h2 className="text-2xl font-serif font-medium text-[#1A1A1A]">{selectedDomain.name}</h2>
                  </div>
                </div>
              </div>

              <div role="tablist" aria-label="Domain sections" className="flex border-b border-gray-200">
              {([
                { key: 'overview' as const, label: 'Overview' },
                { key: 'vignettes' as const, label: 'Vignettes' },
                { key: 'setup' as const, label: 'Setup' },
                { key: 'runs' as const, label: 'Runs' },
                { key: 'findings' as const, label: 'Findings' },
              ]).map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  variant="ghost"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-none px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab.key
                      ? 'border-teal-500 text-teal-700 bg-transparent hover:bg-transparent'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-transparent'
                  }`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            </div>
          )}
          {selectedDomain != null && activeTab === 'overview' ? (
            <div className="space-y-4">
              {/* Action bar */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-[#1A1A1A]">Quick actions</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {setupReady
                        ? recommendedPilotCount > 0
                          ? `${recommendedPilotCount} vignette${recommendedPilotCount === 1 ? '' : 's'} ready to pilot.`
                          : `${evaluatedDefinitionCount} vignette${evaluatedDefinitionCount === 1 ? '' : 's'} evaluated.`
                        : `Setup incomplete — needs ${formatRequirementList(missingSetupRequirements)}.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => void handleCreateVignettePair()}>
                      Create Vignette
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => {
                      setActiveTab('setup');
                      setSetupTab(missingSetupRequirements[0]?.tab ?? 'contexts');
                    }}>
                      {setupReady ? 'Review Setup' : 'Fix Setup'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => navigate(`/domains/${selectedDomain.id}/run-trials?scopeCategory=PILOT`)}
                    >
                      Start Pilot
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => navigate(`/domains/${selectedDomain.id}/run-trials?scopeCategory=PRODUCTION`)}
                    >
                      Start Production
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleOpenDomainFindings}
                    >
                      Open Findings
                    </Button>
                  </div>
                </div>
              </div>

              {/* Coverage matrix */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-lg font-medium text-[#1A1A1A]">Value coverage</h3>
                <p className="mt-1 mb-4 text-sm text-gray-600">
                  Batch density across Schwartz value pairs. Green cells (10+ batches) indicate well-covered pairs; red cells (&lt;3) or empty cells show gaps.
                </p>
                <CoverageMatrix domainId={selectedDomain.id} />
              </div>
            </div>
          ) : (selectedDomain == null || activeTab === 'vignettes') ? (
            <>
              {selectedDomain != null && (
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-[#1A1A1A]">Vignette inventory</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Create new vignettes, review inventory, and open any vignette directly to inspect or edit its details.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => void handleCreateVignettePair()}>
                      <Plus className="w-4 h-4 mr-1" />
                      Create Vignette
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Contexts</div>
                      <div className="mt-1 text-2xl font-semibold text-gray-900">{contextsCount}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Value statements</div>
                      <div className="mt-1 text-2xl font-semibold text-gray-900">{valueStatementsCount}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Suggested stage</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {!setupReady
                          ? 'Finish setup before creating or piloting new vignettes'
                          : recommendedPilotCount > 0
                            ? `Pilot ${recommendedPilotCount} new vignette${recommendedPilotCount === 1 ? '' : 's'}`
                            : 'Use runs or findings to inspect existing work'}
                      </div>
                    </div>
                  </div>
                  {!setupReady && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Create vignette is guided by setup coverage. This domain still needs {formatRequirementList(missingSetupRequirements)}.
                      {' '}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActiveTab('setup');
                          setSetupTab(missingSetupRequirements[0]?.tab ?? 'contexts');
                        }}
                        className="inline-flex min-h-0 h-auto px-0 py-0 align-baseline font-semibold underline"
                      >
                        Open the right setup section
                      </Button>
                      .
                    </div>
                  )}
                </div>
              )}
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
                disabled={selectedDomain === null}
              >
                <Play className="w-4 h-4 mr-1" />
                Run Domain Trials
              </Button>
            </div>
            {selectedDomain === null && (
              <p className="text-xs text-teal-800">
                Select a specific domain folder to run domain trials.
              </p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-gray-600">
                {shownCount === null ? '...' : shownCount} vignette{shownCount === 1 ? '' : 's'} shown
                {getFilterSummary(filters) !== '' && ` (${getFilterSummary(filters)})`}
              </div>
              <div className="text-xs text-gray-500">Click a vignette name to open its details.</div>
            </div>

            {inlineError && (
              <div className="text-sm text-red-600">{inlineError}</div>
            )}
            {inconsistentBatchDefinitions.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">
                  Inconsistent batch settings detected on {inconsistentBatchDefinitions.length} vignette
                  {inconsistentBatchDefinitions.length === 1 ? '' : 's'}.
                  Open the vignette to inspect the batch setup before running it again.
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {inconsistentBatchDefinitions.slice(0, 8).map((definition) => (
                    <li key={definition.id}>
                      {definition.name}: {definition.trialConfig?.message ?? 'Inconsistent trial settings.'}
                    </li>
                  ))}
                </ul>
                {inconsistentBatchDefinitions.length > 8 && (
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
                      <th className="py-2 pr-3">Vignette</th>
                      <th className="py-2 pr-3">Version</th>
                      <th className="py-2 pr-3">Temperature</th>
                      <th className="py-2 pr-3">Batches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definitions.map((definition) => (
                      <tr
                        key={definition.id}
                        className={`border-b border-gray-100 ${
                          definition.trialConfig?.isConsistent === false ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="py-2 pr-3 text-gray-600">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-0 h-auto px-0 py-0 text-sm font-medium text-gray-900 underline-offset-2 hover:underline"
                            onClick={() => navigate(`/definitions/${definition.id}`)}
                          >
                            {definition.name}
                          </Button>
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {definition.trialConfig?.definitionVersion ?? definition.version ?? '?'}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">{formatTemperature(definition.trialConfig?.temperature ?? null)}</td>
                        <td className="py-2 pr-3 text-gray-600">{definition.trialCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            </>
          ) : activeTab === 'setup' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-lg font-medium text-[#1A1A1A]">Setup coverage</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Setup defines the reusable ingredients available in this domain. Each vignette must still choose its own configuration explicitly.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Contexts</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{contextsCount}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Value statements</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{valueStatementsCount}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Override review</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      Use the vignette inventory and editor to inspect per-vignette overrides before launch.
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex border-b border-gray-200">
                {([
                  { key: 'contexts' as const, label: 'Contexts' },
                  { key: 'value-statements' as const, label: 'Value Statements' },
                  { key: 'defaults' as const, label: 'Defaults' },
                ]).map((tab) => (
                  <Button
                    key={tab.key}
                    type="button"
                    variant="ghost"
                    onClick={() => setSetupTab(tab.key)}
                    className={`rounded-none px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${setupTab === tab.key
                      ? 'border-teal-500 text-teal-700 bg-transparent hover:bg-transparent'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-transparent'
                    }`}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>

              {setupTab === 'contexts' ? (
                <DomainContexts key={selectedDomain.id} domainId={selectedDomain.id} />
              ) : setupTab === 'value-statements' ? (
                <ValueStatements key={selectedDomain.id} domainId={selectedDomain.id} />
              ) : (
                <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
                  <div>
                    <h3 className="text-lg font-medium text-[#1A1A1A]">Domain defaults</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      When a new vignette is created in this domain, these values pre-populate the form. Each vignette can still override them individually.
                    </p>
                  </div>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default context</label>
                      <select
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        value={formDefaultContextId}
                        onChange={(e) => setFormDefaultContextId(e.target.value)}
                      >
                        <option value="">— none —</option>
                        {(selectedDomainContextsData?.domainContexts ?? []).map((ctx) => (
                          <option key={ctx.id} value={ctx.id}>v{ctx.version}: {ctx.text.slice(0, 60)}{ctx.text.length > 60 ? '…' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default preamble</label>
                      <select
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        value={formDefaultPreambleVersionId}
                        onChange={(e) => setFormDefaultPreambleVersionId(e.target.value)}
                      >
                        <option value="">— none —</option>
                        {(preamblesData?.preambles ?? []).map((p) => (
                          p.latestVersion != null && (
                            <option key={p.latestVersion.id} value={p.latestVersion.id}>{p.name}</option>
                          )
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default level preset</label>
                      <select
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        value={formDefaultLevelPresetVersionId}
                        onChange={(e) => setFormDefaultLevelPresetVersionId(e.target.value)}
                      >
                        <option value="">— none —</option>
                        {(levelPresetsData?.levelPresets ?? []).map((lp) => (
                          lp.latestVersion != null && (
                            <option key={lp.latestVersion.id} value={lp.latestVersion.id}>{lp.name}</option>
                          )
                        ))}
                      </select>
                    </div>
                    {defaultsSaveError != null && (
                      <p className="text-sm text-red-600">{defaultsSaveError}</p>
                    )}
                    {defaultsSaved && (
                      <p className="text-sm text-teal-700">Defaults saved.</p>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={defaultsSaving}
                      onClick={() => void handleSaveDomainDefaults()}
                    >
                      {defaultsSaving ? 'Saving…' : 'Save defaults'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'runs' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-lg font-medium text-[#1A1A1A]">Runs</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Runs is the canonical home for domain evaluations, launch status, and run-scoped diagnostics for this domain.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Pilot-ready vignettes</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{recommendedPilotCount}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Evaluated vignettes</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{evaluatedDefinitionCount}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Status surfaces</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">Domain Evaluation Summary, Run Detail, and global runs list stay distinct.</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => void handleRunDomainTrials()}>
                    <Play className="w-4 h-4 mr-1" />
                    Run Domain Trials
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate('/runs')}>
                    Open All Runs
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-lg font-medium text-[#1A1A1A]">Findings</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Findings is the interpretation surface for domain-level results. Diagnostics remain accessible from runs and vignette detail.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Domain analysis</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      Open auditable domain interpretation for the current domain.
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Coverage</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      Inspect gaps before drawing conclusions or starting another evaluation.
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Cross-run comparison</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      Compare runs globally when you need broader benchmarking.
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" onClick={handleOpenDomainFindings}>
                    Open Domain Findings
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleOpenDomainCoverage}>
                    Open Coverage
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleOpenCompare}>
                    Open Compare
                  </Button>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
