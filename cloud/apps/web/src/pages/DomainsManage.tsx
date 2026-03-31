import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { gql, useQuery } from 'urql';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { useDomains } from '../hooks/useDomains';
import {
  DOMAIN_CONFIG_SNAPSHOTS_QUERY,
  type DomainConfigSnapshotsQueryResult,
  type DomainConfigSnapshotsQueryVariables,
  type SetDomainSettingsValueStatement,
} from '../api/operations/domains';
import {
  VALUE_STATEMENTS_QUERY,
  type ValueStatementsQueryResult,
  type ValueStatementsQueryVariables,
  type ValueStatement,
} from '../api/operations/value-statements';
import { DOMAIN_CONTEXTS_QUERY, type DomainContext } from '../api/operations/domain-contexts';
import { LEVEL_PRESETS_QUERY, type LevelPresetsQueryData } from '../api/operations/level-presets';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type Preamble = {
  id: string;
  name: string;
  latestVersion: { id: string; version: string } | null;
};

type PreamblesQueryResult = { preambles: Preamble[] };

const PREAMBLES_QUERY = gql`
  query PreamblesForDomainsManage {
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

type DomainContextsQueryResult = { domainContexts: DomainContext[] };
type DomainContextsQueryVariables = { domainId?: string };

// ---------------------------------------------------------------------------
// Domain Settings Panel
// ---------------------------------------------------------------------------

type DomainSettingsPanelProps = {
  domainId: string;
  domainName: string;
  currentPreambleVersionId: string | null;
  currentLevelPresetVersionId: string | null;
  currentContextId: string | null;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
};

function DomainSettingsPanel({
  domainId,
  domainName,
  currentPreambleVersionId,
  currentLevelPresetVersionId,
  currentContextId,
  onSaved,
  onError,
}: DomainSettingsPanelProps) {
  const { setDomainSettings, savingSettings } = useDomains();

  // Picker state
  const [preambleVersionId, setPreambleVersionId] = useState<string>(currentPreambleVersionId ?? '');
  const [levelPresetVersionId, setLevelPresetVersionId] = useState<string>(currentLevelPresetVersionId ?? '');
  const [contextId, setContextId] = useState<string>(currentContextId ?? '');

  // Value statement edits: token → new body
  const [vsEdits, setVsEdits] = useState<Record<string, string>>({});

  // History collapse state
  const [historyOpen, setHistoryOpen] = useState(false);

  // Sync when parent domain changes
  useEffect(() => {
    setPreambleVersionId(currentPreambleVersionId ?? '');
    setLevelPresetVersionId(currentLevelPresetVersionId ?? '');
    setContextId(currentContextId ?? '');
    setVsEdits({});
  }, [domainId, currentPreambleVersionId, currentLevelPresetVersionId, currentContextId]);

  // Fetch picker data
  const [{ data: preamblesData }] = useQuery<PreamblesQueryResult>({ query: PREAMBLES_QUERY });
  const [{ data: levelPresetsData }] = useQuery<LevelPresetsQueryData>({ query: LEVEL_PRESETS_QUERY });
  const [{ data: contextsData }] = useQuery<DomainContextsQueryResult, DomainContextsQueryVariables>({
    query: DOMAIN_CONTEXTS_QUERY,
    variables: { domainId },
  });
  const [{ data: vsData }] = useQuery<ValueStatementsQueryResult, ValueStatementsQueryVariables>({
    query: VALUE_STATEMENTS_QUERY,
    variables: { domainId },
  });
  const [{ data: snapshotsData }] = useQuery<DomainConfigSnapshotsQueryResult, DomainConfigSnapshotsQueryVariables>({
    query: DOMAIN_CONFIG_SNAPSHOTS_QUERY,
    variables: { domainId, limit: 10 },
    pause: !historyOpen,
  });

  const preambles = preamblesData?.preambles ?? [];
  const levelPresets = levelPresetsData?.levelPresets ?? [];
  const contexts = contextsData?.domainContexts ?? [];
  const valueStatements: ValueStatement[] = vsData?.valueStatements ?? [];
  const snapshots = snapshotsData?.domainConfigSnapshots ?? [];

  const handleSave = async () => {
    try {
      const changedVs: SetDomainSettingsValueStatement[] = valueStatements
        .filter((vs) => vs.token in vsEdits && vsEdits[vs.token] !== vs.body)
        .map((vs) => ({ token: vs.token, body: vsEdits[vs.token] ?? vs.body }));

      await setDomainSettings({
        domainId,
        preambleVersionId: preambleVersionId !== '' ? preambleVersionId : null,
        levelPresetVersionId: levelPresetVersionId !== '' ? levelPresetVersionId : null,
        contextId: contextId !== '' ? contextId : null,
        valueStatements: changedVs.length > 0 ? changedVs : undefined,
      });
      onSaved(`Settings saved for "${domainName}".`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="text-base font-medium text-[#1A1A1A] flex items-center gap-2">
        <Settings className="w-4 h-4 text-teal-600" />
        Settings — {domainName}
      </h3>

      {/* Preamble picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Preamble version</label>
        <select
          value={preambleVersionId}
          onChange={(e) => setPreambleVersionId(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">— none —</option>
          {preambles.map((p) =>
            p.latestVersion != null ? (
              <option key={p.latestVersion.id} value={p.latestVersion.id}>
                {p.name} ({p.latestVersion.version})
              </option>
            ) : null
          )}
        </select>
      </div>

      {/* Level preset picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Level preset version</label>
        <select
          value={levelPresetVersionId}
          onChange={(e) => setLevelPresetVersionId(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">— none —</option>
          {levelPresets.map((lp) =>
            lp.latestVersion != null ? (
              <option key={lp.latestVersion.id} value={lp.latestVersion.id}>
                {lp.name} ({lp.latestVersion.version})
              </option>
            ) : null
          )}
        </select>
      </div>

      {/* Context picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Domain context</label>
        <select
          value={contextId}
          onChange={(e) => setContextId(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">— none —</option>
          {contexts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.text.slice(0, 60)}{c.text.length > 60 ? '…' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Value statements */}
      {valueStatements.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Value statements</label>
          <div className="space-y-3">
            {valueStatements.map((vs) => {
              const edited = vsEdits[vs.token];
              const currentBody = edited ?? vs.body;
              const changed = edited !== undefined && edited !== vs.body;
              return (
                <div key={vs.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                      {vs.token}
                    </span>
                    {changed && (
                      <span className="text-xs text-amber-600 font-medium">modified</span>
                    )}
                  </div>
                  {changed && (
                    <p className="text-xs text-gray-400 line-through">{vs.body}</p>
                  )}
                  <textarea
                    value={currentBody}
                    onChange={(e) => setVsEdits((prev) => ({ ...prev, [vs.token]: e.target.value }))}
                    rows={3}
                    className={`w-full px-2 py-1.5 border rounded text-sm resize-none ${
                      changed ? 'border-amber-400' : 'border-gray-300'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save button */}
      <Button
        onClick={() => void handleSave()}
        disabled={savingSettings}
        className="w-full"
        variant="secondary"
      >
        {savingSettings ? 'Saving…' : 'Save Settings'}
      </Button>

      {/* Config history */}
      <div className="pt-2 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex items-center gap-1 !px-0 text-sm text-gray-500 hover:text-gray-700"
        >
          {historyOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Config history
        </Button>
        {historyOpen && (
          <ul className="mt-2 divide-y divide-gray-100 text-xs text-gray-600">
            {snapshots.length === 0 ? (
              <li className="py-2 text-gray-400">No snapshots yet.</li>
            ) : (
              snapshots.map((s) => (
                <li key={s.id} className="py-1.5 flex items-center gap-2">
                  <span className="font-mono text-gray-400">{s.fingerprint.slice(0, 8)}</span>
                  <span>{new Date(s.createdAt).toLocaleString()}</span>
                  <span className="text-gray-400">
                    {s.valueStatementVersionIds.length} VS
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DomainsManage() {
  const {
    domains,
    queryLoading,
    creating,
    renaming,
    deleting,
    error,
    createDomain,
    renameDomain,
    deleteDomain,
  } = useDomains();

  const [createName, setCreateName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'edit' | 'settings'>('edit');

  const selectedDomain = domains.find((d) => d.id === selectedId) ?? null;

  const handleCreate = async () => {
    setInlineError(null);
    setSuccessMessage(null);
    if (createName.trim() === '') return;
    try {
      const created = await createDomain(createName.trim());
      setCreateName('');
      if (created?.id != null) setSelectedId(created.id);
      setSuccessMessage(`Domain "${createName.trim()}" created.`);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to create domain');
    }
  };

  const handleRename = async () => {
    if (selectedDomain == null || renameName.trim() === '') return;
    setInlineError(null);
    setSuccessMessage(null);
    try {
      await renameDomain(selectedDomain.id, renameName.trim());
      setRenameName('');
      setSuccessMessage(`Domain renamed to "${renameName.trim()}".`);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to rename domain');
    }
  };

  const handleDelete = async () => {
    if (selectedDomain == null) return;
    const ok = window.confirm(
      `Delete domain "${selectedDomain.name}"? Attached vignettes will be moved to unassigned.`
    );
    if (!ok) return;
    setInlineError(null);
    setSuccessMessage(null);
    try {
      await deleteDomain(selectedDomain.id);
      setSelectedId(null);
      setRenameName('');
      setSuccessMessage('Domain deleted.');
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to delete domain');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Manage Domains</h1>

      {error != null && <ErrorMessage message={`Failed to load domains: ${error.message}`} />}
      {inlineError != null && <p className="text-sm text-red-600">{inlineError}</p>}
      {successMessage != null && <p className="text-sm text-teal-700">{successMessage}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: domain list + create */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-lg font-medium text-[#1A1A1A]">Domains</h2>
          {queryLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-gray-500">No domains yet. Create one below.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {domains.map((d) => (
                <li key={d.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelectedId(d.id);
                      setRenameName('');
                      setSuccessMessage(null);
                      setSettingsTab('edit');
                    }}
                    className={`w-full !justify-start px-3 py-2.5 text-sm rounded-md ${
                      selectedId === d.id
                        ? 'bg-teal-50 text-teal-800 font-medium hover:bg-teal-50'
                        : 'text-gray-700'
                    }`}
                  >
                    <span>{d.name}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {d.definitionCount} vignette{d.definitionCount === 1 ? '' : 's'}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-3 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Create domain</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate(); } }}
                placeholder="New domain name"
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <Button
                onClick={() => void handleCreate()}
                size="sm"
                variant="secondary"
                disabled={creating || createName.trim() === ''}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: edit + settings tabs */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          {selectedDomain == null ? (
            <>
              <h2 className="text-lg font-medium text-[#1A1A1A]">Edit domain</h2>
              <p className="text-sm text-gray-500">Select a domain from the list to rename, delete, or configure it.</p>
            </>
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex border-b border-gray-200 -mx-5 px-5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSettingsTab('edit')}
                  className={`pb-2 mr-4 !px-0 !rounded-none text-sm font-medium border-b-2 transition-colors ${
                    settingsTab === 'edit'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSettingsTab('settings')}
                  className={`pb-2 !px-0 !rounded-none text-sm font-medium border-b-2 transition-colors ${
                    settingsTab === 'settings'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Settings
                </Button>
              </div>

              {settingsTab === 'edit' ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">
                    Selected: <span className="font-medium">{selectedDomain.name}</span>
                    {' '}<span className="text-gray-400">
                      ({selectedDomain.definitionCount} vignette{selectedDomain.definitionCount === 1 ? '' : 's'})
                    </span>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rename</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleRename(); } }}
                        placeholder={selectedDomain.name}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                      <Button
                        onClick={() => void handleRename()}
                        size="sm"
                        variant="secondary"
                        disabled={renaming || renameName.trim() === ''}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <Button
                      onClick={() => void handleDelete()}
                      size="sm"
                      variant="secondary"
                      className="text-red-600 hover:text-red-700"
                      disabled={deleting}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete domain
                    </Button>
                    <p className="mt-1 text-xs text-gray-500">
                      Attached vignettes will be moved to unassigned.
                    </p>
                  </div>
                </div>
              ) : (
                <DomainSettingsPanel
                  domainId={selectedDomain.id}
                  domainName={selectedDomain.name}
                  currentPreambleVersionId={selectedDomain.defaultPreambleVersionId}
                  currentLevelPresetVersionId={selectedDomain.defaultLevelPresetVersionId}
                  currentContextId={selectedDomain.defaultContextId}
                  onSaved={(msg) => setSuccessMessage(msg)}
                  onError={(msg) => setInlineError(msg)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
