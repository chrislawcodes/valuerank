import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { useDomains } from '../hooks/useDomains';

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
                    onClick={() => { setSelectedId(d.id); setRenameName(''); setSuccessMessage(null); }}
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

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-medium text-[#1A1A1A]">Edit domain</h2>
          {selectedDomain == null ? (
            <p className="text-sm text-gray-500">Select a domain from the list to rename or delete it.</p>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
