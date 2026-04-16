import { useState, useEffect } from 'react';
import { useQuery } from 'urql';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { useDomainSettings } from '../../hooks/useDomainSettings';
import { ConfigHistorySection } from './ConfigHistorySection';
import { CreateVignettesSection } from './CreateVignettesSection';
import {
  LEVEL_PRESETS_QUERY,
  type LevelPresetsQueryData,
} from '../../api/operations/level-presets';
import {
  DOMAIN_CONTEXTS_QUERY,
  type DomainContextsQueryResult,
} from '../../api/operations/domain-contexts';
import type { SetDomainSettingsMutationVariables } from '../../api/operations/domains';
import { labelFromBody, DEFAULT_SENTENCE_PREFIX } from '@valuerank/shared';
import {
  PREAMBLES_QUERY,
  type Preamble,
  type PreamblesQueryData,
} from '../../api/operations/preambles';

type Props = {
  domainId: string;
  onSaved?: () => void;
};

export function DomainSettingsPanel({ domainId, onSaved }: Props) {
  const { settings, snapshots, loading, saving, error, setDomainSettings } =
    useDomainSettings(domainId);

  const [localPreambleVersionId, setLocalPreambleVersionId] = useState<string | null>(null);
  const [localLevelPresetVersionId, setLocalLevelPresetVersionId] = useState<string | null>(null);
  const [localContextId, setLocalContextId] = useState<string | null>(null);
  const [localSentencePrefix, setLocalSentencePrefix] = useState('');
  const [localLabelPrefix, setLocalLabelPrefix] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync local state when settings load
  useEffect(() => {
    if (settings == null) return;
    setLocalPreambleVersionId(settings.preambleVersionId);
    setLocalLevelPresetVersionId(settings.levelPresetVersionId);
    setLocalContextId(settings.contextId);
    setLocalSentencePrefix(settings.sentencePrefix ?? '');
    setLocalLabelPrefix(settings.labelPrefix ?? '');
    setDrafts({});
    setEditingToken(null);
  }, [settings]);

  const [{ data: preamblesData }] = useQuery<PreamblesQueryData>({
    query: PREAMBLES_QUERY,
  });

  const [{ data: levelPresetsData }] = useQuery<LevelPresetsQueryData>({
    query: LEVEL_PRESETS_QUERY,
  });

  const [{ data: contextsData }] = useQuery<DomainContextsQueryResult>({
    query: DOMAIN_CONTEXTS_QUERY,
    variables: { domainId },
  });

  const preambles = preamblesData?.preambles ?? [];
  const levelPresets = levelPresetsData?.levelPresets ?? [];
  const contexts = contextsData?.domainContexts ?? [];

  const handleSave = async () => {
    if (settings == null) return;
    setSaveError(null);

    const valueStatements = [...settings.valueStatements]
      .sort((a, b) => a.token.localeCompare(b.token))
      .map((vs) => ({
        token: vs.token,
        content: drafts[vs.token] !== undefined ? (drafts[vs.token] as string) : vs.currentContent,
      }));

    const input: SetDomainSettingsMutationVariables = {
      domainId,
      preambleVersionId: localPreambleVersionId,
      levelPresetVersionId: localLevelPresetVersionId,
      contextId: localContextId,
      sentencePrefix: localSentencePrefix !== '' ? localSentencePrefix : null,
      labelPrefix: localLabelPrefix !== '' ? localLabelPrefix : null,
      valueStatements,
    };

    try {
      await setDomainSettings(input);
      setDrafts({});
      setEditingToken(null);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  if (loading && settings == null) {
    return <p className="text-sm text-gray-500 mt-4">Loading settings…</p>;
  }

  if (error != null) {
    return (
      <ErrorMessage message={`Failed to load settings: ${error.message}`} />
    );
  }

  const sortedStatements = [...(settings?.valueStatements ?? [])].sort((a, b) =>
    a.token.localeCompare(b.token)
  );

  const hasPendingChanges =
    Object.keys(drafts).length > 0 ||
    localPreambleVersionId !== (settings?.preambleVersionId ?? null) ||
    localLevelPresetVersionId !== (settings?.levelPresetVersionId ?? null) ||
    localContextId !== (settings?.contextId ?? null) ||
    localSentencePrefix !== (settings?.sentencePrefix ?? '') ||
    localLabelPrefix !== (settings?.labelPrefix ?? '');

  return (
    <div className="space-y-6 mt-6">
      <h3 className="text-base font-medium text-[#1A1A1A] border-t border-gray-200 pt-4">
        Domain Settings
      </h3>

      {saveError != null && <p className="text-sm text-red-600">{saveError}</p>}

      {/* Preamble picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Preamble version</label>
        <select
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          value={localPreambleVersionId ?? ''}
          onChange={(e) => setLocalPreambleVersionId(e.target.value !== '' ? e.target.value : null)}
        >
          <option value="">— none —</option>
          {preambles.map((p) =>
            p.latestVersion != null ? (
              <option key={p.latestVersion.id} value={p.latestVersion.id}>
                {p.name} (v{p.latestVersion.version})
              </option>
            ) : null
          )}
        </select>
      </div>

      {/* Level preset picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Level preset version</label>
        <select
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          value={localLevelPresetVersionId ?? ''}
          onChange={(e) =>
            setLocalLevelPresetVersionId(e.target.value !== '' ? e.target.value : null)
          }
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
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Domain context</label>
          <Link
            to={`/domain-contexts?domainId=${domainId}`}
            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1"
          >
            Manage <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <select
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          value={localContextId ?? ''}
          onChange={(e) => setLocalContextId(e.target.value !== '' ? e.target.value : null)}
        >
          <option value="">— none —</option>
          {contexts.map((ctx) => (
            <option key={ctx.id} value={ctx.id}>
              v{ctx.version}: {ctx.text.slice(0, 60)}{ctx.text.length > 60 ? '…' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Sentence prefix */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sentence prefix</label>
        <p className="text-xs text-gray-500 mb-1">
          Prepended to each value statement body in the prompt.
        </p>
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          placeholder={DEFAULT_SENTENCE_PREFIX}
          value={localSentencePrefix}
          onChange={(e) => setLocalSentencePrefix(e.target.value)}
        />
      </div>

      {/* Value statements */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Value statements</label>
          <Link
            to={`/value-statements?domainId=${domainId}`}
            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1"
          >
            Manage <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        {sortedStatements.length === 0 ? (
          <p className="text-sm text-gray-500">No value statements for this domain.</p>
        ) : (
          <div className="space-y-3">
            {sortedStatements.map((vs) => {
              const isEditing = editingToken === vs.token;
              const draft = drafts[vs.token];
              const displayContent = draft !== undefined ? draft : vs.currentContent;
              const isDirty = draft !== undefined && draft !== vs.currentContent;

              return (
                <div
                  key={vs.token}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-medium text-teal-700 uppercase tracking-wide">
                      {vs.token}
                    </span>
                    {isDirty && (
                      <span className="text-xs text-amber-600 font-medium">modified</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      {vs.previousContent != null && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Previous version:</p>
                          <div className="rounded bg-gray-200 px-2 py-1.5 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                            {vs.previousContent}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Edit:</p>
                        <textarea
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono resize-y"
                          rows={4}
                          value={displayContent}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [vs.token]: e.target.value }))
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingToken(null);
                          }}
                        >
                          Done
                        </Button>
                        {isDirty && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDrafts((prev) => {
                                const next = { ...prev };
                                delete next[vs.token];
                                return next;
                              });
                            }}
                          >
                            Revert
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-sm text-gray-700 cursor-pointer hover:text-teal-700 whitespace-pre-wrap"
                      onClick={() => setEditingToken(vs.token)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setEditingToken(vs.token);
                      }}
                    >
                      {displayContent || <span className="text-gray-400 italic">empty</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scale label prefix */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Scale label prefix</label>
        <p className="text-xs text-gray-500 mb-1">
          Prepended to each value statement in the response scale.
        </p>
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          placeholder="e.g. taking the job with"
          value={localLabelPrefix}
          onChange={(e) => setLocalLabelPrefix(e.target.value)}
        />
      </div>

      {/* Scale label preview */}
      {sortedStatements.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scale label preview</label>
          <p className="text-xs text-gray-500 mb-1">
            Derived from label prefix + value statement bodies. Read-only.
          </p>
          <div className="rounded border border-gray-200 bg-gray-50 p-2 space-y-1">
            {sortedStatements.map((vs) => {
              const body = drafts[vs.token] !== undefined ? (drafts[vs.token] as string) : vs.currentContent;
              const label = labelFromBody(body, localLabelPrefix);
              return (
                <div key={vs.token} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-teal-700 uppercase tracking-wide shrink-0">
                    {vs.token}
                  </span>
                  <span className="text-gray-600">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save button */}
      <div>
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          variant="secondary"
          size="sm"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>

      {/* Config history */}
      <ConfigHistorySection snapshots={snapshots} />

      {settings != null && (
        <CreateVignettesSection
          domainId={domainId}
          valueStatements={settings.valueStatements}
          hasPendingChanges={hasPendingChanges}
        />
      )}
    </div>
  );
}
