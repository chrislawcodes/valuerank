import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'urql';
import { Clock, Edit2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  CREATE_DOMAIN_CONTEXT_MUTATION,
  DELETE_DOMAIN_CONTEXT_MUTATION,
  DOMAIN_CONTEXTS_QUERY,
  UPDATE_DOMAIN_CONTEXT_MUTATION,
  type DomainContext,
  type DomainContextsQueryResult,
  type DomainContextsQueryVariables,
} from '../api/operations/domain-contexts';
import {
  DOMAINS_QUERY,
  type DomainsQueryResult,
  type DomainsQueryVariables,
} from '../api/operations/domains';

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function DomainContexts() {
  const [{ data, fetching, error }, reexecuteQuery] = useQuery<DomainContextsQueryResult, DomainContextsQueryVariables>({
    query: DOMAIN_CONTEXTS_QUERY,
    variables: {},
  });
  const [{ data: domainsData, fetching: domainsFetching, error: domainsError }] = useQuery<
    DomainsQueryResult,
    DomainsQueryVariables
  >({
    query: DOMAINS_QUERY,
    variables: { limit: 1000, offset: 0 },
  });
  const [, createDomainContext] = useMutation(CREATE_DOMAIN_CONTEXT_MUTATION);
  const [, updateDomainContext] = useMutation(UPDATE_DOMAIN_CONTEXT_MUTATION);
  const [, deleteDomainContext] = useMutation(DELETE_DOMAIN_CONTEXT_MUTATION);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContext, setEditingContext] = useState<DomainContext | null>(null);
  const [domainId, setDomainId] = useState('');
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const domains = domainsData?.domains ?? [];
  const contexts = data?.domainContexts ?? [];

  const handleOpenCreate = () => {
    setEditingContext(null);
    setDomainId(domains[0]?.id ?? '');
    setText('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (context: DomainContext) => {
    setEditingContext(context);
    setDomainId(context.domainId);
    setText(context.text);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingContext(null);
    setDomainId('');
    setText('');
  };

  const handleDelete = async (context: DomainContext) => {
    if (!confirm(`Are you sure you want to delete the domain context for "${context.domain?.name ?? 'Unknown Domain'}"?`)) {
      return;
    }

    setDeletingId(context.id);
    try {
      const result = await deleteDomainContext({ id: context.id });
      if (result.error) throw result.error;
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete domain context');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingContext != null) {
        const result = await updateDomainContext({
          id: editingContext.id,
          input: { text },
        });
        if (result.error) throw result.error;
      } else {
        const result = await createDomainContext({
          input: { domainId, text },
        });
        if (result.error) throw result.error;
      }

      handleCloseModal();
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (submitError) {
      alert(submitError instanceof Error ? submitError.message : 'Failed to save domain context');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (fetching || domainsFetching) {
    return <div className="p-8 text-center text-white/50">Loading domain contexts...</div>;
  }

  if (error) {
    return <ErrorMessage message={`Error loading domain contexts: ${error.message}`} />;
  }

  if (domainsError) {
    return <ErrorMessage message={`Error loading domains: ${domainsError.message}`} />;
  }

  const isDomainSelectionDisabled = editingContext != null;
  const canSubmit = text.trim() !== '' && domainId !== '' && !isSubmitting && (editingContext != null || domains.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-teal-200">
            Domain Contexts
          </h1>
          <p className="text-white/60 mt-1">
            Manage shared context paragraphs applied across all vignettes in a domain.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          variant="secondary"
          className="flex items-center gap-2"
          disabled={domains.length === 0}
        >
          <Plus className="w-4 h-4" />
          New Context
        </Button>
      </div>

      {domains.length === 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Create at least one domain before adding a context.
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {contexts.map((context) => (
          <div
            key={context.id}
            className="bg-[#1A1A1A] border border-white/10 rounded-xl p-5 hover:border-teal-500/30 transition-colors group"
          >
            <div className="flex justify-between items-start mb-3 gap-3">
              <div>
                <h3 className="font-medium text-white group-hover:text-teal-400 transition-colors">
                  {context.domain?.name ?? 'Unknown Domain'}
                </h3>
                <p className="text-xs text-white/40 mt-1">{context.domainId}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(context)}
                  className="p-1.5 h-auto text-white/40 hover:text-white"
                  title="Edit Context"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(context)}
                  disabled={deletingId === context.id}
                  isLoading={deletingId === context.id}
                  className="p-1.5 h-auto text-white/40 hover:text-red-400 hover:bg-red-400/10"
                  title="Delete Context"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="bg-black/30 rounded-lg p-3 mb-4 min-h-[96px] text-sm text-white/70">
              <div className="whitespace-pre-wrap line-clamp-3">{context.text}</div>
            </div>

            <div className="flex items-center justify-between text-xs text-white/40 border-t border-white/5 pt-3 gap-3">
              <div className="flex items-center gap-1.5" title="Version">
                <RotateCcw className="w-3 h-3" />
                <span>v{context.version}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Last Updated">
                <Clock className="w-3 h-3" />
                <span>{formatTimestamp(context.updatedAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {contexts.length === 0 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#1A1A1A] p-8 text-center text-white/50">
          No domain contexts yet.
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1E1E1E] border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">
                {editingContext ? 'Edit Domain Context' : 'Create Domain Context'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModal}
                className="text-white/40 hover:text-white"
              >
                ✕
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {editingContext && (
                <div className="bg-teal-500/10 border border-teal-500/20 text-teal-300 px-4 py-3 rounded text-sm">
                  Editing increments the version number.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Domain</label>
                <select
                  value={domainId}
                  onChange={(event) => setDomainId(event.target.value)}
                  disabled={isDomainSelectionDisabled}
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-teal-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                >
                  <option value="" disabled>
                    Select a domain
                  </option>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
                {editingContext && (
                  <p className="text-xs text-white/30 mt-1">Domain assignment cannot be changed after creation.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Text</label>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-teal-500 outline-none min-h-[200px]"
                  placeholder="Enter shared domain context..."
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" onClick={handleCloseModal} variant="ghost">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  variant="primary"
                  isLoading={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Context'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
