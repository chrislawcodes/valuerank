import { useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  CREATE_VALUE_STATEMENT_MUTATION,
  DELETE_VALUE_STATEMENT_MUTATION,
  UPDATE_VALUE_STATEMENT_MUTATION,
  VALUE_STATEMENTS_QUERY,
  type ValueStatement,
  type ValueStatementsQueryResult,
  type ValueStatementsQueryVariables,
} from '../api/operations/value-statements';
import {
  DOMAINS_QUERY,
  type DomainsQueryResult,
  type DomainsQueryVariables,
} from '../api/operations/domains';

type NewRow = { localId: string; token: string; body: string };

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ValueStatements() {
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');

  const [{ data: domainsData, fetching: domainsFetching, error: domainsError }] = useQuery<
    DomainsQueryResult,
    DomainsQueryVariables
  >({
    query: DOMAINS_QUERY,
    variables: { limit: 1000, offset: 0 },
  });

  const [{ data, fetching, error }, reexecuteQuery] = useQuery<
    ValueStatementsQueryResult,
    ValueStatementsQueryVariables
  >({
    query: VALUE_STATEMENTS_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
  });

  const [, createValueStatement] = useMutation(CREATE_VALUE_STATEMENT_MUTATION);
  const [, updateValueStatement] = useMutation(UPDATE_VALUE_STATEMENT_MUTATION);
  const [, deleteValueStatement] = useMutation(DELETE_VALUE_STATEMENT_MUTATION);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [savingExisting, setSavingExisting] = useState(false);
  const [savingNewId, setSavingNewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const domains = domainsData?.domains ?? [];
  const statements = data?.valueStatements ?? [];

  const handleDomainChange = (domainId: string) => {
    setSelectedDomainId(domainId);
    setNewRows([]);
    setEditingId(null);
    setEditDraft('');
    setInlineError(null);
  };

  const handleAddRow = () => {
    setInlineError(null);
    setNewRows((current) => [{ localId: makeLocalId(), token: '', body: '' }, ...current]);
  };

  const handleEditStart = (statement: ValueStatement) => {
    setInlineError(null);
    setEditingId(statement.id);
    setEditDraft(statement.body);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const handleSaveEdit = async (id: string) => {
    setInlineError(null);
    setSavingExisting(true);
    try {
      const result = await updateValueStatement({
        id,
        input: { body: editDraft },
      });
      if (result.error) throw result.error;
      setEditingId(null);
      setEditDraft('');
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (saveError) {
      setInlineError(saveError instanceof Error ? saveError.message : 'Failed to update value statement');
    } finally {
      setSavingExisting(false);
    }
  };

  const handleCreateRow = async (row: NewRow) => {
    if (row.token.trim() === '' || row.body.trim() === '') {
      setInlineError('Token and body are required.');
      return;
    }

    setInlineError(null);
    setSavingNewId(row.localId);
    try {
      const result = await createValueStatement({
        input: {
          domainId: selectedDomainId,
          token: row.token.trim(),
          body: row.body,
        },
      });
      if (result.error) throw result.error;
      setNewRows((current) => current.filter((candidate) => candidate.localId !== row.localId));
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (createError) {
      setInlineError(createError instanceof Error ? createError.message : 'Failed to create value statement');
    } finally {
      setSavingNewId(null);
    }
  };

  const handleDelete = async (statement: ValueStatement) => {
    if (!confirm(`Delete value statement "${statement.token}"?`)) return;

    setInlineError(null);
    setDeletingId(statement.id);
    try {
      const result = await deleteValueStatement({ id: statement.id });
      if (result.error) throw result.error;
      if (editingId === statement.id) {
        setEditingId(null);
        setEditDraft('');
      }
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (deleteError) {
      setInlineError(deleteError instanceof Error ? deleteError.message : 'Failed to delete value statement');
    } finally {
      setDeletingId(null);
    }
  };

  if (domainsFetching) {
    return <div className="p-8 text-center text-white/50">Loading domains...</div>;
  }

  if (domainsError) {
    return <ErrorMessage message={`Error loading domains: ${domainsError.message}`} />;
  }

  if (error) {
    return <ErrorMessage message={`Error loading value statements: ${error.message}`} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-teal-200">
            Value Statements
          </h1>
          <p className="text-white/60 mt-1">
            Manage tokenized value statements used during Job Choice vignette assembly.
          </p>
        </div>
        <Button
          onClick={handleAddRow}
          variant="secondary"
          className="flex items-center gap-2"
          disabled={selectedDomainId === ''}
        >
          <Plus className="w-4 h-4" />
          New Statement
        </Button>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-white/70 mb-1">Domain</label>
        <select
          value={selectedDomainId}
          onChange={(event) => handleDomainChange(event.target.value)}
          className="w-full max-w-sm bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-teal-500 outline-none"
        >
          <option value="" disabled>
            Select a domain...
          </option>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </select>
      </div>

      {inlineError && <div className="mb-6"><ErrorMessage message={inlineError} /></div>}

      {selectedDomainId === '' ? (
        <div className="rounded-xl border border-white/10 bg-[#1A1A1A] p-8 text-center text-white/50">
          Select a domain above to manage its value statements.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1A1A]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-black/20">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">Token</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">Body</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/50">Last Updated</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/50">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {newRows.map((row) => {
                  const isSaving = savingNewId === row.localId;
                  return (
                    <tr key={row.localId} className="bg-teal-500/5">
                      <td className="px-4 py-4 align-top">
                        <input
                          type="text"
                          value={row.token}
                          onChange={(event) => {
                            const nextToken = event.target.value;
                            setNewRows((current) =>
                              current.map((candidate) =>
                                candidate.localId === row.localId ? { ...candidate, token: nextToken } : candidate,
                              ),
                            );
                          }}
                          placeholder="token_name"
                          className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                          disabled={isSaving}
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <textarea
                          value={row.body}
                          onChange={(event) => {
                            const nextBody = event.target.value;
                            setNewRows((current) =>
                              current.map((candidate) =>
                                candidate.localId === row.localId ? { ...candidate, body: nextBody } : candidate,
                              ),
                            );
                          }}
                          placeholder="Enter value statement body..."
                          className="min-h-[120px] w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 font-mono text-sm text-white outline-none focus:border-teal-500"
                          disabled={isSaving}
                        />
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-white/40">Unsaved</td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => handleCreateRow(row)}
                            disabled={isSaving}
                            isLoading={isSaving}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setNewRows((current) =>
                                current.filter((candidate) => candidate.localId !== row.localId),
                              )
                            }
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {statements.map((statement) => {
                  const isEditing = statement.id === editingId;
                  const isDeleting = deletingId === statement.id;
                  return (
                    <tr key={statement.id}>
                      <td className="px-4 py-4 align-top">
                        <div className="font-mono text-sm text-teal-300 break-all">{statement.token}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        {isEditing ? (
                          <textarea
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            className="min-h-[120px] w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 font-mono text-sm text-white outline-none focus:border-teal-500"
                            disabled={savingExisting}
                          />
                        ) : (
                          <div className="whitespace-pre-wrap text-sm text-white/80">{statement.body}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="inline-flex items-center gap-1.5 text-sm text-white/50">
                          <Clock className="w-3.5 h-3.5" />
                          {formatTimestamp(statement.updatedAt)}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => handleSaveEdit(statement.id)}
                                disabled={savingExisting || editDraft.trim() === ''}
                                isLoading={savingExisting}
                              >
                                Save
                              </Button>
                              <Button variant="ghost" onClick={handleEditCancel} disabled={savingExisting}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => handleEditStart(statement)}
                                disabled={editingId !== null || savingNewId !== null}
                                className="flex items-center gap-2"
                              >
                                <Pencil className="w-4 h-4" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => handleDelete(statement)}
                                disabled={isDeleting}
                                isLoading={isDeleting}
                                className="flex items-center gap-2 text-red-300 hover:text-red-200 hover:bg-red-400/10"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {newRows.length === 0 && statements.length === 0 && !fetching && (
            <div className="p-8 text-center text-white/50">No value statements for this domain yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
